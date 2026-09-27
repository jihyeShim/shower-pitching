// Renderer, camera, lights, the tiled shower room and the post chain (space owner).
// Warm state is a bright morning shower; cold slides to icy blue. Other scene modules receive the object
// returned by init() and add to world.scene. Every warm/cold visual reads world.getCold() per frame.
// View: first person from inside the founder's shower stall, looking at the VC tub.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { bus } from '../bus.js';
import { BAND_COLD, COLD_EASE_SECONDS } from '../config.js';

// World units are meters. The founder stands at the origin side (z negative), the tub is in front (z positive).
export const LAYOUT = {
  room: { w: 10, h: 3.6, d: 12 },
  stall: { x: 0, z: -3.2, w: 1.6, d: 1.4, h: 2.4 },
  tub: { x: 0, z: 1.2, w: 4.2, d: 2.4, h: 0.75 },
  camera: { pos: [0, 1.62, -3.25], target: [0, 1.0, 1.2], fov: 62 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const ss = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

// Glazed tiles (style A): colour map, bump map (grout recessed) and roughness map (grout rough, glaze smooth).
// Space 2 may import this for the bath mosaic, e.g. tileTextures({ tile: '#2f8c8a', grout: '#cfe3dc', tiles: 16, vary: 0.12 }).
export function tileTextures({ tile = '#efe4d6', grout = '#a89886', tiles = 8, repeat = [1, 1], vary = 0.05, size = 512 } = {}) {
  const mkc = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return [c, c.getContext('2d')];
  };
  const [c, g] = mkc();
  const [b, gb] = mkc();
  const [r, gr] = mkc();
  g.fillStyle = grout;
  g.fillRect(0, 0, size, size);
  gb.fillStyle = '#000';
  gb.fillRect(0, 0, size, size);
  gr.fillStyle = '#fff';
  gr.fillRect(0, 0, size, size);
  const step = size / tiles;
  const gap = Math.max(2, step * 0.07);
  const base = new THREE.Color(tile);
  for (let y = 0; y < tiles; y++)
    for (let x = 0; x < tiles; x++) {
      const col = base.clone().offsetHSL(rand(-0.008, 0.008), rand(-vary, vary), rand(-vary, vary));
      const x0 = x * step + gap / 2, y0 = y * step + gap / 2, s = step - gap;
      g.fillStyle = '#' + col.getHexString();
      g.fillRect(x0, y0, s, s);
      const gl = g.createLinearGradient(x0, y0, x0 + s, y0 + s);
      gl.addColorStop(0, 'rgba(255,255,255,0.22)');
      gl.addColorStop(0.45, 'rgba(255,255,255,0)');
      gl.addColorStop(1, 'rgba(0,0,0,0.08)');
      g.fillStyle = gl;
      g.fillRect(x0, y0, s, s);
      gb.fillStyle = '#bbb';
      gb.fillRect(x0, y0, s, s);
      gb.fillStyle = '#fff';
      gb.fillRect(x0 + 2, y0 + 2, s - 4, s - 4);
      const rv = (70 + Math.random() * 30) | 0;
      gr.fillStyle = `rgb(${rv},${rv},${rv})`;
      gr.fillRect(x0, y0, s, s);
    }
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(c, true), bump: mk(b, false), rough: mk(r, false) };
}

// Back-compat single colour map (js/scene/vcs.js imports this).
export function tileTexture({ tile = '#eaf4f8', grout = '#b3c4cb', tiles = 12, repeat = [1, 1] } = {}) {
  return tileTextures({ tile, grout, tiles, repeat }).map;
}

// Full-screen "looking through wet shower glass" pass.
// Procedural beading drops + occasional sliding streaks (refraction, rim, specular),
// condensation haze wiped by streak trails, frost crystals creeping in from the edges,
// and a warm/cold colour grade with a warm pocket that keeps the hot bath warm.
// Runs on the linear HDR buffer before OutputPass (tone mapping happens after).

export const WetGlassShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSlideTime: { value: 0 }, // advances slower as it freezes, so streaks stop
    uCold: { value: 0 }, // 0 warm grade, 1 cold grade
    uFrost: { value: 0 }, // 0..1 frost growth from edges
    uFreeze: { value: 0 }, // 0..1 drops turn to ice beads
    uHaze: { value: 1 }, // condensation fog on the glass
    uWarmPos: { value: new THREE.Vector2(0.5, 0.45) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uSlideTime, uCold, uFrost, uFreeze, uHaze;
    uniform vec2 uWarmPos;
    varying vec2 vUv;

    float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
    float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
    float voronoiEdge(vec2 p) {
      vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y)); vec2 o = hash22(i + g);
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
      return d2 - d1;
    }

    // Beading drops on a jittered grid. xy = lens normal (0 centre, 1 rim), z = mask.
    vec3 beads(vec2 st, float scale, float t, float seed, float density) {
      vec2 p = st * scale; vec2 id = floor(p); vec2 f = fract(p) - 0.5;
      vec2 h = hash22(id + seed); vec2 h2 = hash22(id + seed + 7.31);
      float r = mix(0.10, 0.30, h.x * h.x);
      float life = fract(t * mix(0.02, 0.07, h.y) + h2.x * 5.0);
      r *= ss(0.0, 0.2, life) * ss(1.0, 0.9, life);
      float exist = step(1.0 - density, hash12(id + seed + 3.1));
      vec2 c = (h2 - 0.5) * max(0.0, 0.9 - 2.0 * r);
      vec2 d = f - c; d.y *= 1.0 + 0.25 * h.y; // gravity sag
      float rr = max(r, 1e-3);
      float m = ss(1.0, 0.72, length(d) / rr) * exist * step(0.01, r);
      return vec3(d / rr * m, m);
    }

    // Sliding streak drops. xy normal, z mask; wipe = trail that clears the haze.
    vec3 slide(vec2 st, float t, float seed, float cols, out float wipe) {
      float colId = floor(st.x * cols);
      float n = hash12(vec2(colId, seed));
      float tt = t * mix(0.07, 0.16, n) + n * 13.0;
      float cycle = floor(tt), ph = fract(tt);
      float isOn = step(0.62, hash12(vec2(colId + 0.5, cycle + seed)));
      // stick-slip motion: monotonic, speed wobbles between ~0.1x and ~1.9x
      float g = ph - 0.9 * sin(ph * 25.1327) / 25.1327;
      float yh = 1.15 - 1.5 * g;
      float cx = (colId + 0.5 + (n - 0.5) * 0.5) / cols + sin(st.y * 23.0 + n * 6.0) * 0.004 + sin(st.y * 7.0 + n * 3.0) * 0.006;
      float dx = st.x - cx;
      float headR = mix(0.010, 0.019, n);
      vec2 d = vec2(dx, (st.y - yh) * 0.75);
      float headM = ss(headR, headR * 0.65, length(d));
      float above = st.y - yh;
      float trailLen = mix(0.25, 0.55, n);
      float inTrail = step(0.0, above) * ss(trailLen, 0.0, above);
      float trailW = headR * 0.75;
      wipe = ss(trailW * 1.6, trailW * 0.4, abs(dx)) * inTrail * isOn;
      // small droplets left behind in the trail
      float row = floor(st.y * 45.0 + n * 3.0);
      float tr = headR * mix(0.2, 0.5, hash12(vec2(colId, row))) * step(0.45, hash12(vec2(row, colId + 9.0)));
      vec2 td = vec2(dx, (fract(st.y * 45.0 + n * 3.0) - 0.5) / 45.0);
      float tdm = ss(max(tr, 1e-4), max(tr, 1e-4) * 0.6, length(td)) * inTrail * step(1e-4, tr);
      vec2 nrm = d / headR * headM + td / max(tr, 1e-4) * tdm;
      return vec3(nrm, max(headM, tdm)) * isOn;
    }

    vec3 blurAt(vec2 uv, float r) {
      vec2 px = r / uRes; vec3 c = texture2D(tDiffuse, uv).rgb; float w = 1.0;
      for (int i = 0; i < 10; i++) {
        float fi = float(i); float a = fi * 2.39996; float rad = sqrt(fi + 0.5) / 3.2;
        c += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * px * rad * 1.0).rgb; w += 1.0;
      }
      return c / w;
    }

    void main() {
      float aspect = uRes.x / uRes.y;
      vec2 st = vec2(vUv.x * aspect, vUv.y);
      float t = uTime;

      // ----- water on the glass -----
      vec3 b1 = beads(st, 26.0, t, 1.0, 0.55);
      vec3 b2 = beads(st + 0.37, 55.0, t * 1.3, 7.0, 0.5);
      vec3 b3 = beads(st + 0.11, 11.0, t * 0.7, 3.0, 0.22);
      float w1, w2;
      vec3 s1 = slide(st, uSlideTime, 2.0, 7.0, w1);
      vec3 s2 = slide(st + vec2(0.071, 0.0), uSlideTime * 0.83, 5.0, 11.0, w2);
      vec2 nrm = b1.xy + b2.xy * 0.7 + b3.xy + s1.xy + s2.xy * 0.8;
      float dropM = clamp(max(max(b1.z, b2.z), max(b3.z, max(s1.z, s2.z))), 0.0, 1.0);
      float wipe = clamp(max(w1, w2), 0.0, 1.0);

      // warm pocket around the hot bath
      float wp = ss(0.46, 0.0, length((vUv - uWarmPos) * vec2(aspect, 1.3)));

      // ----- frost -----
      float edgeBox = 1.0 - max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
      float edgeRad = 1.0 - length((vUv - 0.5) * vec2(1.0, 0.9)) * 1.35;
      float e = mix(edgeBox, edgeRad, 0.5);
      float nF = fbm(st * 4.0);
      float frostM = 0.0; float crystal = 0.0; vec2 frostOff = vec2(0.0);
      if (uFrost > 0.001) {
        float ee = e + (nF - 0.5) * 0.5 + wp * 0.3;
        float front = uFrost * 0.55;
        frostM = ss(front, front - 0.14, ee) * ss(0.0, 0.12, uFrost) * (1.0 - 0.95 * wp) * (1.0 - 0.6 * ss(0.3, 0.75, e));
        float v1 = voronoiEdge(st * 13.0 + nF * 2.0);
        float v2 = voronoiEdge(st * 36.0 + nF * 3.0);
        float feather = pow(noise(vec2(dot(st, vec2(0.8, 0.6)) * 70.0, dot(st, vec2(-0.6, 0.8)) * 5.0)), 3.0);
        crystal = clamp(ss(0.07, 0.0, v1) * 0.8 + ss(0.05, 0.0, v2) * 0.5 + feather * 0.7, 0.0, 1.0);
        frostOff = (vec2(noise(st * 38.0), noise(st * 38.0 + 5.3)) - 0.5) * 0.03 * frostM;
      }

      float refr = mix(0.022, 0.008, uFreeze);
      vec2 off = -nrm * refr * (1.0 - frostM);
      vec2 uv2 = clamp(vUv + off + frostOff, 0.001, 0.999);
      vec3 col;
      col.r = texture2D(tDiffuse, uv2 + off * 0.12).r;
      col.g = texture2D(tDiffuse, uv2).g;
      col.b = texture2D(tDiffuse, uv2 - off * 0.12).b;

      // condensation haze: denser at the edges and bottom, cleared inside drops and trails
      float hazeShape = 0.03 + 0.7 * ss(0.5, 0.0, e) + 0.15 * ss(0.3, 0.0, vUv.y);
      float haze = uHaze * hazeShape * (1.0 - wipe * 0.9) * (1.0 - dropM * 0.85) * (1.0 - frostM);
      if (haze > 0.01) {
        vec3 hb = blurAt(vUv, 14.0);
        col = mix(col, hb * 1.06 + vec3(0.05, 0.055, 0.06) * uHaze, clamp(haze, 0.0, 0.5));
      }

      // drop shading: dark rim, bright body, top-left specular
      float len = length(nrm);
      col *= 1.0 + 0.14 * dropM;
      col *= 1.0 - 0.16 * ss(0.6, 1.0, len) * dropM;
      vec2 nd = nrm / max(len, 1e-3);
      float spec = pow(max(0.0, dot(nd, normalize(vec2(-0.45, 0.9)))), 10.0) * ss(0.35, 0.85, len) * dropM;
      col += spec * mix(vec3(1.1, 1.1, 1.1), vec3(0.9, 1.05, 1.3), uCold) * 1.1;
      // frozen drops: milky ice beads
      col = mix(col, vec3(0.75, 0.88, 1.0) * (0.8 + 0.4 * len), dropM * uFreeze * 0.55);

      // ----- grade -----
      float coldAmt = uCold * (1.0 - 0.7 * wp);
      // Morning grade: clean cool-neutral room, golden pocket of light around the hot bath.
      vec3 dayG = col * vec3(0.99, 1.01, 1.04) + vec3(0.012, 0.014, 0.018);
      vec3 goldG = col * vec3(1.2, 1.0, 0.74) + vec3(0.085, 0.045, 0.0);
      vec3 warmG = mix(dayG, goldG, ss(0.0, 0.6, wp) * 0.9);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 coldG = mix(vec3(l), col, 0.55) * vec3(0.72, 0.93, 1.28) + vec3(0.0, 0.006, 0.02);
      col = mix(warmG, coldG, coldAmt);
      col = pow(max(col, 0.0), vec3(mix(1.12, 1.1, uCold))) * 1.06;

      // ----- frost on top -----
      if (frostM > 0.0) {
        vec3 fb = blurAt(uv2, 9.0);
        vec3 fl = mix(fb * vec3(0.8, 0.95, 1.2), vec3(0.78, 0.9, 1.05) * (0.7 + 0.7 * crystal), 0.45 + 0.35 * crystal);
        float frontRim = frostM * (1.0 - frostM) * 4.0;
        fl += vec3(0.25, 0.35, 0.45) * frontRim * 0.5;
        float sp = step(0.994, hash12(floor(gl_FragCoord.xy / 2.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash12(floor(gl_FragCoord.xy / 2.0) + 1.0) * 60.0));
        fl += vec3(1.6) * sp * crystal;
        col = mix(col, fl, frostM * (0.7 + 0.3 * crystal));
      }

      // vignette, tinted with the temperature
      float vig = ss(1.2, 0.3, length((vUv - 0.5) * vec2(aspect * 0.8, 1.0)));
      col *= mix(mix(vec3(0.82, 0.85, 0.88), vec3(0.3, 0.4, 0.55), uCold), vec3(1.0), vig);

      // grain
      col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.02;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

// Derived look values from coldness, same curves as style A (heat = 1 - cold).
export function mood(cold) {
  const heat = 1 - cold;
  return {
    heat,
    cold,
    steam: ss(heat, 0.35, 0.9),
    frost: 1 - ss(heat, 0.0, 0.5),
    freeze: 1 - ss(heat, 0.1, 0.45),
  };
}

export function init(container) {
  const PR = Math.min(devicePixelRatio, 1.5);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(PR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fogWarm = new THREE.Color('#dfe6e9'), fogCold = new THREE.Color('#7893ab');
  scene.fog = new THREE.FogExp2(fogWarm.clone(), 0.028);
  scene.background = fogWarm.clone();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const { pos, target, fov } = LAYOUT.camera;
  const camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(...pos);
  camera.lookAt(...target);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#c4ced3', 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#f3f7ff', 1.8);
  key.position.set(2, 5, -1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 14 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  // Bath lights (pendant, fill, rim), the pendant globe, tub, candles, ducks and tub steam live in vcs.js (space 2).
  // Founder side light shifts with the water temperature.
  const stallLight = new THREE.PointLight('#fff6ec', 3, 0, 2);
  stallLight.position.set(0, 2.25, -2.9);
  scene.add(stallLight);
  const stallWarm = new THREE.Color('#fff6ec'), stallCold = new THREE.Color('#8cc4ff');
  const hemiWarm = new THREE.Color('#ffffff'), hemiCold = new THREE.Color('#cfe0f2');
  const keyWarm = new THREE.Color('#f3f7ff'), keyCold = new THREE.Color('#cfe3ff');

  // ---------------------------------------------------------------- room
  const { w, h, d } = LAYOUT.room;
  const reflector = new Reflector(new THREE.PlaneGeometry(w, d), {
    textureWidth: innerWidth * PR * 0.5, textureHeight: innerHeight * PR * 0.5, color: 0xb4bcc0, clipBias: 0.003,
  });
  reflector.rotation.x = -Math.PI / 2;
  scene.add(reflector);
  const floorTex = tileTextures({ tile: '#eef1f2', grout: '#b3bec3', tiles: 6, repeat: [w / 1.2, d / 1.2] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({
    map: floorTex.map, bumpMap: floorTex.bump, bumpScale: 1.5, roughnessMap: floorTex.rough, roughness: 0.55,
    transparent: true, opacity: 0.62, depthWrite: false,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  scene.add(floor);

  const wallMat = (width) => {
    const tt = tileTextures({ tile: '#f7f8f8', grout: '#cfd7da', tiles: 8, vary: 0.02, repeat: [width / 1.6, h / 1.6] });
    return new THREE.MeshStandardMaterial({ map: tt.map, bumpMap: tt.bump, bumpScale: 1.2, roughnessMap: tt.rough, roughness: 0.5 });
  };
  const far = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat(w));
  far.position.set(0, h / 2, d / 2 - 2);
  far.rotation.y = Math.PI;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat(d));
  left.rotation.y = Math.PI / 2;
  left.position.set(-w / 2, h / 2, 0);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat(d));
  right.rotation.y = -Math.PI / 2;
  right.position.set(w / 2, h / 2, 0);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: '#f5f7f8', roughness: 0.8 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  for (const m of [far, left, right]) m.receiveShadow = true;
  scene.add(far, left, right, ceiling);

  // Wall sconces: bloom sources on the far wall.
  const glow = (col, k) => new THREE.MeshStandardMaterial({ color: '#000', emissive: col, emissiveIntensity: k });
  for (const sx of [-2.6, 2.6]) {
    const sconce = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 6, 16), glow('#ffd2a0', 1.8));
    sconce.position.set(sx, 2.15, d / 2 - 2.06);
    scene.add(sconce);
  }
  // Towel rail + towel: bathroom cue.
  const chrome = new THREE.MeshStandardMaterial({ color: '#f2f4f5', metalness: 1, roughness: 0.1 });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 12), chrome);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(-1.4, 1.5, d / 2 - 2.05);
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: '#fff7ec', roughness: 1 }));
  towel.position.set(-1.4, 1.12, d / 2 - 2.08);
  scene.add(rail, towel);

  // ---------------------------------------------------------------- post
  const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(PR);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.24, 0.45, 1.7));
  const wet = new ShaderPass(WetGlassShader);
  composer.addPass(wet);
  composer.addPass(new OutputPass());
  const U = wet.uniforms;

  const T = LAYOUT.tub;
  function updateWarmPos() {
    const p = new THREE.Vector3(T.x, 1.2, T.z + 0.3).project(camera);
    U.uWarmPos.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    U.uRes.value.set(innerWidth * PR, innerHeight * PR);
  }
  updateWarmPos();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    reflector.getRenderTarget().setSize(innerWidth * PR * 0.5, innerHeight * PR * 0.5);
    updateWarmPos();
  });

  // ---------------------------------------------------------------- loop
  // Shared eased coldness (0 warm .. 1 frozen). Read it with world.getCold().
  let cold = 0;
  let coldTarget = 0;
  bus.on('temp', ({ band }) => (coldTarget = BAND_COLD[band] ?? coldTarget));

  const frameFns = new Set();
  const failed = new WeakSet();
  const clock = new THREE.Clock();
  let slideTime = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    cold += Math.sign(coldTarget - cold) * Math.min(Math.abs(coldTarget - cold), dt / COLD_EASE_SECONDS);
    const m = mood(cold);

    // Founder side of the room cools; bath side is untouched.
    stallLight.color.copy(stallWarm).lerp(stallCold, cold);
    stallLight.intensity = lerp(3, 4.5, cold);
    key.color.copy(keyWarm).lerp(keyCold, cold * 0.8);
    key.intensity = lerp(1.8, 0.8, cold);
    hemi.intensity = lerp(1.1, 0.35, cold);
    hemi.color.copy(hemiWarm).lerp(hemiCold, cold);
    scene.fog.color.copy(fogWarm).lerp(fogCold, cold);
    scene.fog.density = lerp(0.012, 0.018, cold);
    scene.background.copy(scene.fog.color);

    slideTime += dt * ss(m.heat, 0.15, 0.6);
    U.uTime.value = t;
    U.uSlideTime.value = slideTime;
    U.uCold.value = cold;
    U.uFrost.value = m.frost;
    U.uFreeze.value = m.freeze;
    U.uHaze.value = 0.12 + 0.3 * m.steam;

    for (const fn of frameFns) {
      try {
        fn(dt, t);
      } catch (e) {
        if (!failed.has(fn)) console.error('[world] frame handler failed', e);
        failed.add(fn);
      }
    }
    composer.render(dt);
  });

  return {
    THREE,
    scene,
    camera,
    renderer,
    layout: LAYOUT,
    getCold: () => cold,
    onFrame(fn) {
      frameFns.add(fn);
      return () => frameFns.delete(fn);
    },
  };
}
