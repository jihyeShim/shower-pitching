// The stall around the viewer, rain head overhead, water falling past the lens that turns to snow,
// and steam in the stall and the room air (space owner). Look ported from samples/style-a props.js;
// clear duck-print curtain from samples/style-c. Everything reads world.getCold() every frame.
// The tub steam belongs to vcs.js (space 2).
import * as THREE from 'three';
import { bus } from '../bus.js';
import { mood } from './world.js';

const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
};
const rand = (a, b) => a + Math.random() * (b - a);

function steamTexture() {
  const s = 256;
  const [c, g] = canvas(s, s);
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * s * 0.2;
    const x = s / 2 + Math.cos(a) * rr, y = s / 2 + Math.sin(a) * rr * 0.8;
    const rad = s * rand(0.1, 0.28);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.11)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
  // fade the square edge out
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawDuck(g, x, y, s, flip) {
  g.save();
  g.translate(x, y);
  g.scale(flip ? -1 : 1, 1);
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.ellipse(0, s * 0.35, s * 0.9, s * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.75, s * 0.2);
  g.lineTo(-s * 1.15, -s * 0.15);
  g.lineTo(-s * 0.55, s * 0.0);
  g.fill();
  g.beginPath();
  g.arc(s * 0.35, -s * 0.35, s * 0.45, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff8c2b';
  g.beginPath();
  g.ellipse(s * 0.85, -s * 0.25, s * 0.3, s * 0.13, 0.15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(s * 0.45, -s * 0.47, s * 0.08, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2b400';
  g.beginPath();
  g.ellipse(-s * 0.1, s * 0.3, s * 0.45, s * 0.24, -0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// Clear vinyl curtain with printed rubber ducks and bubbles (style C).
function duckCurtain() {
  const [c, g] = canvas(512, 1024);
  g.fillStyle = 'rgba(222,246,250,0.26)';
  g.fillRect(0, 0, 512, 1024);
  for (let x = 0; x < 512; x += 36) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x, 0, 8, 1024);
  }
  const rows = 7;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < 3; k++) {
      const x = ((k + 0.5 + (r % 2 ? 0.5 : 0)) * 512) / 3;
      const y = ((r + 0.5) * 1024) / rows;
      drawDuck(g, x % 512, y, 38, (r + k) % 2 === 0);
    }
  g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(110,200,235,0.75)';
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 1024, 4 + Math.random() * 9, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function createStall(scene, L) {
  const { x, z, w, d, h } = L.stall;
  const front = z + d / 2;
  const chrome = new THREE.MeshStandardMaterial({ color: '#f2f4f5', metalness: 1, roughness: 0.08 });

  // Glass side panels with painted droplets.
  const [c, g] = canvas(256, 512);
  g.fillStyle = 'rgba(225,240,245,0.28)';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 380; i++) {
    const px = Math.random() * 256, py = Math.random() * 512, pr = rand(1, 5.5);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(px, py, pr, pr * 1.15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(px - pr * 0.4, py - pr * 0.5, 1.2, 1.2);
  }
  const glassTex = new THREE.CanvasTexture(c);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.MeshPhysicalMaterial({
    map: glassTex, transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0, clearcoat: 1,
    envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(d, h), glass);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(x + side * (w / 2), h / 2, z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.035), chrome);
    frame.position.set(x + side * (w / 2), h / 2, front);
    scene.add(panel, frame);
  }

  // Rail, chrome rings and a clear duck-print vinyl curtain bunched on screen right (world -x).
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, w, 12), chrome);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(x, h, front);
  scene.add(rail);
  const cw = 0.5, chh = h - 0.1;
  const cgeo = new THREE.PlaneGeometry(cw, chh, 30, 6);
  const cBase = cgeo.attributes.position.array.slice();
  const curtainMat = new THREE.MeshPhysicalMaterial({
    map: duckCurtain(), transparent: true, side: THREE.DoubleSide, roughness: 0.15, clearcoat: 1, depthWrite: false,
  });
  const curtain = new THREE.Mesh(cgeo, curtainMat);
  curtain.position.set(x - w / 2 + cw / 2 + 0.03, h - 0.05 - chh / 2, front + 0.02);
  curtain.renderOrder = 3;
  scene.add(curtain);
  const ringGeo = new THREE.TorusGeometry(0.03, 0.005, 8, 20);
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(ringGeo, chrome);
    ring.position.set(curtain.position.x - cw / 2 + (i / 6) * cw, h - 0.02, front);
    scene.add(ring);
  }

  // Chrome rain head on an arm from the back wall.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 48), chrome);
  head.position.set(x, h - 0.1, z + 0.25);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 12), chrome);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(x, h - 0.07, z - 0.2);
  scene.add(head, arm);

  // Shampoo bottles on a chrome caddy, right side.
  ['#ff8fb1', '#7cc6ff', '#ffd166'].forEach((col, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 16),
      new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1 }));
    b.position.set(x + w / 2 - 0.1, 1.05, z - 0.3 - i * 0.12);
    scene.add(b);
  });

  const warmGlass = new THREE.Color('#ffffff'), frostGlass = new THREE.Color('#dcecff');
  const warmVinyl = new THREE.Color('#ffffff'), frostVinyl = new THREE.Color('#dcecff');
  return {
    update(dt, t, s) {
      const p = cgeo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const u = cBase[i], v = cBase[i + 1];
        const hang = (chh / 2 - v) / chh; // 0 at the rail, 1 at the hem
        p[i + 2] = Math.sin(u * 55) * 0.03 + Math.sin(t * 1.4 + v * 2) * 0.02 * hang * (1 - s.frost);
      }
      cgeo.attributes.position.needsUpdate = true;
      cgeo.computeVertexNormals();
      curtainMat.color.copy(warmVinyl).lerp(frostVinyl, s.frost);
      curtainMat.roughness = 0.15 + s.frost * 0.35;
      glass.color.copy(warmGlass).lerp(frostGlass, s.frost);
      glass.roughness = 0.05 + s.frost * 0.5;
      glass.opacity = 0.8 + s.frost * 0.2;
    },
  };
}

// ---------------------------------------------------------------- water column / snow
function createWater(scene, L, pixelRatio) {
  const { x, z, h } = L.stall;
  const count = 1400;
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  const speed = new Float32Array(count);
  const respawn = (i, anywhere, spread) => {
    pos[i * 3] = x + (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = anywhere ? Math.random() * (h - 0.12) : h - 0.12;
    pos[i * 3 + 2] = z + 0.1 + Math.random() * 0.65;
    speed[i] = rand(0.8, 1.2);
  };
  for (let i = 0; i < count; i++) {
    rnd[i] = Math.random();
    respawn(i, true, 0.9);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSize: { value: 16 },
      uPR: { value: pixelRatio },
      uSnow: { value: 0 },
      uColor: { value: new THREE.Color('#ffe8cc') },
      uOpacity: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      attribute float aRand; uniform float uSize, uPR, uSnow; varying float vRand;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * mix(1.0, 0.45, uSnow) * (0.6 + aRand * 0.8) / -mv.z;
        vRand = aRand;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uSnow, uOpacity; uniform vec3 uColor; varying float vRand;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float streak = (1.0 - smoothstep(0.0, 0.045, abs(p.x))) * (1.0 - smoothstep(0.05, 0.5, abs(p.y)));
        float flake = 1.0 - smoothstep(0.12, 0.5, length(p));
        float a = mix(streak, flake, uSnow);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * (1.0 + vRand * 0.4), a * uOpacity);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const cWarm = new THREE.Color('#f4f8ff'), cCold = new THREE.Color('#bfe0ff'), cSnow = new THREE.Color('#ffffff');
  return {
    points,
    update(dt, t, s) {
      const heat = s.heat;
      const snow = 1 - THREE.MathUtils.smoothstep(heat, 0.03, 0.2); // 1 = snowing
      const flow = THREE.MathUtils.smoothstep(heat, 0.2, 1.0);
      const active = Math.round(THREE.MathUtils.lerp(THREE.MathUtils.lerp(220, count, flow), 700, snow));
      const v = THREE.MathUtils.lerp(THREE.MathUtils.lerp(2.4, 5.2, flow), 0.35, snow);
      const spread = THREE.MathUtils.lerp(0.9, 1.5, snow);
      geo.setDrawRange(0, active);
      for (let i = 0; i < active; i++) {
        pos[i * 3 + 1] -= v * speed[i] * dt;
        if (snow > 0.01) pos[i * 3] += Math.sin(t * 1.3 + rnd[i] * 20) * 0.12 * snow * dt;
        if (pos[i * 3 + 1] < 0.05) respawn(i, false, spread);
      }
      geo.attributes.position.needsUpdate = true;
      mat.uniforms.uSnow.value = snow;
      mat.uniforms.uColor.value.copy(cWarm).lerp(cCold, 1 - flow).lerp(cSnow, snow);
      mat.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.42, 0.9, snow);
    },
  };
}

// ---------------------------------------------------------------- steam
function createSteam(scene, L) {
  const texes = [steamTexture(), steamTexture(), steamTexture()];
  const T = L.tub;
  const regions = [
    // (tub steam is drawn by vcs.js)
    // room air between stall and bath
    { key: 'mid', n: 12, x: [-2.8, 2.8], y: [0.1, 1.4], z: [-2.1, -0.3], s: [1.4, 2.6], op: 0.07, rise: [0.04, 0.1], color: '#f6f8f9', life: [8, 14] },
    // right in front of the lens, inside the stall
    { key: 'stall', n: 10, x: [-0.6, 0.6], y: [0.9, 2.1], z: [-2.95, -2.45], s: [0.6, 1.2], op: 0.05, rise: [0.08, 0.18], color: '#ffffff', life: [5, 9] },
  ];
  const parts = [];
  const spawn = (p, fresh) => {
    const r = p.r;
    p.sprite.position.set(rand(...r.x), rand(...r.y), rand(...r.z));
    p.life = rand(...r.life);
    p.age = fresh ? Math.random() * p.life : 0;
    p.rise = rand(...r.rise);
    p.size = rand(...r.s);
    p.spin = rand(-0.12, 0.12);
    p.seed = Math.random() * 10;
  };
  for (const r of regions)
    for (let i = 0; i < r.n; i++) {
      const mat = new THREE.SpriteMaterial({ map: texes[i % 3], color: r.color, transparent: true, opacity: 0, depthWrite: false });
      mat.rotation = Math.random() * 6.28;
      const sprite = new THREE.Sprite(mat);
      const p = { sprite, mat, r };
      spawn(p, true);
      scene.add(sprite);
      parts.push(p);
    }
  return {
    update(dt, t, s) {
      const amt = { mid: s.steam, stall: s.steam };
      for (const p of parts) {
        p.age += dt;
        if (p.age > p.life) spawn(p, false);
        const k = p.age / p.life;
        p.sprite.position.y += p.rise * dt;
        p.sprite.position.x += Math.sin(t * 0.35 + p.seed) * 0.06 * dt;
        const sc = p.size * (0.8 + k * 0.8);
        p.sprite.scale.set(sc, sc, 1);
        p.mat.rotation += p.spin * dt;
        p.mat.opacity = p.r.op * Math.sin(Math.PI * k) * amt[p.r.key];
        p.sprite.visible = p.mat.opacity > 0.003;
      }
    },
  };
}

export function init(world) {
  const { scene, layout, renderer } = world;
  const stall = createStall(scene, layout);
  const water = createWater(scene, layout, renderer.getPixelRatio());
  const steam = createSteam(scene, layout);

  // Water runs in intro and pitching only; steam and the stall react to temperature at all times.
  let running = false;
  water.points.visible = false;
  bus.on('phase', ({ phase }) => {
    running = phase === 'intro' || phase === 'pitching';
    water.points.visible = running;
  });

  world.onFrame((dt, t) => {
    const s = mood(world.getCold());
    stall.update(dt, t, s);
    if (running) water.update(dt, t, s);
    steam.update(dt, t, s);
  });
}
