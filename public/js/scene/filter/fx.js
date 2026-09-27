// Shared procedural art for the shower face filter: sprites, droplets, streaks, frost, icicles, steam.
// Everything is drawn with Canvas 2D. Sprites are pre-rendered once so each frame is mostly drawImage calls.

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const hash = (i) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function sprite(size, fn) {
  const c = makeCanvas(size, size);
  fn(c.getContext('2d'), size / 2, size);
  return c;
}

// ---------- sprites ----------

// Dense, creamy foam blob (matte, lit from top-left). icy = frozen variant.
export function foamSprite(icy) {
  return sprite(128, (g, r, s) => {
    const gr = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.05, r, r, r);
    const c = icy
      ? ['rgba(246,252,255,1)', 'rgba(222,240,252,1)', 'rgba(160,200,232,1)', 'rgba(130,178,220,0.9)']
      : ['rgba(255,255,255,1)', 'rgba(248,250,252,1)', 'rgba(208,217,228,1)', 'rgba(178,190,206,0.9)'];
    gr.addColorStop(0, c[0]);
    gr.addColorStop(0.5, c[1]);
    gr.addColorStop(0.86, c[2]);
    gr.addColorStop(0.96, c[3]);
    gr.addColorStop(1, 'rgba(180,195,210,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(r, r, r, 0, TAU);
    g.fill();
    // Tiny micro-bubble texture so the mass does not read as flat circles.
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r * 0.8, mr = rand(2, 7);
      const x = r + Math.cos(a) * d, y = r + Math.sin(a) * d;
      g.strokeStyle = icy ? 'rgba(120,170,215,0.35)' : 'rgba(150,165,185,0.28)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, mr, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(x - mr * 0.35, y - mr * 0.35, mr * 0.3, 0, TAU);
      g.fill();
    }
    const h = g.createRadialGradient(r * 0.6, r * 0.48, 0, r * 0.6, r * 0.48, r * 0.42);
    h.addColorStop(0, 'rgba(255,255,255,0.95)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, s, s);
    if (icy) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const a = rand(0, TAU);
        g.beginPath();
        g.moveTo(r, r);
        g.lineTo(r + Math.cos(a) * r * 0.8, r + Math.sin(a) * r * 0.8);
        g.stroke();
      }
    }
  });
}

// Transparent soap bubble body with an iridescent thin-film rim (rotated at draw time).
export function bubbleRimSprite() {
  return sprite(128, (g, r) => {
    const body = g.createRadialGradient(r, r, r * 0.2, r, r, r);
    body.addColorStop(0, 'rgba(255,255,255,0.03)');
    body.addColorStop(0.72, 'rgba(255,255,255,0.08)');
    body.addColorStop(0.93, 'rgba(255,255,255,0.5)');
    body.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(r, r, r, 0, TAU);
    g.fill();
    const cg = g.createConicGradient(0, r, r);
    const cols = ['#ff4fc3', '#ffcf4f', '#58ff9a', '#4fd2ff', '#8a63ff', '#ff4fc3'];
    cols.forEach((c, i) => cg.addColorStop(i / (cols.length - 1), c));
    g.strokeStyle = cg;
    g.globalAlpha = 0.6;
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.arc(r, r, r * 0.87, 0, TAU);
    g.stroke();
    g.globalAlpha = 0.22;
    g.lineWidth = r * 0.28;
    g.beginPath();
    g.arc(r, r, r * 0.68, 0, TAU);
    g.stroke();
  });
}

// Window-reflection highlight for bubbles (never rotated so the light stays top-left).
export function bubbleHighlightSprite() {
  return sprite(128, (g, r) => {
    g.save();
    g.translate(r * 0.62, r * 0.55);
    g.rotate(-0.7);
    const h = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
    h.addColorStop(0, 'rgba(255,255,255,0.95)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h;
    g.scale(1, 0.55);
    g.beginPath();
    g.arc(0, 0, r * 0.3, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(r * 1.42, r * 1.4, r * 0.07, 0, TAU);
    g.fill();
  });
}

// Shading for a water droplet on top of its refracted content: dark rim, specular, caustic.
export function dropShadeSprite() {
  return sprite(64, (g, r, s) => {
    const rim = g.createRadialGradient(r, r * 1.1, r * 0.45, r, r, r);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.78, 'rgba(10,25,40,0.12)');
    rim.addColorStop(0.95, 'rgba(10,25,40,0.45)');
    rim.addColorStop(1, 'rgba(10,25,40,0)');
    g.fillStyle = rim;
    g.fillRect(0, 0, s, s);
    const c = g.createRadialGradient(r, r * 1.55, 0, r, r * 1.55, r * 0.6);
    c.addColorStop(0, 'rgba(255,255,255,0.45)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = c;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.ellipse(r * 0.68, r * 0.6, r * 0.2, r * 0.13, -0.7, 0, TAU);
    g.fill();
  });
}

export function softSprite(color = '255,255,255') {
  return sprite(128, (g, r, s) => {
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${color},0.55)`);
    gr.addColorStop(0.45, `rgba(${color},0.25)`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

export function vignette(W, H) {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H / 2, H * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,10,20,0.45)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  return c;
}

// Micro condensation speckle for fogged glass.
export function condensationTexture(W, H) {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = Math.pow(Math.random(), 2.2) * 2.4 + 0.5;
    g.fillStyle = 'rgba(40,55,70,0.16)';
    g.beginPath();
    g.arc(x, y + r * 0.3, r, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.arc(x - r * 0.25, y - r * 0.3, r * 0.55, 0, TAU);
    g.fill();
  }
  return c;
}

// Frost: branching ice dendrites growing in from all four edges, plus a dense rime band.
export function frostTexture(W, H) {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const band = 0.12 * Math.min(W, H);
  const edges = [
    [0, 0, W, 0, Math.PI / 2], [0, H, W, H, -Math.PI / 2],
    [0, 0, 0, H, 0], [W, 0, W, H, Math.PI],
  ];
  // Rime band
  for (const [x0, y0, x1, y1, ang] of edges) {
    for (let i = 0; i < 700; i++) {
      const t = Math.random(), d = Math.pow(Math.random(), 2.5) * band * 1.4;
      const x = lerp(x0, x1, t) + Math.cos(ang) * d, y = lerp(y0, y1, t) + Math.sin(ang) * d;
      g.fillStyle = `rgba(240,250,255,${rand(0.15, 0.55)})`;
      g.fillRect(x, y, rand(1, 3), rand(1, 3));
    }
  }
  g.lineCap = 'round';
  function branch(x, y, a, len, depth, w) {
    if (depth <= 0 || len < 3) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = `rgba(245,252,255,${0.35 + depth * 0.1})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    // Side needles, like a real frost fern
    const n = Math.floor(len / 7);
    for (let i = 1; i < n; i++) {
      const px = x + Math.cos(a) * len * (i / n), py = y + Math.sin(a) * len * (i / n);
      const nl = len * 0.22 * (1 - i / n);
      for (const s of [-1, 1]) {
        g.lineWidth = Math.max(0.5, w * 0.5);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a + s * 1.05) * nl, py + Math.sin(a + s * 1.05) * nl);
        g.stroke();
      }
    }
    branch(x2, y2, a + rand(-0.3, 0.3), len * 0.72, depth - 1, w * 0.75);
    if (Math.random() < 0.7) branch(x + (x2 - x) * 0.5, y + (y2 - y) * 0.5, a + (Math.random() < 0.5 ? -1 : 1) * 1.05, len * 0.5, depth - 1, w * 0.7);
  }
  for (const [x0, y0, x1, y1, ang] of edges) {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 26);
    for (let i = 0; i < n; i++) {
      const t = (i + Math.random()) / n;
      branch(lerp(x0, x1, t), lerp(y0, y1, t), ang + rand(-0.6, 0.6), rand(22, 60), 4, 2.2);
    }
  }
  // Corner stars
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    for (let k = 0; k < 9; k++) branch(x, y, Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.9, 0.9), rand(50, 90), 4, 2.5);
  }
  return c;
}

// ---------- droplet with refraction ----------

// A water drop on a lens: shows a minified, upside-down view of the source behind it.
export function drawDrop(ctx, src, shade, x, y, r, frost = 0, stretch = 1) {
  if (r < 1) return;
  const ry = r * stretch;
  if (r >= 3) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, r, ry, 0, 0, TAU);
    ctx.clip();
    const k = 3.2;
    let sx = x - r * k, sy = y - ry * k, sw = r * k * 2, sh = ry * k * 2;
    // Clamp the sample window to the source bounds.
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + sw > src.width) sx = src.width - sw;
    if (sy + sh > src.height) sy = src.height - sh;
    ctx.translate(x, y);
    ctx.scale(-1, -1);
    ctx.drawImage(src, sx, sy, sw, sh, -r, -ry, r * 2, ry * 2);
    ctx.restore();
  }
  ctx.drawImage(shade, x - r, y - ry, r * 2, ry * 2);
  if (frost > 0.02) {
    ctx.fillStyle = `rgba(232,244,255,${0.7 * frost})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, ry, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * frost})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y);
    ctx.lineTo(x + r * 0.6, y);
    ctx.moveTo(x, y - ry * 0.6);
    ctx.lineTo(x, y + ry * 0.6);
    ctx.stroke();
  }
}

// ---------- water streaks running down the face ----------

function newStreak(init) {
  return { u: rand(-0.42, 0.42), p: init ? rand(-0.3, 1) : rand(-0.4, 0), len: rand(0.18, 0.4), speed: rand(0.16, 0.34), w: rand(1.3, 2.6), wig: rand(0, TAU) };
}
export function createStreaks(n) {
  return Array.from({ length: n }, () => newStreak(true));
}
export function updateStreaks(list, dt, speedMul) {
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.p += s.speed * dt * speedMul;
    if (s.p - s.len > 1) list[i] = newStreak(false);
  }
}
export function drawStreaks(ctx, list, env, frost) {
  const f = env.face;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of list) {
    const v1 = clamp(s.p), v0 = clamp(s.p - s.len);
    if (v1 - v0 < 0.02) continue;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const v = lerp(v0, v1, i / 6);
      const lx = s.u * (1 - 0.3 * v * v) + Math.sin(v * 9 + s.wig) * 0.012;
      pts.push(f.toScreen(lx, lerp(-0.7, 0.66, v)));
    }
    const a = pts[0], b = pts[pts.length - 1];
    const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, frost > 0.5 ? 'rgba(235,245,255,0.55)' : 'rgba(255,255,255,0.3)');
    ctx.strokeStyle = gr;
    ctx.lineWidth = s.w * 2.4;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    const g2 = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g2.addColorStop(0, 'rgba(255,255,255,0)');
    g2.addColorStop(1, 'rgba(255,255,255,0.8)');
    ctx.strokeStyle = g2;
    ctx.lineWidth = s.w * 0.6;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x - s.w * 0.5, p.y) : ctx.moveTo(p.x - s.w * 0.5, p.y)));
    ctx.stroke();
    if (s.p <= 1) drawDrop(ctx, env.src, env.sprites.drop, b.x, b.y + s.w, s.w * 2.1, frost, 1.2);
  }
}

// ---------- icicles ----------

// anchors: [{x,y}] points the icicles hang from. amt 0..1 grows them.
export function drawIcicles(ctx, anchors, amt, scale, seedBase = 0) {
  if (amt < 0.01) return;
  for (let i = 0; i < anchors.length; i++) {
    const p = anchors[i], h = hash(i + seedBase);
    const L = amt * scale * (0.45 + 1.1 * h) * smoothGrow(amt, h);
    if (L < 2) continue;
    const w = Math.min(L * 0.32, scale * 0.12) + 2;
    const bend = (hash(i + seedBase + 7) - 0.5) * w * 0.6;
    const gr = ctx.createLinearGradient(p.x, p.y, p.x, p.y + L);
    gr.addColorStop(0, 'rgba(240,250,255,0.95)');
    gr.addColorStop(0.5, 'rgba(175,215,245,0.7)');
    gr.addColorStop(1, 'rgba(250,254,255,0.95)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(p.x - w / 2, p.y - 1);
    ctx.quadraticCurveTo(p.x - w * 0.35 + bend * 0.5, p.y + L * 0.55, p.x + bend, p.y + L);
    ctx.quadraticCurveTo(p.x + w * 0.35 + bend * 0.5, p.y + L * 0.55, p.x + w / 2, p.y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,210,0.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, w * 0.12);
    ctx.beginPath();
    ctx.moveTo(p.x - w * 0.18, p.y + 1);
    ctx.quadraticCurveTo(p.x - w * 0.12 + bend * 0.4, p.y + L * 0.5, p.x + bend * 0.8, p.y + L * 0.85);
    ctx.stroke();
  }
}
function smoothGrow(amt, h) {
  // Stagger growth so icicles do not all appear at once.
  return smooth(h * 0.4, h * 0.4 + 0.6, amt);
}
