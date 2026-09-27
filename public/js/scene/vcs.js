// Hot bath and the VC figures (space 2). Bath, bath lights, steam, vinyl VCs, speech bubble.
// The bath side stays warm at every temperature: nothing here reads world.getCold().
// Figures differ only by robe colour, prop and pose. Same face, skin and towel hat for everyone.
import { bus } from '../bus.js';
import { VCS } from '../characters.js';

const SKIN = '#f0c6a4';
const INK = '#2b1d18';
const FACE_WINDOW = 0.28; // top-right share of the screen width taken by the face window
const rand = (a, b) => a + Math.random() * (b - a);

let THREE;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Glazed tiles with bump and roughness maps (copied from style A props.js).
function tileTextures({ tile, grout, tiles = 8, repeat = [1, 1], vary = 0.05, size = 512 }) {
  const [c, g] = canvas(size, size);
  const [b, gb] = canvas(size, size);
  const [r, gr] = canvas(size, size);
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

function noiseTexture(size = 128, lo = 200, hi = 255, repeat = 4) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = lo + Math.random() * (hi - lo);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

// Face drawn around u=0.25 of the sphere UV (the +z side, facing the camera).
function faceTexture(mode) {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = SKIN;
  g.fillRect(0, 0, 1024, 512);
  const cx = 256, ey = 236;
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(cx + s * 110, 300, 0, cx + s * 110, 300, 48);
    gr.addColorStop(0, 'rgba(255,110,110,0.38)');
    gr.addColorStop(1, 'rgba(255,110,110,0)');
    g.fillStyle = gr;
    g.fillRect(cx + s * 110 - 50, 250, 100, 100);
  }
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = cx + s * 68;
    if (mode === 'blink') {
      g.strokeStyle = INK;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x - 22, ey + 2);
      g.quadraticCurveTo(x, ey + 12, x + 22, ey + 2);
      g.stroke();
      continue;
    }
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x, ey, 21, 29, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x - 7, ey + 2, 6, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(x, ey, 23, 31, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#e3ae8b';
    g.fillRect(x - 30, ey - 40, 60, 33);
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x - 25, ey - 6);
    g.lineTo(x + 25, ey - 8);
    g.stroke();
  }
  g.strokeStyle = '#3a2a22';
  g.lineWidth = 11;
  g.beginPath();
  g.moveTo(cx - 102, 182);
  g.quadraticCurveTo(cx - 70, 172, cx - 38, 180);
  g.stroke();
  g.beginPath();
  g.moveTo(cx + 38, 172);
  g.quadraticCurveTo(cx + 70, 146, cx + 102, 164);
  g.stroke();
  g.strokeStyle = '#d6987a';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, 276, 11, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  if (mode === 'open') {
    g.fillStyle = '#5a1e1e';
    g.beginPath();
    g.ellipse(cx + 6, 334, 34, 22, -0.08, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e66f6f';
    g.beginPath();
    g.ellipse(cx + 6, 348, 20, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(cx - 16, 314, 44, 8);
  } else {
    g.strokeStyle = '#7a3b2e';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(cx - 42, 330);
    g.quadraticCurveTo(cx + 4, 350, cx + 48, 316);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx + 44, 308);
    g.quadraticCurveTo(cx + 56, 316, cx + 50, 326);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Style A's final bubble: cream card, name in robe colour, large bold near-black text. Height follows the text.
const BUBBLE_W = 1024;
const WORLD_PER_PX = 3.2 / 1024;
function bubbleSprite() {
  const mat = new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.visible = false;
  sprite.center.set(0.5, 0); // anchored at the tail tip
  sprite.userData.size = [2.7, 0.95];
  sprite.setText = (name, color, text) => {
    const [c, g] = canvas(BUBBLE_W, 64);
    let fs = 70;
    let lines = [];
    const layout = () => {
      g.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
      lines = [];
      let line = '';
      for (const word of String(text).split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (g.measureText(test).width > BUBBLE_W - 120 && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
    };
    layout();
    while (lines.length > 3 && fs > 48) {
      fs -= 6;
      layout();
    }
    const lh = fs * 1.12;
    const boxH = 118 + lines.length * lh + 20;
    c.height = boxH + 80;
    g.fillStyle = 'rgba(255,252,248,0.97)';
    g.shadowColor = 'rgba(40,20,10,0.35)';
    g.shadowBlur = 18;
    g.beginPath();
    g.roundRect(14, 12, BUBBLE_W - 28, boxH, 60);
    g.moveTo(462, boxH);
    g.lineTo(512, c.height - 6);
    g.lineTo(566, boxH);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = color;
    g.font = '800 46px ui-rounded, system-ui, sans-serif';
    g.fillText(name, 60, 84);
    g.fillStyle = '#0a0706';
    g.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
    lines.forEach((l, i) => g.fillText(l, 60, 118 + fs * 0.85 + i * lh));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
    sprite.userData.size = [BUBBLE_W * WORLD_PER_PX, c.height * WORLD_PER_PX];
  };
  return sprite;
}

// Demo day judges' name block: frosted glass plaque, firm large, VC name small (UI-1 glass look).
const PLATE_W = 0.78, PLATE_H = 0.24;
const firmOf = (vc) => {
  const t = String(vc.title || '');
  const i = t.indexOf(',');
  return (i >= 0 ? t.slice(i + 1) : t).trim();
};
function drawPlate(c, g, vc) {
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.97)');
  grad.addColorStop(1, 'rgba(232,240,248,0.94)');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(6, 6, W - 12, H - 12, 40);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(124,200,255,0.9)';
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(48, 16, W - 96, 5);
  const firm = firmOf(vc).toUpperCase();
  let fs = 104;
  const setFirm = () => { g.font = `700 ${fs}px 'Inter Tight', Inter, system-ui, sans-serif`; };
  setFirm();
  while (g.measureText(firm).width > W - 110 && fs > 40) {
    fs -= 4;
    setFirm();
  }
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#12213d';
  g.fillText(firm, W / 2, H * 0.47 + fs * 0.12);
  g.font = `700 80px Inter, system-ui, sans-serif`;
  const name = vc.name;
  const nw = g.measureText(name).width;
  const ny = H * 0.86;
  g.fillStyle = vc.look.robe;
  g.beginPath();
  g.arc(W / 2 - nw / 2 - 34, ny - 28, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d2b47';
  g.fillText(name, W / 2 + 4, ny);
}
function namePlate(vc) {
  const [c, g] = canvas(1024, Math.round((1024 * PLATE_H) / PLATE_W));
  drawPlate(c, g, vc);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  document.fonts?.load?.("700 100px 'Inter Tight'").then(() => {
    drawPlate(c, g, vc);
    tex.needsUpdate = true;
  }).catch(() => {});
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false }));
  face.position.set(0, PLATE_H / 2 + 0.03, 0.013);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W - 0.01, PLATE_H - 0.01, 0.024),
    new THREE.MeshPhysicalMaterial({ color: '#eef4fa', roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0.7 }));
  slab.position.set(0, PLATE_H / 2 + 0.03, 0);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(PLATE_W * 0.9, 0.03, 0.09),
    new THREE.MeshStandardMaterial({ color: '#c9d2dc', metalness: 0.9, roughness: 0.35 }));
  foot.position.y = 0.015;
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.12; // lean back a little, like a desk sign
  tilt.add(slab, face);
  grp.add(tilt, foot);
  grp.userData.tex = tex;
  return grp;
}

function rubberDuck(s = 1) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshPhysicalMaterial({ color: '#ffd23f', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), yellow);
  body.scale.set(1, 0.72, 1.25);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), yellow);
  head.position.set(0, 0.09, 0.06);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 12), yellow);
  tail.position.set(0, 0.05, -0.12);
  tail.rotation.x = -0.9;
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), new THREE.MeshPhysicalMaterial({ color: '#ff8c2b', roughness: 0.25, clearcoat: 1 }));
  beak.scale.set(1.1, 0.45, 1);
  beak.position.set(0, 0.075, 0.12);
  const eyeM = new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.2 });
  g.add(body, head, tail, beak);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), eyeM);
    e.position.set(sx * 0.03, 0.11, 0.115);
    g.add(e);
  }
  g.scale.setScalar(s);
  return g;
}

// ------------------------------------------------------------------ bath
function buildBath(world) {
  const { scene, layout } = world;
  const T = layout.tub;
  const glow = (col, k) => new THREE.MeshStandardMaterial({ color: '#000', emissive: col, emissiveIntensity: k });

  const mosaic = tileTextures({ tile: '#2f8c8a', grout: '#cfe3dc', tiles: 16, vary: 0.12, repeat: [T.w / 0.6, T.h / 0.6] });
  const tubMat = new THREE.MeshStandardMaterial({ map: mosaic.map, bumpMap: mosaic.bump, bumpScale: 1, roughnessMap: mosaic.rough, roughness: 0.4 });
  const rimMat = new THREE.MeshPhysicalMaterial({ color: '#efe2d0', roughness: 0.3, clearcoat: 0.6 });
  const th = 0.15;
  for (const [bw, bd, px, pz] of [[T.w, th, T.x, T.z - T.d / 2], [T.w, th, T.x, T.z + T.d / 2], [th, T.d, T.x - T.w / 2, T.z], [th, T.d, T.x + T.w / 2, T.z]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, T.h, bd), tubMat);
    wall.position.set(px, T.h / 2, pz);
    wall.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.08, 0.05, bd + 0.08), rimMat);
    rim.position.set(px, T.h + 0.025, pz);
    rim.castShadow = rim.receiveShadow = true;
    scene.add(wall, rim);
  }
  const waterGeo = new THREE.PlaneGeometry(T.w - th, T.d - th, 48, 28);
  const waterBase = waterGeo.attributes.position.array.slice();
  const bathWater = new THREE.Mesh(waterGeo, new THREE.MeshPhysicalMaterial({
    color: '#2f9c9c', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9,
    emissive: '#ff8448', emissiveIntensity: 0.16, envMapIntensity: 1.3,
  }));
  bathWater.rotation.x = -Math.PI / 2;
  bathWater.position.set(T.x, T.h - 0.12, T.z);
  scene.add(bathWater);

  // Bath lights never change: the VCs stay warm.
  const pendant = new THREE.PointLight('#ffae6a', 6, 0, 2);
  pendant.position.set(0, 2.6, 1.4);
  const bathFill = new THREE.PointLight('#ffb98a', 3.2, 0, 2);
  bathFill.position.set(0, 2.3, 0.2);
  const bathRim = new THREE.PointLight('#ff8a55', 2.2, 0, 2);
  bathRim.position.set(0, 1.6, 3.2);
  scene.add(pendant, bathFill, bathRim);

  const h = layout.room.h;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 16), glow('#ffc890', 2.6));
  globe.position.set(0, 2.85, 1.4);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, h - 3.0, 6), new THREE.MeshStandardMaterial({ color: '#222' }));
  cord.position.set(0, (h + 3.0) / 2, 1.4);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.12, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: '#c8964a', metalness: 1, roughness: 0.25, side: THREE.DoubleSide }));
  shade.position.set(0, 3.0, 1.4);
  scene.add(globe, cord, shade);

  const flames = [];
  for (const sx of [-1.85, -1.6, 1.7]) {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16), new THREE.MeshStandardMaterial({ color: '#fff4e0', roughness: 0.6 }));
    candle.position.set(sx, T.h + 0.1, T.z - T.d / 2);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), glow('#ffb347', 5));
    flame.scale.set(1, 2, 1);
    flame.position.set(sx, T.h + 0.175, T.z - T.d / 2);
    flames.push(flame);
    scene.add(candle, flame);
  }

  // Rubber ducks drifting in the front half of the water, below the faces.
  const waterY = T.h - 0.12;
  const ducks = [
    { m: rubberDuck(1.3), cx: -0.9, z: T.z - 0.75, amp: 0.45, sp: 0.21, ph: 0 },
    { m: rubberDuck(1.05), cx: 0.75, z: T.z - 0.55, amp: 0.4, sp: 0.17, ph: 2.1 },
    { m: rubberDuck(0.9), cx: 0.05, z: T.z - 0.9, amp: 0.55, sp: 0.13, ph: 4.0 },
  ];
  for (const dk of ducks) scene.add(dk.m);

  // Warm steam over the bath, always on.
  const texes = [steamTexture(), steamTexture(), steamTexture()];
  const parts = [];
  const R = { x: [T.x - T.w / 2 + 0.1, T.x + T.w / 2 - 0.1], y: [0.55, 0.85], z: [T.z - 0.6, T.z + 1.1], s: [1.0, 2.1], op: 0.11, rise: [0.12, 0.26], life: [6, 11] };
  const spawn = (p, fresh) => {
    p.sprite.position.set(rand(...R.x), rand(...R.y), rand(...R.z));
    p.life = rand(...R.life);
    p.age = fresh ? Math.random() * p.life : 0;
    p.rise = rand(...R.rise);
    p.size = rand(...R.s);
    p.spin = rand(-0.12, 0.12);
    p.seed = Math.random() * 10;
  };
  for (let i = 0; i < 24; i++) {
    const mat = new THREE.SpriteMaterial({ map: texes[i % 3], color: '#ffd4b4', transparent: true, opacity: 0, depthWrite: false });
    mat.rotation = Math.random() * 6.28;
    const sprite = new THREE.Sprite(mat);
    const p = { sprite, mat };
    spawn(p, true);
    scene.add(sprite);
    parts.push(p);
  }

  world.onFrame((dt, t) => {
    const wp = waterGeo.attributes.position.array;
    for (let i = 0; i < wp.length; i += 3) {
      const x = waterBase[i], y = waterBase[i + 1];
      wp[i + 2] = Math.sin(x * 5 + t * 1.6) * 0.006 + Math.sin(y * 7 - t * 2.1 + x) * 0.005;
    }
    waterGeo.attributes.position.needsUpdate = true;
    waterGeo.computeVertexNormals();
    for (const dk of ducks) {
      const a = t * dk.sp + dk.ph;
      dk.m.position.set(dk.cx + Math.sin(a) * dk.amp, waterY + Math.sin(t * 1.7 + dk.ph) * 0.01, dk.z + Math.sin(a * 0.7) * 0.12);
      dk.m.rotation.set(Math.sin(t * 1.3 + dk.ph) * 0.06, Math.cos(a) > 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4, Math.sin(t * 1.1 + dk.ph) * 0.05);
    }
    flames.forEach((f, i) => (f.material.emissiveIntensity = 5 + Math.sin(t * 13 + i * 2) * 2 + Math.sin(t * 29 + i) * 1.5));
    for (const p of parts) {
      p.age += dt;
      if (p.age > p.life) spawn(p, false);
      const k = p.age / p.life;
      p.sprite.position.y += p.rise * dt;
      p.sprite.position.x += Math.sin(t * 0.35 + p.seed) * 0.06 * dt;
      const sc = p.size * (0.8 + k * 0.8);
      p.sprite.scale.set(sc, sc, 1);
      p.mat.rotation += p.spin * dt;
      p.mat.opacity = R.op * Math.sin(Math.PI * k);
      p.sprite.visible = p.mat.opacity > 0.003;
    }
  });
}

// ------------------------------------------------------------------ figures
export function init(world) {
  THREE = world.THREE;
  const { scene, camera, layout } = world;
  buildBath(world);

  const { x, z, w, h } = layout.tub;
  const tex = { closed: faceTexture('closed'), open: faceTexture('open'), blink: faceTexture('blink') };
  const terry = noiseTexture(128, 205, 255, 6);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const towelMat = new THREE.MeshPhysicalMaterial({ color: '#fbf6ee', map: terry, roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#f5f5f5', metalness: 1, roughness: 0.1 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.02, clearcoat: 1, envMapIntensity: 2 });
  const drinkMat = new THREE.MeshStandardMaterial({ color: '#f7d36a', emissive: '#ffb640', emissiveIntensity: 0.9, transparent: true, opacity: 0.9 });

  function arm(root, side, robeMat) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, 0.58, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.24, 6, 12), robeMat);
    upper.position.y = -0.17;
    upper.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 12), skinMat);
    hand.position.y = -0.38;
    pivot.add(upper, hand);
    root.add(pivot);
    return { pivot, hand };
  }

  // Hand props are children of the hand, counter-rotated each frame so they stay upright.
  function champagne() {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.14, 16, 1, true), glassMat);
    bowl.position.y = 0.16;
    const wine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.09, 16), drinkMat);
    wine.position.y = 0.135;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 8), glassMat);
    stem.position.y = 0.05;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), glassMat);
    g.add(bowl, wine, stem, foot);
    g.position.set(0, 0.02, 0.05);
    return g;
  }
  function tumbler() {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.12, 16, 1, true), glassMat);
    cup.position.y = 0.07;
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff7a1a', emissiveIntensity: 0.7, transparent: true, opacity: 0.9 }));
    drink.position.y = 0.05;
    const lime = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 16), new THREE.MeshStandardMaterial({ color: '#9bdc4a' }));
    lime.position.set(0.04, 0.13, 0);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#ff4f7b' }));
    straw.position.set(-0.015, 0.12, 0);
    straw.rotation.z = 0.25;
    g.add(cup, drink, lime, straw);
    g.position.set(0, 0.02, 0.05);
    return g;
  }
  function phone() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.165, 0.014),
      new THREE.MeshPhysicalMaterial({ color: '#ff9fcf', roughness: 0.3, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff') }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.15),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe6ff').multiplyScalar(2.2) }));
    screen.position.z = -0.008;
    screen.rotation.y = Math.PI;
    const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 12), chrome);
    cam.rotation.x = Math.PI / 2;
    cam.position.set(-0.022, 0.055, 0.009);
    g.add(body, screen, cam);
    g.position.set(0, 0.08, 0.03);
    return g;
  }
  function sunglasses() {
    const g = new THREE.Group();
    const lensMat = new THREE.MeshPhysicalMaterial({ color: '#16161c', roughness: 0.05, clearcoat: 1, envMapIntensity: 2.5 });
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24), lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.scale.set(1.05, 1, 0.8);
      lens.position.x = s * 0.1;
      lens.rotation.y = -s * 0.2;
      g.add(lens);
    }
    const gold = new THREE.MeshStandardMaterial({ color: '#ffd35a', metalness: 1, roughness: 0.2 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.015), gold);
    bridge.position.y = 0.03;
    g.add(bridge);
    for (const s of [-1, 1]) {
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), gold);
      temple.position.set(s * 0.18, 0.02, -0.1);
      g.add(temple);
    }
    return g;
  }
  function laptopTray(robe) {
    const g = new THREE.Group();
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.035, 0.34), new THREE.MeshStandardMaterial({ color: '#b07a4a', roughness: 0.5 }));
    tray.castShadow = true;
    const alu = new THREE.MeshStandardMaterial({ color: '#d7dade', metalness: 0.9, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.016, 0.24), alu);
    base.position.y = 0.026;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.034, 0.12);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.01), alu);
    lid.position.y = 0.12;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd0ff').multiplyScalar(1.6) }));
    screen.position.set(0, 0.12, -0.006);
    screen.rotation.y = Math.PI;
    const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshStandardMaterial({ color: robe, emissive: '#ffffff', emissiveIntensity: 1.6 }));
    sticker.position.set(0, 0.13, 0.0065);
    lidPivot.add(lid, screen, sticker);
    lidPivot.rotation.x = 0.28;
    g.add(tray, base, lidPivot);
    return g;
  }
  function clipboard() {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.014), new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.6 }));
    const [c, cg] = canvas(128, 170);
    cg.fillStyle = '#fbfbf6';
    cg.fillRect(0, 0, 128, 170);
    cg.fillStyle = '#1d2a44';
    cg.font = 'bold 18px system-ui, sans-serif';
    cg.fillText('THESIS', 12, 32);
    cg.strokeStyle = '#9aa3b5';
    cg.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      cg.beginPath();
      cg.moveTo(12, 56 + i * 18);
      cg.lineTo(i % 2 ? 90 : 112, 56 + i * 18);
      cg.stroke();
    }
    cg.strokeStyle = '#e0413a';
    cg.lineWidth = 5;
    cg.beginPath();
    cg.moveTo(20, 150);
    cg.lineTo(100, 130);
    cg.stroke();
    const pt = new THREE.CanvasTexture(c);
    pt.colorSpace = THREE.SRGBColorSpace;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9 }));
    paper.position.set(0, -0.02, 0.008);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.03), chrome);
    clip.position.set(0, 0.19, 0.012);
    g.add(board, paper, clip);
    return g;
  }
  function pen() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#1d2a44', metalness: 0.4, roughness: 0.3 }));
    p.position.y = 0.06;
    p.rotation.x = 0.5;
    g.add(p);
    return g;
  }
  function lanyard(robe) {
    const g = new THREE.Group();
    const strapMat = new THREE.MeshStandardMaterial({ color: '#e0413a', roughness: 0.7 });
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.008), strapMat);
      strap.position.set(s * 0.08, 0.64, 0.27);
      strap.rotation.set(-0.35, 0, -s * 0.35);
      g.add(strap);
    }
    const [c, cg] = canvas(160, 220);
    cg.fillStyle = '#ffffff';
    cg.fillRect(0, 0, 160, 220);
    cg.fillStyle = '#e0413a';
    cg.fillRect(0, 0, 160, 54);
    cg.fillStyle = '#fff';
    cg.font = '800 34px ui-rounded, system-ui, sans-serif';
    cg.textAlign = 'center';
    cg.fillText('JUDGE', 80, 40);
    cg.fillStyle = '#d9d2c4';
    cg.fillRect(40, 70, 80, 80);
    cg.fillStyle = '#222';
    cg.font = 'bold 24px system-ui, sans-serif';
    cg.fillText('DEMO DAY', 80, 190);
    const bt = new THREE.CanvasTexture(c);
    bt.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.01), [
      null, null, null, null, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#eee' }),
    ].map((m) => m || new THREE.MeshStandardMaterial({ color: '#ddd' })));
    badge.position.set(0, 0.42, 0.33);
    badge.rotation.x = -0.25;
    g.add(badge);
    return g;
  }

  // Seated poses per prop: shoulder angles ra/rb (right), la/lb (left).
  const POSES = {
    champagne: { ra: -1.95, rb: -0.45, la: 0.5, lb: -1.2 },
    phone: { ra: -2.15, rb: -0.3, la: 0.5, lb: -1.2 },
    laptop: { ra: -1.15, rb: -0.18, la: -1.15, lb: 0.18 },
    clipboard: { ra: -1.25, rb: -0.45, la: -1.35, lb: 0.35 },
    lanyard: { ra: -0.95, rb: -0.62, la: -0.95, lb: 0.62 },
    sunglasses: { ra: -1.8, rb: -0.4, la: 0.45, lb: -1.2 },
  };

  function makeFigure(id, i, n) {
    const vc = VCS[id];
    const robe = vc.look.robe;
    const kind = vc.look.prop;
    const robeMat = new THREE.MeshPhysicalMaterial({
      color: robe, map: terry, roughness: 0.95, sheen: 1, sheenRoughness: 0.5,
      sheenColor: new THREE.Color(robe).lerp(new THREE.Color('#ffffff'), 0.55),
    });
    const root = new THREE.Group();
    const span = w - 1.0;
    root.position.set(x - span / 2 + (i / Math.max(1, n - 1)) * span, h - 0.45, z + 0.35);
    root.lookAt(camera.position.x, root.position.y, camera.position.z);
    const body = new THREE.Group();
    root.add(body);

    const robeGeo = new THREE.LatheGeometry(
      [[0, 0], [0.3, 0], [0.34, 0.18], [0.33, 0.42], [0.29, 0.58], [0.2, 0.68], [0.09, 0.72], [0, 0.73]].map(([a, b]) => new THREE.Vector2(a, b)), 32);
    const torso = new THREE.Mesh(robeGeo, robeMat);
    torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skinMat);
    chest.scale.set(1, 1.3, 0.45);
    chest.position.set(0, 0.57, 0.245);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 12, 32),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(robe).lerp(new THREE.Color('#ffffff'), 0.15), map: terry, roughness: 1, sheen: 1 }));
    collar.position.y = 0.64;
    collar.rotation.x = Math.PI / 2 + 0.35;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 16), skinMat);
    neck.position.y = 0.76;
    body.add(torso, chest, collar, neck);

    const headPivot = new THREE.Group();
    headPivot.position.y = 0.8;
    body.add(headPivot);
    const faceMat = new THREE.MeshPhysicalMaterial({ map: tex.closed, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 48, 32), faceMat);
    head.position.y = 0.26;
    head.scale.set(1, 0.96, 0.95);
    head.castShadow = true;
    headPivot.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skinMat);
      ear.scale.set(0.55, 1, 0.8);
      ear.position.set(s * 0.29, 0.25, 0);
      headPivot.add(ear);
    }
    // Towel hat for everyone.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.1, 16, 32), towelMat);
    ring.rotation.x = Math.PI / 2 - 0.2;
    ring.position.set(0, 0.47, -0.02);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), towelMat);
    top.scale.set(1, 0.75, 1);
    top.position.set(0, 0.55, -0.04);
    const twist = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 12), towelMat);
    twist.position.set(0, 0.63, 0.13);
    twist.rotation.x = 0.9;
    headPivot.add(ring, top, twist);

    const R = arm(body, 1, robeMat);
    const L = arm(body, -1, robeMat);
    const pose = { ...POSES[kind] };
    const f = { id, vc, kind, idle: vc.idle, root, body, headPivot, faceMat, R, L, pose, handProps: [], phase: i * 1.9 + Math.random(), baseY: root.position.y, blinkAt: 1 + Math.random() * 3 };
    const hold = (hand, prop, tilt = 0) => {
      hand.hand.add(prop);
      f.handProps.push({ prop, arm: hand, tilt });
    };
    if (kind === 'champagne') hold(R, champagne());
    else if (kind === 'phone') hold(R, phone(), -0.25);
    else if (kind === 'sunglasses') {
      const sg = sunglasses();
      sg.position.set(0, 0.3, 0.29);
      headPivot.add(sg);
      hold(R, tumbler());
    } else if (kind === 'laptop') {
      const tray = laptopTray(robe);
      tray.position.set(0, 0.34, 0.42);
      body.add(tray);
      pose.tray = tray;
    } else if (kind === 'clipboard') {
      const cb = clipboard();
      cb.position.set(-0.04, 0.48, 0.4);
      cb.rotation.set(-1.05, 0.15, 0.1);
      body.add(cb);
      pose.clip = cb;
      hold(R, pen());
    } else if (kind === 'lanyard') body.add(lanyard(robe));

    const bubble = bubbleSprite();
    scene.add(bubble);
    f.bubble = bubble;
    f.bubbleT = 0;
    f.talking = false;
    f.mood = null; // 'cheer' | 'clap' | 'sip' for endings and cheers
    f.moodUntil = 0;
    scene.add(root);
    return f;
  }

  let figures = [];
  const byId = {};
  function dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  function seat(vcIds) {
    for (const f of figures) {
      scene.remove(f.root, f.bubble);
      dispose(f.root);
      f.bubble.material.map?.dispose();
      clearTimeout(f.hideTimer);
      if (f.plate) {
        scene.remove(f.plate);
        dispose(f.plate);
        f.plate.userData.tex.dispose();
      }
    }
    figures = vcIds.filter((id) => VCS[id]).map((id, i, arr) => makeFigure(id, i, arr.length));
    for (const k of Object.keys(byId)) delete byId[k];
    for (const f of figures) byId[f.id] = f;
    // Name plates on the near rim, each placed on the camera ray to its VC so it sits right below them.
    const rimZ = layout.tub.z - layout.tub.d / 2;
    for (const f of figures) {
      const k = (rimZ - camera.position.z) / (f.root.position.z - camera.position.z);
      const plate = namePlate(f.vc);
      plate.position.set(camera.position.x + (f.root.position.x - camera.position.x) * k, h + 0.05, rimZ);
      plate.lookAt(camera.position.x, plate.position.y, camera.position.z);
      scene.add(plate);
      f.plate = plate;
    }
  }

  // Bubble placement: above the head, clamped so it stays in frame and left of the face window.
  const v = new THREE.Vector3();
  const headW = new THREE.Vector3();
  function placeBubble(f) {
    const [bw, bh] = f.userBubbleSize || f.bubble.userData.size;
    f.headPivot.getWorldPosition(headW);
    v.set(headW.x, headW.y + 0.82, headW.z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -v.z;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH = depth * tanH, halfW = halfH * camera.aspect;
    const m = 0.04 * halfW;
    const k = f.bubbleK;
    const sw = bw * k, sh = bh * k;
    const right = halfW * (1 - 2 * FACE_WINDOW) - m;
    v.x = Math.min(Math.max(v.x, -halfW + m + sw / 2), right - sw / 2);
    v.y = Math.min(v.y, halfH * 0.94 - sh);
    v.applyMatrix4(camera.matrixWorld);
    f.bubble.position.copy(v);
    f.bubble.scale.set(sw, sh, 1);
  }

  const invQ = new THREE.Quaternion();
  world.onFrame((dt, t) => {
    const now = performance.now();
    for (const f of figures) {
      const p = f.pose;
      f.root.position.y = f.baseY + Math.sin(t * 1.1 + f.phase) * 0.015;
      f.body.scale.set(1, 1 + Math.sin(t * 1.6 + f.phase) * 0.01, 1);
      let ra = p.ra, rb = p.rb, la = p.la, lb = p.lb;
      let headX = Math.sin(t * 1.4 + f.phase) * 0.04, headY = 0, headZ = Math.sin(t * 0.7 + f.phase) * 0.05;
      const mood = f.moodUntil > now ? f.mood : null;

      // Idle behaviour.
      if (f.idle === 'sip') {
        const rate = mood === 'sip' ? 2.0 : 0.9;
        const sip = Math.max(0, Math.sin(t * rate + f.phase) - 0.8) / 0.2;
        ra = p.ra - sip * 0.55;
        headX -= sip * 0.15;
      } else if (f.idle === 'phone') {
        headX += 0.14;
        ra += Math.sin(t * 7 + f.phase) * 0.02 * (Math.sin(t * 0.8) > 0 ? 1 : 0);
      } else if (f.idle === 'type') {
        const typing = Math.sin(t * 18 + f.phase) * 0.04;
        ra += typing;
        la -= typing;
        headX += 0.12;
        p.tray.position.y = 0.34 + Math.sin(t * 1.3) * 0.008;
        p.tray.rotation.z = Math.sin(t * 0.9) * 0.02;
      } else if (f.idle === 'nod') {
        const nod = Math.max(0, Math.sin(t * 0.7 + f.phase) - 0.4) / 0.6;
        headX += Math.sin(t * 6) * 0.1 * nod;
        if (f.kind === 'clipboard') {
          headX += 0.1;
          rb += Math.sin(t * 9 + f.phase) * 0.05;
          ra += Math.sin(t * 4.5 + f.phase) * 0.04;
        } else {
          headY = Math.sin(t * 0.4 + f.phase) * 0.12;
        }
      }

      // Talking: bouncy head, flapping mouth, one arm gestures.
      if (f.talking) {
        headX = -0.1 + Math.sin(t * 11) * 0.1;
        headY = Math.sin(t * 2.3) * 0.12;
        headZ = Math.sin(t * 5.5) * 0.08;
        f.faceMat.map = Math.sin(t * 22) > -0.1 ? tex.open : tex.closed;
        if (f.kind === 'laptop' || f.kind === 'lanyard' || f.kind === 'clipboard') {
          ra = -1.6 + Math.sin(t * 5) * 0.35;
          rb = 0.1 + Math.sin(t * 3.1) * 0.2;
        } else {
          la = -1.4 + Math.sin(t * 5) * 0.35;
          lb = 0.1 + Math.sin(t * 3.1) * 0.25;
        }
      } else {
        if (f.faceMat.map === tex.open) f.faceMat.map = tex.closed;
        f.blinkAt -= dt;
        if (f.blinkAt < 0) f.faceMat.map = tex.blink;
        if (f.blinkAt < -0.12) {
          f.faceMat.map = tex.closed;
          f.blinkAt = 2 + Math.random() * 4;
        }
      }

      if (mood === 'cheer') {
        const bounce = Math.abs(Math.sin(t * 7 + f.phase));
        ra = -2.75 + Math.sin(t * 9) * 0.15;
        rb = 0.35;
        la = -2.75 + Math.sin(t * 9 + 1) * 0.15;
        lb = -0.35;
        headX = -0.18 + Math.sin(t * 14) * 0.06;
        f.root.position.y += bounce * 0.05;
        if (f.kind === 'laptop') p.tray.position.y = 0.34 + bounce * 0.02;
      } else if (mood === 'clap') {
        const c = Math.abs(Math.sin(t * 5 + f.phase));
        ra = la = -1.3;
        rb = -0.62 - c * 0.2;
        lb = 0.62 + c * 0.2;
      }

      f.headPivot.rotation.set(headX, headY, headZ);
      f.R.pivot.rotation.set(ra, 0, rb);
      f.L.pivot.rotation.set(la, 0, lb);
      for (const hp of f.handProps) {
        invQ.copy(hp.arm.pivot.quaternion).invert();
        hp.prop.quaternion.copy(invQ);
        if (hp.tilt) hp.prop.rotateX(hp.tilt);
      }

      if (f.bubble.visible) {
        f.bubbleT += dt;
        if (f.hiding) {
          f.bubbleK = Math.max(0, f.bubbleK - dt * 5);
          if (f.bubbleK <= 0) {
            f.bubble.visible = false;
            f.hiding = false;
          }
        } else {
          const k = Math.min(1, f.bubbleT / 0.25);
          f.bubbleK = k * (1 + Math.sin(k * Math.PI) * 0.12);
        }
        if (f.bubble.visible) placeBubble(f);
      }
    }
  });

  function hideBubble(f) {
    if (f.bubble.visible) f.hiding = true;
  }
  function done({ vcId }) {
    const f = byId[vcId];
    if (!f) return;
    f.talking = false;
    clearTimeout(f.hideTimer);
    f.hideTimer = setTimeout(() => hideBubble(f), 1200);
  }

  bus.on('lineup', ({ vcIds }) => seat(vcIds || []));
  bus.on('vc:say', ({ vcId, text, kind }) => {
    const f = byId[vcId];
    if (!f) return;
    for (const o of figures) if (o !== f) {
      clearTimeout(o.hideTimer);
      o.talking = false;
      hideBubble(o);
    }
    f.bubble.setText(f.vc.name, f.vc.look.robe, text || '...');
    // Interruptions are shown on the HUD's glass card; the 3D bubble is for cheers and ending lines.
    f.bubble.visible = kind !== 'interject';
    f.hiding = false;
    f.bubbleT = 0;
    f.bubbleK = 0;
    f.talking = true;
    if (kind === 'cheer') {
      f.mood = 'cheer';
      f.moodUntil = performance.now() + 2600;
    }
    clearTimeout(f.hideTimer);
    // Safety net in case vc:done never arrives.
    const words = String(text || '').split(/\s+/).length;
    f.hideTimer = setTimeout(() => done({ vcId }), Math.max(8000, 1500 + words * 420));
  });
  bus.on('vc:done', done);

  // Ending reactions: frozen gets polite indifference, funded gets a cheer.
  bus.on('ending', ({ type }) => {
    const until = performance.now() + 60000;
    if (type === 'funded') {
      for (const f of figures) Object.assign(f, { mood: 'cheer', moodUntil: until });
      return;
    }
    const sipper = figures.find((f) => f.idle === 'sip') || figures.find((f) => f.id !== 'hype') || figures[0];
    let clapped = false;
    for (const f of figures) {
      if (f === sipper) Object.assign(f, { mood: 'sip', moodUntil: until, idle: 'sip' });
      else if (!clapped && f.kind !== 'laptop') {
        Object.assign(f, { mood: 'clap', moodUntil: until });
        clapped = true;
      }
    }
    if (!clapped) {
      const other = figures.find((f) => f !== sipper);
      if (other) Object.assign(other, { mood: 'clap', moodUntil: until });
    }
  });

  bus.on('phase', ({ phase }) => {
    if (phase !== 'intro' && phase !== 'lobby') return;
    for (const f of figures) {
      clearTimeout(f.hideTimer);
      f.talking = false;
      f.bubble.visible = false;
      f.hiding = false;
      f.mood = null;
      f.moodUntil = 0;
      f.idle = f.vc.idle;
    }
  });
}
