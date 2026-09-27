// Buzzwords turn into ice cubes that drop and pile up on the floor in front of the bath (space 2).
// Look ported from samples/style-a props.js createIce. Cubes settle with the word facing the camera.
import { bus } from '../bus.js';

const SIZE = 0.3;
const MAX_CUBES = 40;
const MAX_STACK = 3; // keeps every pile below the tub rim, so VC faces are never covered
const rand = (a, b) => a + Math.random() * (b - a);

function iceTexture(THREE, word) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, 'rgba(235,248,255,0.9)');
  gr.addColorStop(1, 'rgba(170,215,245,0.68)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.2, 0.7)})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 4), rand(1, 4));
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 244, 244);
  g.fillStyle = '#153f6b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = String(word).split(' ');
  const lines = words.length > 1 && word.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [word];
  let fs = 72;
  const fit = () => lines.every((l) => g.measureText(l).width <= 228);
  g.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
  while (!fit() && fs > 22) g.font = `800 ${(fs -= 4)}px ui-rounded, system-ui, sans-serif`;
  const lh = fs * 1.05;
  lines.forEach((l, i) => g.fillText(l, 128, 132 + (i - (lines.length - 1) / 2) * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function init(world) {
  const { THREE, scene, layout } = world;
  const T = layout.tub;
  const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  const cubes = [];
  // Landing band: floor just in front of the tub's front wall (the part of the floor that stays in view above the HUD).
  const zFront = T.z - T.d / 2 - 0.08 - SIZE / 2;
  const xs = [-1.6, -1.0, -0.4, 0.3, 0.9, 1.5];
  const heights = new Map(xs.map((x) => [x, 0]));
  const eTarget = new THREE.Euler();

  function remove(c) {
    scene.remove(c.m);
    c.m.material.map.dispose();
    c.m.material.dispose();
  }

  bus.on('buzzword', ({ word }) => {
    if (!word) return;
    // Lowest column first, with a bit of randomness so piles look natural.
    const open = () => [...heights.entries()].filter(([, n]) => n < MAX_STACK).sort(() => Math.random() - 0.5);
    let cols = open();
    if (!cols.length) {
      // Every pile is full: clear the floor and start over.
      for (const k of heights.keys()) heights.set(k, 0);
      while (cubes.length) remove(cubes.shift());
      cols = open();
    }
    const [col, n] = cols[0];
    heights.set(col, n + 1);
    const mat = new THREE.MeshPhysicalMaterial({
      map: iceTexture(THREE, word), transparent: true, color: '#eaf7ff', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
      envMapIntensity: 1.6, emissive: '#6fa8d8', emissiveIntensity: 0.18,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    const rest = new THREE.Vector3(col + rand(-0.06, 0.06) + (n % 2) * 0.06, SIZE / 2 + n * SIZE * 0.98, zFront - rand(0, 0.12));
    m.position.set(rest.x + rand(-0.2, 0.2), 2.4 + rand(0, 0.4), rest.z + rand(-0.1, 0.1));
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    eTarget.set(0, rand(-0.25, 0.25), 0);
    const cube = {
      m, rest, vy: 0, bounces: 0, landed: false,
      q: new THREE.Quaternion().setFromEuler(eTarget),
      av: new THREE.Vector3(rand(-6, 6), rand(-3, 3), rand(-6, 6)),
    };
    scene.add(m);
    cubes.push(cube);
    while (cubes.length > MAX_CUBES) remove(cubes.shift());
  });

  world.onFrame((dt) => {
    for (const c of cubes) {
      if (c.done) continue;
      const m = c.m;
      if (!c.landed) {
        c.vy -= 9.8 * dt;
        m.position.y += c.vy * dt;
        // steer toward the landing spot while falling
        const k = 1 - Math.exp(-dt * 4);
        m.position.x += (c.rest.x - m.position.x) * k;
        m.position.z += (c.rest.z - m.position.z) * k;
        m.rotation.x += c.av.x * dt;
        m.rotation.y += c.av.y * dt;
        m.rotation.z += c.av.z * dt;
        if (m.position.y <= c.rest.y) {
          m.position.y = c.rest.y;
          if (Math.abs(c.vy) > 1 && c.bounces < 2) {
            c.vy *= -0.28;
            c.bounces++;
            c.av.multiplyScalar(0.4);
          } else {
            c.landed = true;
          }
        }
      } else {
        const k = 1 - Math.exp(-dt * 12);
        m.quaternion.slerp(c.q, k);
        m.position.lerp(c.rest, k);
        if (m.quaternion.angleTo(c.q) < 0.002) {
          m.quaternion.copy(c.q);
          m.position.copy(c.rest);
          c.done = true;
        }
      }
    }
  });

  bus.on('phase', ({ phase }) => {
    if (phase !== 'intro') return;
    while (cubes.length) remove(cubes.shift());
    for (const k of heights.keys()) heights.set(k, 0);
  });
}
