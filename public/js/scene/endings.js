// Ending set pieces (space 2). VC reactions live in vcs.js (same 'ending' event).
// Frozen: a frosted ice wall grows up across the stall opening; the warm bath stays visible through its clear middle.
// Funded: golden light floods the stall, golden foam bubbles and confetti burst out of the bath.
import { bus } from '../bus.js';

const rand = (a, b) => a + Math.random() * (b - a);
const GROW_SECONDS = 2.6;

function frostTexture(THREE) {
  const W = 512, H = 768;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // Clear middle, thick frost toward the edges and the floor.
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x / W - 0.5) * 2, dy = y / H; // dy 0 top .. 1 bottom
      const edge = Math.max(Math.pow(dx, 2.2), Math.pow(dy, 3) * 0.95, Math.pow(1 - dy, 5) * 0.6);
      const n = Math.random() * 0.1;
      const a = Math.min(0.92, 0.1 + edge * 0.8 + n);
      const i = (y * W + x) * 4;
      img.data[i] = 222 + n * 300;
      img.data[i + 1] = 240;
      img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  g.putImageData(img, 0, 0);
  // Feathery frost crystals from the edges.
  g.lineCap = 'round';
  const fern = (x, y, ang, len, depth) => {
    if (depth <= 0 || len < 4) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.strokeStyle = `rgba(255,255,255,${0.25 + depth * 0.1})`;
    g.lineWidth = depth * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    fern(x2, y2, ang + rand(-0.25, 0.25), len * 0.8, depth - 1);
    fern((x + x2) / 2, (y + y2) / 2, ang + 0.9, len * 0.45, depth - 1);
    fern((x + x2) / 2, (y + y2) / 2, ang - 0.9, len * 0.45, depth - 1);
  };
  for (let i = 0; i < 26; i++) {
    const side = i % 3;
    if (side === 0) fern(rand(0, 40), rand(0, H), rand(-0.6, 0.6), rand(30, 60), 5);
    else if (side === 1) fern(W - rand(0, 40), rand(0, H), Math.PI + rand(-0.6, 0.6), rand(30, 60), 5);
    else fern(rand(0, W), H - rand(0, 30), -Math.PI / 2 + rand(-0.7, 0.7), rand(30, 70), 5);
  }
  // A few cracks.
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 7; i++) {
    let x = rand(0, W), y = rand(H * 0.3, H);
    g.lineWidth = rand(1, 2.5);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += rand(-40, 40);
      y += rand(-50, 10);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,214,120,1)');
  gr.addColorStop(0.5, 'rgba(255,170,60,0.45)');
  gr.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function init(world) {
  const { THREE, scene, layout, camera } = world;
  const S = layout.stall;
  const T = layout.tub;
  const front = S.z + S.d / 2 + 0.03;

  // ---------------------------------------------------------------- frozen: ice wall
  const iceGroup = new THREE.Group();
  iceGroup.visible = false;
  scene.add(iceGroup);
  const wallW = S.w + 0.2, wallH = S.h + 0.1;
  const frost = frostTexture(THREE);
  const wallGeo = new THREE.PlaneGeometry(wallW, wallH);
  wallGeo.translate(0, wallH / 2, 0);
  const wallMat = new THREE.MeshStandardMaterial({
    map: frost, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15, metalness: 0,
    color: '#e8f6ff', emissive: '#7fb6e6', emissiveIntensity: 0.25, fog: false,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(S.x, 0, front);
  wall.renderOrder = 5;
  iceGroup.add(wall);

  // Crystal shards: a frame along the floor and the sides, plus a jagged row riding the growing top edge.
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: '#d8f0ff', transparent: true, opacity: 0.55, roughness: 0.08, clearcoat: 1, flatShading: true,
    emissive: '#5f9fd8', emissiveIntensity: 0.35, depthWrite: false, fog: false,
  });
  const shardGeo = new THREE.ConeGeometry(0.07, 0.4, 5, 1);
  shardGeo.translate(0, 0.2, 0);
  const shards = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(shardGeo, shardMat);
    const u = i / 15;
    m.position.set(S.x - wallW / 2 + u * wallW, 0, front + rand(0.01, 0.06));
    m.rotation.set(rand(-0.2, 0.2), rand(0, 6), rand(-0.35, 0.35));
    m.userData.s = rand(0.8, 1.8);
    shards.push(m);
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const m = new THREE.Mesh(shardGeo, shardMat);
    m.position.set(S.x + side * (wallW / 2 - rand(0, 0.08)), rand(0.2, S.h), front + rand(0.01, 0.06));
    m.rotation.set(0, rand(0, 6), -side * rand(0.9, 1.6));
    m.userData.s = rand(0.6, 1.3);
    m.userData.side = true;
    shards.push(m);
  }
  for (const m of shards) iceGroup.add(m);
  const crest = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(shardGeo, shardMat);
    m.position.set(S.x - wallW / 2 + (i + 0.5) / 14 * wallW, -0.05, front + 0.01);
    m.rotation.set(0, rand(0, 6), rand(-0.3, 0.3));
    m.scale.setScalar(rand(0.35, 0.8));
    crest.add(m);
  }
  iceGroup.add(crest);

  // ---------------------------------------------------------------- funded: gold light, glow, foam, confetti
  const gold = new THREE.PointLight('#ffc44d', 0, 0, 2);
  gold.position.set(S.x, S.h - 0.2, S.z + 0.5);
  const goldBath = new THREE.PointLight('#ffb640', 0, 0, 2);
  goldBath.position.set(T.x, 1.9, T.z - 0.6);
  scene.add(gold, goldBath);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({
    map: glowTexture(THREE), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
  }));
  glow.position.set(S.x, 1.4, front + 0.1);
  glow.renderOrder = 6;
  glow.visible = false;
  scene.add(glow);

  const BUB = 140, CONF = 220;
  const bubMat = new THREE.MeshPhysicalMaterial({
    color: '#ffe9b0', transparent: true, opacity: 0.6, roughness: 0.05, clearcoat: 1, iridescence: 1,
    emissive: '#ffb640', emissiveIntensity: 0.35, depthWrite: false,
  });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), bubMat, BUB);
  const confMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.35, metalness: 0.6, emissive: '#553300', emissiveIntensity: 0.4 });
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.08), confMat, CONF);
  const palette = ['#ffd24a', '#ffb13b', '#fff1c4', '#ff7eb6', '#ffe27a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < CONF; i++) confetti.setColorAt(i, palette[i % palette.length]);
  bubbles.frustumCulled = confetti.frustumCulled = false;
  bubbles.visible = confetti.visible = false;
  scene.add(bubbles, confetti);
  const bp = Array.from({ length: BUB }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, age: 0, life: 0, delay: 0 }));
  const cp = Array.from({ length: CONF }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), delay: 0 }));
  const dummy = new THREE.Object3D();

  function launchFunded() {
    for (const b of bp) {
      b.p.set(T.x + rand(-1.7, 1.7), T.h - 0.05, T.z + rand(-0.9, 0.6));
      b.v.set(rand(-0.4, 0.4), rand(1.2, 3.2), rand(-1.6, -0.3));
      b.r = rand(0.03, 0.09);
      b.age = 0;
      b.life = rand(3, 6);
      b.delay = rand(0, 1.5);
    }
    for (const c of cp) {
      c.p.set(T.x + rand(-2.2, 2.2), T.h, T.z + rand(-1, 0.5));
      c.v.set(rand(-1.2, 1.2), rand(3.2, 5.2), rand(-2.4, -0.6));
      c.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
      c.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      c.delay = rand(0, 0.6);
    }
    bubbles.visible = confetti.visible = glow.visible = true;
  }

  let mode = null;
  let k = 0; // ending progress 0..1
  world.onFrame((dt, t) => {
    if (!mode) return;
    k = Math.min(1, k + dt / GROW_SECONDS);
    const e = 1 - Math.pow(1 - k, 3);
    if (mode === 'frozen') {
      wall.scale.y = Math.max(0.001, e);
      frost.repeat.y = Math.max(0.001, e);
      crest.position.y = e * wallH;
      crest.visible = k < 1;
      for (const m of shards) {
        const s = m.userData.side ? (m.position.y < e * wallH ? m.userData.s : 0.001) : m.userData.s * Math.min(1, e * 1.6);
        m.scale.setScalar(Math.max(0.001, m.scale.x + (s - m.scale.x) * Math.min(1, dt * 6)));
      }
      wallMat.emissiveIntensity = 0.25 + Math.sin(t * 2) * 0.04;
    } else if (mode === 'funded') {
      gold.intensity = e * 9;
      goldBath.intensity = e * 5;
      glow.material.opacity = e * 0.32 + Math.sin(t * 3) * 0.03 * e;
      for (let i = 0; i < BUB; i++) {
        const b = bp[i];
        if (b.delay > 0) {
          b.delay -= dt;
          dummy.scale.setScalar(0.0001);
        } else {
          b.age += dt;
          b.v.y -= 0.9 * dt;
          b.v.multiplyScalar(1 - dt * 0.6);
          b.p.addScaledVector(b.v, dt);
          b.p.x += Math.sin(t * 2 + i) * 0.1 * dt;
          const life = b.age / b.life;
          if (life > 1 || b.p.y < 0.05) {
            // keep the foam fizzing for a while
            b.p.set(T.x + rand(-1.7, 1.7), T.h - 0.05, T.z + rand(-0.9, 0.6));
            b.v.set(rand(-0.3, 0.3), rand(0.8, 2.4), rand(-1.2, -0.2));
            b.age = 0;
          }
          const pop = Math.min(1, b.age * 6) * (1 - Math.max(0, life - 0.85) / 0.15);
          dummy.scale.setScalar(Math.max(0.0001, b.r * pop));
        }
        dummy.position.copy(b.p);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < CONF; i++) {
        const c = cp[i];
        if (c.delay > 0) {
          c.delay -= dt;
          dummy.scale.setScalar(0.0001);
        } else {
          c.v.y -= 3.2 * dt;
          c.v.multiplyScalar(1 - dt * 1.4);
          if (c.v.y < -0.6) c.v.y = -0.6; // flutter
          c.p.addScaledVector(c.v, dt);
          c.p.x += Math.sin(t * 3 + i) * 0.25 * dt;
          if (c.p.y < 0.01) c.p.y = 0.01;
          else {
            c.rot.x += c.spin.x * dt;
            c.rot.y += c.spin.y * dt;
            c.rot.z += c.spin.z * dt;
          }
          dummy.scale.setScalar(1);
        }
        dummy.position.copy(c.p);
        dummy.rotation.copy(c.rot);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }
  });

  function reset() {
    mode = null;
    k = 0;
    iceGroup.visible = false;
    bubbles.visible = confetti.visible = glow.visible = false;
    gold.intensity = goldBath.intensity = 0;
    glow.material.opacity = 0;
  }

  bus.on('ending', ({ type }) => {
    reset();
    mode = type === 'frozen' ? 'frozen' : 'funded';
    if (mode === 'frozen') {
      iceGroup.visible = true;
      wall.scale.y = 0.001;
      frost.repeat.y = 0.001;
      for (const m of shards) m.scale.setScalar(0.001);
      crest.visible = true;
    } else launchFunded();
  });
  bus.on('phase', ({ phase }) => {
    if (phase === 'intro' || phase === 'lobby') reset();
  });
  void camera;
}
