// Style 3: Rain Head. A cartoon chrome shower head dangles above the player and follows them around
// on a springy pipe, blasting water onto their head. Water splashes off the scalp, pours off the sides
// and streams down the face. Cold makes it sputter. Frozen turns the stream into a solid ice pillar.
import * as F from './fx.js';

const NOZZLES = [];
for (const [ring, n] of [[0, 1], [0.32, 6], [0.62, 11], [0.86, 15]]) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * F.TAU + ring * 3;
    NOZZLES.push([Math.cos(a) * ring, Math.sin(a) * ring]);
  }
}
const CRACKS = Array.from({ length: 6 }, () => {
  const pts = [];
  let u = F.rand(0.15, 0.85);
  const v0 = F.rand(0, 0.5);
  for (let v = v0; v < Math.min(1, v0 + F.rand(0.2, 0.5)); v += 0.07) {
    pts.push([u, v]);
    u += F.rand(-0.06, 0.06);
  }
  return pts;
});
const FROZEN_BUBBLES = Array.from({ length: 14 }, () => [F.rand(0.2, 0.8), F.rand(0.05, 0.95), F.rand(1.5, 4)]);

export function createRain(env) {
  const { W, H } = env;
  const head = { x: W / 2, y: H * 0.12, vx: 0, vy: 0 };
  const parts = [];
  let blast = 0, emitAcc = 0, runAcc = 0;
  const streaks = F.createStreaks(14);

  function geom() {
    const f = env.face, rx = f.fw * 0.36, ry = f.fw * 0.1;
    return { rx, ry, hx: head.x, hy: head.y };
  }

  return {
    hit() { blast = 1; head.vx += F.rand(-400, 400); head.vy -= 200; },
    update(env) {
      const dt = env.dt, f = env.face, t = env.t;
      // Springy follow: target sits above the head.
      const top = f.toScreen(0, -1.95);
      const tx = top.x, ty = Math.max(f.fw * 0.3, Math.min(top.y, f.toScreen(0, -1.1).y));
      head.vx += ((tx - head.x) * 40 - head.vx * 7) * dt;
      head.vy += ((ty - head.y) * 40 - head.vy * 7) * dt;
      head.x += head.vx * dt;
      head.y += head.vy * dt;
      blast = Math.max(0, blast - dt * 1.1);

      const { rx, ry, hx, hy } = geom();
      let flow = (1 - env.ice) * (1 - env.cold * 0.65 * (0.5 + 0.5 * Math.sin(t * 11) * Math.sin(t * 3.7)));
      flow = Math.max(0, flow) + blast * 3;
      emitAcc += flow * 520 * dt;
      while (emitAcc >= 1 && parts.length < 1400) {
        emitAcc -= 1;
        const [u, v] = NOZZLES[Math.floor(Math.random() * NOZZLES.length)];
        parts.push({ k: 0, x: hx + u * rx, y: hy + v * ry + ry * 0.4, vx: u * 70 + F.rand(-15, 15), vy: F.rand(260, 360) + blast * 200, life: 2 });
      }
      emitAcc = Math.min(emitAcc, 5);
      // Water pouring off the sides of the head.
      runAcc += Math.min(flow, 1.5) * 90 * dt;
      while (runAcc >= 1) {
        runAcc -= 1;
        const s = Math.random() < 0.5 ? -1 : 1;
        const p = f.toScreen(s * F.rand(0.5, 0.6), F.rand(-0.55, -0.1));
        parts.push({ k: 2, x: p.x, y: p.y, vx: s * F.rand(10, 45), vy: F.rand(40, 120), life: 1.5 });
      }

      const C = f.toScreen(0, -0.32), R = f.fw * 0.58, R2 = R * R;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += (p.k === 1 ? 1100 : 1400) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.k === 0) {
          const dx = p.x - C.x, dy = p.y - C.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
            if (Math.random() < 0.55) {
              for (let k = 0; k < 2; k++) {
                const sp = F.rand(120, 340);
                parts.push({ k: 1, x: C.x + nx * R, y: C.y + ny * R, vx: nx * sp + F.rand(-90, 90), vy: ny * sp - F.rand(120, 280), life: F.rand(0.3, 0.6), r: F.rand(1.2, 3) });
              }
            }
            parts.splice(i, 1);
            continue;
          }
        }
        if (p.life <= 0 || p.y > H + 20) parts.splice(i, 1);
      }
      F.updateStreaks(streaks, dt, (1 - env.ice) * (1.3 + blast));
    },
    draw(ctx, env) {
      const f = env.face, t = env.t, { rx, ry, hx, hy } = geom();
      const cold = env.cold, iceA = F.smooth(0.8, 1, env.temp);
      F.drawStreaks(ctx, streaks, env, F.smooth(0.55, 0.95, env.temp));

      // Water particles, batched into a few strokes.
      const wc = `${Math.round(F.lerp(215, 160, cold))},${Math.round(F.lerp(235, 210, cold))},255`;
      ctx.lineCap = 'round';
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass ? 'rgba(255,255,255,0.85)' : `rgba(${wc},0.55)`;
        ctx.lineWidth = pass ? 1 : 2.6;
        ctx.beginPath();
        for (const p of parts) {
          if (p.k === 1) continue;
          const len = p.k === 0 ? 0.028 : 0.05;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len);
        }
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${wc},0.9)`;
      ctx.beginPath();
      for (const p of parts) {
        if (p.k !== 1) continue;
        ctx.moveTo(p.x + p.r, p.y);
        ctx.arc(p.x, p.y, p.r, 0, F.TAU);
      }
      ctx.fill();

      // Splash crown on top of the head.
      const flowVis = (1 - env.ice) * (1 - cold * 0.4) + blast;
      if (flowVis > 0.15) {
        const top = f.toScreen(0, -0.9);
        ctx.strokeStyle = `rgba(235,246,255,${0.55 * Math.min(1, flowVis)})`;
        ctx.lineWidth = 3;
        for (let k = 0; k < 9; k++) {
          const a = -Math.PI * (0.1 + 0.8 * (k / 8)) + f.roll;
          const L = f.fw * (0.1 + 0.07 * Math.sin(t * 23 + k * 1.7)) * (1 + blast);
          const ex = top.x + Math.cos(a) * L, ey = top.y + Math.sin(a) * L;
          ctx.beginPath();
          ctx.moveTo(top.x + Math.cos(a) * L * 0.2, top.y);
          ctx.quadraticCurveTo(top.x + Math.cos(a) * L * 0.7, top.y + Math.sin(a) * L * 1.1, ex, ey + L * 0.25);
          ctx.stroke();
          F.drawDrop(ctx, env.src, env.sprites.drop, ex, ey + L * 0.3, 3.5, 0, 1);
        }
      }

      // Ice pillar: the stream froze solid between shower head and scalp.
      if (iceA > 0.01) {
        const top = f.toScreen(0, -0.86);
        const a = { x: hx - rx * 0.85, y: hy + ry * 0.4 }, b = { x: hx + rx * 0.85, y: hy + ry * 0.4 };
        const c = { x: top.x + rx * 0.62, y: top.y }, d = { x: top.x - rx * 0.62, y: top.y };
        ctx.globalAlpha = iceA;
        const gr = ctx.createLinearGradient(a.x, 0, b.x, 0);
        gr.addColorStop(0, 'rgba(235,248,255,0.9)');
        gr.addColorStop(0.25, 'rgba(180,220,248,0.4)');
        gr.addColorStop(0.55, 'rgba(160,210,245,0.3)');
        gr.addColorStop(0.8, 'rgba(225,245,255,0.7)');
        gr.addColorStop(1, 'rgba(245,252,255,0.95)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        const at = (u, v) => ({ x: F.lerp(F.lerp(a.x, b.x, u), F.lerp(d.x, c.x, u), v), y: F.lerp(a.y, d.y, v) });
        for (const cr of CRACKS) {
          ctx.beginPath();
          cr.forEach(([u, v], i) => { const p = at(u, v); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (const [u, v, r] of FROZEN_BUBBLES) {
          const p = at(u, v);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, F.TAU);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(F.lerp(a.x, b.x, 0.18), a.y, rx * 0.12, d.y - a.y);
        ctx.globalAlpha = 1;
      }

      drawShowerHead(ctx, hx, hy, rx, ry, f.fw, cold, blast, t);
      if (env.ice > 0.01) {
        const anchors = [];
        for (let i = 0; i < 11; i++) {
          const u = -0.92 + (i / 10) * 1.84;
          anchors.push({ x: hx + u * rx, y: hy + ry * Math.sqrt(1 - u * u) });
        }
        F.drawIcicles(ctx, anchors, env.ice, f.fw * 0.12, 300);
      }
    },
  };
}

function drawShowerHead(ctx, hx, hy, rx, ry, fw, cold, blast, t) {
  const jig = blast * Math.sin(t * 60) * 4;
  hx += jig;
  const px = hx + fw * 0.55, neckY = hy - fw * 0.22;
  const chrome = (x0, x1) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#5f6a75');
    g.addColorStop(0.3, '#f5f9fc');
    g.addColorStop(0.5, '#a3afba');
    g.addColorStop(0.75, '#e6ecf1');
    g.addColorStop(1, '#56606a');
    return g;
  };
  // Pipe from the ceiling, elbow, arm to the neck.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4b555e';
  ctx.lineWidth = fw * 0.085;
  ctx.beginPath();
  ctx.moveTo(px, -20);
  ctx.lineTo(px, neckY - fw * 0.12);
  ctx.lineTo(hx + fw * 0.05, neckY);
  ctx.stroke();
  ctx.strokeStyle = chrome(px - fw * 0.04, px + fw * 0.04);
  ctx.lineWidth = fw * 0.065;
  ctx.beginPath();
  ctx.moveTo(px, -20);
  ctx.lineTo(px, neckY - fw * 0.12);
  ctx.lineTo(hx + fw * 0.05, neckY);
  ctx.stroke();
  // Cone body
  ctx.fillStyle = chrome(hx - rx, hx + rx);
  ctx.beginPath();
  ctx.moveTo(hx - fw * 0.08, neckY);
  ctx.lineTo(hx - rx, hy);
  ctx.ellipse(hx, hy, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(hx + fw * 0.08, neckY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,50,60,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Nozzle plate (seen slightly from below)
  const pg = ctx.createLinearGradient(hx - rx, hy, hx + rx, hy);
  pg.addColorStop(0, '#6d7883');
  pg.addColorStop(0.4, '#c9d2da');
  pg.addColorStop(1, '#6d7883');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.ellipse(hx, hy + ry * 0.25, rx * 0.97, ry * 0.8, 0, 0, F.TAU);
  ctx.fill();
  ctx.fillStyle = cold > 0.6 ? '#a8cde8' : '#2b333b';
  for (const [u, v] of NOZZLES) {
    ctx.beginPath();
    ctx.ellipse(hx + u * rx * 0.85, hy + ry * 0.25 + v * ry * 0.65, 2.2, 1.3, 0, 0, F.TAU);
    ctx.fill();
  }
  // Rim highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(hx, hy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  // Frost on the chrome when cold
  if (cold > 0.3) {
    ctx.fillStyle = `rgba(225,242,255,${0.45 * (cold - 0.3)})`;
    ctx.beginPath();
    ctx.moveTo(hx - fw * 0.08, neckY);
    ctx.lineTo(hx - rx, hy);
    ctx.ellipse(hx, hy, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(hx + fw * 0.08, neckY);
    ctx.closePath();
    ctx.fill();
  }
}
