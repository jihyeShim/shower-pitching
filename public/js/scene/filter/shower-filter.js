// Reusable shower face filter.
//   const f = createShowerFilter(canvas, videoEl, { style: 'shampoo' });
//   f.setTemp('warm' | 'lukewarm' | 'cold' | 'frozen'); f.hit(); f.setStyle('glass'); f.destroy();
// canvas: output canvas (its width/height define the render size, portrait 4:5 recommended).
// videoEl: <video> with a webcam stream, or null for the drawn placeholder face.
// Options: style, autoRun (default true; false = call f.render(nowMs) from your own loop),
//          tracking (default true), onStatus(text).
import { loadFaceLandmarker } from './face-tracker.js';
import * as F from './fx.js';
import { createShampoo } from './style-shampoo.js';
import { createGlass } from './style-glass.js';
import { createRain } from './style-rain.js';

export const STYLES = {
  shampoo: { label: 'Shampoo Hero', make: createShampoo },
  glass: { label: 'Steamy Glass', make: createGlass },
  rain: { label: 'Rain Head', make: createRain },
};
export const BAND_TEMP = { warm: 0, lukewarm: 0.34, cold: 0.67, frozen: 1 };

// MediaPipe mesh indices. Output is mirrored, so "L" means the left side of the screen.
const IDX = {
  forehead: 10, chin: 152, nose: 1, mouth: 13,
  cheekL: 454, cheekR: 234, templeL: 356, templeR: 127, eyeL: 263, eyeR: 33,
};
const BROWS = [276, 283, 282, 295, 285, 55, 65, 52, 53, 46];
const JAW = [397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172];

// Template face in face-width units, origin at nose tip, used when no landmarks are available.
const TEMPLATE = {
  forehead: [0, -0.78], chin: [0, 0.6], nose: [0, 0], mouth: [0, 0.3],
  cheekL: [-0.5, -0.05], cheekR: [0.5, -0.05], templeL: [-0.46, -0.42], templeR: [0.46, -0.42],
  eyeL: [-0.3, -0.2], eyeR: [0.3, -0.2],
};
const TPL_BROWS = [];
for (let i = 0; i < 5; i++) TPL_BROWS.push([-0.4 + i * 0.07, -0.31 - 0.03 * Math.sin((i / 4) * Math.PI)]);
for (let i = 0; i < 5; i++) TPL_BROWS.push([0.12 + i * 0.07, -0.31 - 0.03 * Math.sin((i / 4) * Math.PI)]);
const TPL_JAW = [];
for (let i = 0; i < 13; i++) {
  const a = F.lerp(Math.PI * 0.97, Math.PI * 0.03, i / 12);
  TPL_JAW.push([0.48 * Math.cos(a), -0.05 + 0.65 * Math.sin(a)]);
}

function synthFace(cx, cy, fw, roll) {
  const c = Math.cos(roll), s = Math.sin(roll);
  const tp = ([lx, ly]) => ({ x: cx + (lx * c - ly * s) * fw, y: cy + (lx * s + ly * c) * fw });
  const p = {};
  for (const k in TEMPLATE) p[k] = tp(TEMPLATE[k]);
  return { cx, cy, fw, roll, p, brows: TPL_BROWS.map(tp), jaw: TPL_JAW.map(tp) };
}

function lerpPt(a, b, k) {
  a.x += (b.x - a.x) * k;
  a.y += (b.y - a.y) * k;
}

export function createShowerFilter(canvas, videoEl, opts = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = F.makeCanvas(W, H);
  const sctx = src.getContext('2d');
  const status = opts.onStatus || (() => {});

  const env = {
    W, H, ctx, src, t: 0, dt: 0,
    temp: 0, tempTarget: 0, band: 'warm',
    hitT: 0, frostBurst: 0,
    steam: 1, warm: 1, cold: 0, frost: 0, ice: 0, shiver: 0,
    sprites: {
      drop: F.dropShadeSprite(),
      soft: F.softSprite(),
      foam: F.foamSprite(false),
      foamIcy: F.foamSprite(true),
      bubbleRim: F.bubbleRimSprite(),
      bubbleHi: F.bubbleHighlightSprite(),
    },
    frostTex: F.frostTexture(W, H),
    face: null,
  };
  const vign = F.vignette(W, H);
  const frostLayer = F.makeCanvas(W, H);
  const fctx = frostLayer.getContext('2d');

  // ---------- face state ----------
  const def = () => synthFace(W / 2, H * 0.55, W * 0.44, 0);
  const cur = def();
  let target = def();
  let lastSeen = -1e9, found = false;
  const face = {
    get cx() { return cur.cx; }, get cy() { return cur.cy; }, get fw() { return cur.fw; }, get roll() { return cur.roll; },
    get p() { return cur.p; }, get brows() { return cur.brows; }, get jaw() { return cur.jaw; },
    get found() { return found; },
    up() { return { x: Math.sin(cur.roll), y: -Math.cos(cur.roll) }; },
    // Head-local coords (face-width units, origin nose, +y toward chin) to canvas px.
    toScreen(lx, ly) {
      const c = Math.cos(cur.roll), s = Math.sin(cur.roll);
      return { x: cur.cx + (lx * c - ly * s) * cur.fw, y: cur.cy + (lx * s + ly * c) * cur.fw };
    },
  };
  env.face = face;

  // ---------- video + tracking ----------
  let tracker = null, lastVT = -1, crop = null;
  if (opts.tracking !== false && videoEl) {
    status('loading face model');
    loadFaceLandmarker().then((t) => { tracker = t; status('face model ready'); })
      .catch((e) => { console.warn('[filter] face model failed', e); status('face model failed, default position'); });
  }
  const videoReady = () => videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0;

  function drawSource(t) {
    if (videoReady()) {
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight, a = W / H;
      let sx, sy, sw, sh;
      if (vw / vh > a) { sh = vh; sw = vh * a; sx = (vw - sw) / 2; sy = 0; }
      else { sw = vw; sh = vw / a; sx = 0; sy = (vh - sh) / 2; }
      crop = { vw, vh, sx, sy, sw, sh };
      sctx.save();
      sctx.translate(W, 0);
      sctx.scale(-1, 1);
      sctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, W, H);
      sctx.restore();
      return true;
    }
    crop = null;
    drawPlaceholder(sctx, W, H, t);
    return false;
  }

  let lastDetect = 0;
  function track(now) {
    if (!tracker || !crop || videoEl.currentTime === lastVT) return;
    lastDetect = now;
    lastVT = videoEl.currentTime;
    let res;
    try { res = tracker.detectForVideo(videoEl, now); } catch (e) { return; }
    const lm = res && res.faceLandmarks && res.faceLandmarks[0];
    if (!lm) { if (found) status('no face, default position'); found = false; return; }
    const { vw, vh, sx, sy, sw, sh } = crop;
    const map = (i) => ({ x: W - ((lm[i].x * vw - sx) / sw) * W, y: ((lm[i].y * vh - sy) / sh) * H });
    const p = {};
    for (const k in IDX) p[k] = map(IDX[k]);
    const roll = Math.atan2(p.eyeR.y - p.eyeL.y, p.eyeR.x - p.eyeL.x);
    const fw = Math.hypot(p.cheekL.x - p.cheekR.x, p.cheekL.y - p.cheekR.y);
    target = { cx: p.nose.x, cy: p.nose.y, fw, roll, p, brows: BROWS.map(map), jaw: JAW.map(map) };
    if (!found) status('tracking face');
    found = true;
    lastSeen = now;
  }

  function updateFace(now, dt, placeholder) {
    if (placeholder) {
      target = synthFace(W / 2 + Math.sin(env.t * 0.7) * W * 0.05, H * 0.56 + Math.sin(env.t * 1.1) * 6, W * 0.42, Math.sin(env.t * 0.9) * 0.12);
    } else if (!found && now - lastSeen > 500) {
      target = def();
    }
    const k = placeholder ? 1 : 1 - Math.exp(-dt * 22);
    cur.cx += (target.cx - cur.cx) * k;
    cur.cy += (target.cy - cur.cy) * k;
    cur.fw += (target.fw - cur.fw) * k;
    let dr = target.roll - cur.roll;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    cur.roll += dr * k;
    for (const key in cur.p) lerpPt(cur.p[key], target.p[key], k);
    cur.brows.forEach((pt, i) => lerpPt(pt, target.brows[i], k));
    cur.jaw.forEach((pt, i) => lerpPt(pt, target.jaw[i], k));
  }

  // ---------- styles ----------
  const instances = {};
  let styleName = STYLES[opts.style] ? opts.style : 'shampoo';
  function getStyle(name) {
    if (!instances[name]) instances[name] = STYLES[name].make(env);
    return instances[name];
  }
  getStyle(styleName).enter?.(env);

  // ---------- shared effects ----------
  const steamPuffs = Array.from({ length: 14 }, () => newPuff(true));
  function newPuff(init) {
    const head = Math.random() < 0.35;
    return {
      head, x: F.rand(0, W), y: init ? F.rand(H * 0.2, H * 1.1) : H + F.rand(20, 120),
      ox: F.rand(-0.4, 0.4), life: init ? F.rand(0, 1) : 0, dur: F.rand(3, 6), size: F.rand(0.35, 0.6), vx: F.rand(-8, 8),
    };
  }
  const breath = { t: 0 };
  const splash = [];

  function drawShared(dt) {
    const { steam, cold, frost, ice } = env;
    // Steam: rising puffs from below and off the hot head.
    if (steam > 0.01) {
      ctx.fillStyle = `rgba(255,248,240,${0.1 * steam})`;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < steamPuffs.length; i++) {
        const s = steamPuffs[i];
        s.life += dt / s.dur;
        if (s.life >= 1) { steamPuffs[i] = newPuff(false); continue; }
        let x, y, size;
        if (s.head) {
          const top = face.toScreen(s.ox, -0.85 - s.life * 1.2);
          x = top.x + Math.sin(env.t + s.dur) * 10; y = top.y; size = face.fw * (0.5 + s.life * 0.9);
        } else {
          s.y -= dt * 55; s.x += s.vx * dt; x = s.x; y = s.y; size = W * s.size * (0.6 + s.life);
        }
        ctx.globalAlpha = Math.sin(Math.PI * s.life) * 0.55 * steam;
        ctx.drawImage(env.sprites.soft, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }
    // Color temperature grade.
    ctx.globalCompositeOperation = 'soft-light';
    if (env.warm > 0.01) {
      ctx.fillStyle = `rgba(255,140,70,${0.35 * env.warm})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (cold > 0.01) {
      ctx.fillStyle = `rgba(60,140,255,${0.55 * cold})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (cold > 0.01) {
      ctx.fillStyle = `rgba(190,220,255,${0.08 * cold})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Cold breath puffs.
    if (cold > 0.35) {
      breath.t += dt;
      const ph = (breath.t % 2.4) / 2.4;
      if (ph < 0.6) {
        const m = face.p.mouth, q = ph / 0.6, size = face.fw * (0.25 + q * 0.9);
        ctx.globalAlpha = Math.sin(Math.PI * q) * 0.55 * F.smooth(0.35, 0.6, cold);
        ctx.drawImage(env.sprites.soft, m.x - size / 2, m.y + face.fw * 0.05 + q * face.fw * 0.3 - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
    }
    // Frost creeping in from the frame edges.
    const fr = F.clamp(frost + env.frostBurst);
    if (fr > 0.01) {
      fctx.globalCompositeOperation = 'source-over';
      fctx.clearRect(0, 0, W, H);
      fctx.drawImage(env.frostTex, 0, 0);
      const r0 = F.lerp(H * 0.78, H * 0.2, fr), r1 = r0 + H * 0.28;
      const gr = fctx.createRadialGradient(W / 2, H * 0.48, r0, W / 2, H * 0.48, r1);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,1)');
      fctx.globalCompositeOperation = 'destination-in';
      fctx.fillStyle = gr;
      fctx.fillRect(0, 0, W, H);
      fctx.globalCompositeOperation = 'source-over';
      const edge = fctx.createRadialGradient(W / 2, H * 0.48, r0 * 0.9, W / 2, H * 0.48, r1 * 1.1);
      edge.addColorStop(0, 'rgba(225,242,255,0)');
      edge.addColorStop(1, `rgba(225,242,255,${0.55 * fr})`);
      fctx.fillStyle = edge;
      fctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(1, fr * 1.4);
      ctx.drawImage(frostLayer, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Icicles hanging from brows and jaw line.
    if (ice > 0.01 && getStyle(styleName).faceIcicles !== false) {
      F.drawIcicles(ctx, face.jaw, ice, face.fw * 0.16, 0);
      F.drawIcicles(ctx, face.brows, ice, face.fw * 0.07, 40);
    }
    // Buzzword hit: cold splash.
    for (let i = splash.length - 1; i >= 0; i--) {
      const d = splash[i];
      d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
      if (d.life <= 0 || d.y > H + 30) { splash.splice(i, 1); continue; }
      F.drawDrop(ctx, src, env.sprites.drop, d.x, d.y, d.r, F.clamp(cold + 0.3), 1 + Math.min(0.6, Math.abs(d.vy) / 1500));
    }
    if (env.hitT > 0.01) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(120,190,255,${0.6 * env.hitT * env.hitT})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(vign, 0, 0);
  }

  // ---------- frame ----------
  let last = performance.now(), raf = 0, alive = true;
  function render(now = performance.now()) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    env.t += dt; env.dt = dt;
    env.temp += (env.tempTarget - env.temp) * (1 - Math.exp(-dt * 3.5));
    env.hitT = Math.max(0, env.hitT - dt * 1.6);
    env.frostBurst = Math.max(0, env.frostBurst - dt * 0.45);
    const T = env.temp;
    env.steam = 1 - F.smooth(0.15, 0.6, T);
    env.warm = 1 - F.smooth(0, 0.45, T);
    env.cold = F.smooth(0.3, 1, T);
    env.frost = F.smooth(0.55, 1, T) * 0.9;
    env.ice = F.clamp(F.smooth(0.72, 1, T) + env.frostBurst * 0.3);
    env.shiver = F.smooth(0.55, 1, T);

    const hasVideo = drawSource(env.t);
    track(now);
    updateFace(now, dt, !hasVideo);

    const style = getStyle(styleName);
    style.update(env);

    ctx.save();
    const shake = env.shiver * 2.5 + env.hitT * 12;
    if (shake > 0.05) {
      const s = 1 + 0.02 + env.hitT * 0.03;
      ctx.translate(W / 2 + F.rand(-shake, shake), H / 2 + F.rand(-shake, shake) * 0.6);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.filter = `saturate(${(1.12 - 0.5 * env.cold).toFixed(3)}) contrast(${(1.04 + 0.06 * env.cold).toFixed(3)}) brightness(${(1.02 + 0.04 * env.cold).toFixed(3)})`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    style.draw(ctx, env);
    drawShared(dt);
    ctx.restore();
  }
  function loop(now) {
    if (!alive) return;
    render(now);
    raf = requestAnimationFrame(loop);
  }
  if (opts.autoRun !== false) raf = requestAnimationFrame(loop);

  return {
    render,
    setTemp(band) {
      if (!(band in BAND_TEMP)) return;
      env.band = band;
      env.tempTarget = BAND_TEMP[band];
    },
    hit() {
      env.hitT = 1;
      env.frostBurst = Math.min(1, env.frostBurst + 0.7);
      for (let i = 0; i < 34; i++) {
        splash.push({ x: F.rand(-20, W + 20), y: F.rand(-60, H * 0.3), vx: F.rand(-160, 160), vy: F.rand(100, 600), r: F.rand(4, 16), life: 1.4 });
      }
      getStyle(styleName).hit?.(env);
    },
    setStyle(name) {
      if (!STYLES[name] || name === styleName) return;
      styleName = name;
      getStyle(name).enter?.(env);
    },
    wipe() { getStyle(styleName).wipe?.(env); },
    get style() { return styleName; },
    get label() { return STYLES[styleName].label; },
    get faceFound() { return found; },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
    },
  };
}

// ---------- placeholder face (no camera) ----------
// Drawn with the same template geometry and sway as synthFace so effects line up.
function drawPlaceholder(g, W, H, t) {
  g.fillStyle = '#cfe3e6';
  g.fillRect(0, 0, W, H);
  // Bathroom tiles
  const ts = W / 7;
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 3;
  for (let x = 0; x <= W; x += ts) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += ts) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const cx = W / 2 + Math.sin(t * 0.7) * W * 0.05, cy = H * 0.56 + Math.sin(t * 1.1) * 6;
  const fw = W * 0.42, roll = Math.sin(t * 0.9) * 0.12;
  // Shoulders
  g.fillStyle = '#e4b48f';
  g.beginPath();
  g.ellipse(cx, H + fw * 0.15, fw * 1.25, fw * 0.75, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - fw * 0.22, cy + fw * 0.3, fw * 0.44, fw * 0.8);
  g.save();
  g.translate(cx, cy);
  g.rotate(roll);
  g.scale(fw, fw);
  const skin = g.createRadialGradient(-0.15, -0.2, 0.1, 0, -0.05, 0.8);
  skin.addColorStop(0, '#f6cfae');
  skin.addColorStop(1, '#d9a07b');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(0, -0.08, 0.5, 0.7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3b2a22';
  g.beginPath();
  g.ellipse(0, -0.55, 0.53, 0.32, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3b2a22';
  g.lineWidth = 0.035;
  g.strokeStyle = '#3b2a22';
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.4, -0.3);
    g.quadraticCurveTo(s * 0.26, -0.37, s * 0.1, -0.31);
    g.stroke();
    const blink = (t % 4) < 0.12 ? 0.1 : 1;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(s * 0.25, -0.18, 0.08, 0.05 * blink, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1c16';
    g.beginPath();
    g.arc(s * 0.25, -0.18, 0.035 * blink, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#b86f5a';
  g.beginPath();
  g.moveTo(0, -0.12);
  g.lineTo(-0.04, 0.02);
  g.lineTo(0.02, 0.03);
  g.stroke();
  g.strokeStyle = '#a0463e';
  g.beginPath();
  g.arc(0, 0.22, 0.14, 0.2, Math.PI - 0.2);
  g.stroke();
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.font = `${Math.round(W * 0.03)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText('no camera: placeholder face', W / 2, H - 16);
}
