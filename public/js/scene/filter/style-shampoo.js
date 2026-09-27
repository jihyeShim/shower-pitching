// Style 1: Shampoo Hero. A big foam crown on the head (follows tilt), iridescent bubbles that pop and
// respawn, foam drips sliding down the temples, water streaks running down the face.
import * as F from './fx.js';

export function createShampoo(env) {
  const shadow = F.softSprite('20,30,40');
  const { sprites } = env;

  // Foam mass: dense matte blobs forming a soft-serve crown. Coords: forehead-local, face-width units.
  const mass = [];
  for (let i = 0; i < 52; i++) {
    const u = Math.sign(Math.random() - 0.5) * Math.pow(Math.random(), 0.8);
    const v = Math.pow(Math.random(), 0.7);
    const cap = 0.16 + 0.44 * Math.sqrt(Math.max(0, 1 - u * u));
    mass.push({ x: u * 0.6, y: 0.07 - v * cap, r: (0.075 + 0.07 * Math.random()) * (1 - 0.35 * Math.abs(u)), ph: F.rand(0, F.TAU) });
  }
  // Soft-serve peak
  for (let i = 0; i < 6; i++) mass.push({ x: F.rand(-0.12, 0.12), y: -0.55 - i * 0.035, r: 0.09 - i * 0.01, ph: F.rand(0, F.TAU) });
  mass.sort((a, b) => a.y - b.y);

  const bubbles = Array.from({ length: 30 }, () => spawnBubble(true));
  function spawnBubble(init) {
    const m = mass[Math.floor(Math.random() * mass.length)];
    const a = F.rand(-Math.PI, 0);
    return {
      x: m.x + Math.cos(a) * m.r * 0.8, y: m.y + Math.sin(a) * m.r * 0.8,
      r: F.rand(0.022, 0.075), rot: F.rand(0, F.TAU), spin: F.rand(-0.8, 0.8),
      life: F.rand(1.5, 6), grow: init ? 1 : 0, pop: -1,
    };
  }

  const drips = [0, 1, 2, 3].map((i) => ({ side: i % 2, p: F.rand(-0.3, 0.9), speed: F.rand(0.12, 0.22), w: F.rand(0.8, 1.2) }));
  const streaks = F.createStreaks(11);

  function local(lx, ly) {
    const f = env.face, a = f.p.forehead, c = Math.cos(f.roll), s = Math.sin(f.roll), w = f.fw;
    return { x: a.x + (lx * c - ly * s) * w, y: a.y + (lx * s + ly * c) * w };
  }
  function bez(p0, p1, p2, t) {
    const cx = 2 * p1.x - (p0.x + p2.x) / 2, cy = 2 * p1.y - (p0.y + p2.y) / 2, u = 1 - t;
    return { x: u * u * p0.x + 2 * t * u * cx + t * t * p2.x, y: u * u * p0.y + 2 * t * u * cy + t * t * p2.y };
  }

  return {
    update(env) {
      const dt = env.dt, frozen = env.ice > 0.5;
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.rot += b.spin * dt * (1 - env.ice);
        if (b.pop >= 0) {
          b.pop += dt;
          if (b.pop > 0.2) bubbles[i] = spawnBubble(false);
          continue;
        }
        b.grow = Math.min(1, b.grow + dt * 3);
        if (!frozen) b.life -= dt * (1 - env.cold * 0.7);
        if (b.life <= 0) b.pop = 0;
      }
      for (const d of drips) {
        d.p += d.speed * dt * (1 - env.ice) * (1 + env.warm * 0.4);
        if (d.p > 1.25) { d.p = F.rand(-0.35, -0.05); d.speed = F.rand(0.12, 0.22); }
      }
      F.updateStreaks(streaks, dt, (1 - env.ice) * (0.7 + 0.5 * env.warm));
    },
    hit() {
      for (const b of bubbles) if (b.pop < 0) b.pop = F.rand(0, 0.1);
    },
    draw(ctx, env) {
      const f = env.face, w = f.fw, t = env.t, ice = F.smooth(0.55, 0.95, env.temp);
      F.drawStreaks(ctx, streaks, env, ice);

      // Foam drips down the temples
      const paths = [
        [f.p.templeL, f.p.cheekL, f.jaw[2]],
        [f.p.templeR, f.p.cheekR, f.jaw[10]],
      ];
      ctx.lineCap = 'round';
      for (const d of drips) {
        const [p0, p1, p2] = paths[d.side];
        const t1 = F.clamp(d.p), t0 = F.clamp(d.p - 0.4);
        if (t1 <= 0.01) continue;
        const pts = [];
        for (let i = 0; i <= 8; i++) pts.push(bez(p0, p1, p2, F.lerp(t0, t1, i / 8)));
        const fade = d.p > 1 ? 1 - (d.p - 1) / 0.25 : 1;
        ctx.globalAlpha = fade;
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? (ice > 0.5 ? '#eef8ff' : '#ffffff') : (ice > 0.5 ? '#9ec3e2' : '#c3cedb');
          for (let i = 1; i < pts.length; i++) {
            ctx.lineWidth = w * 0.05 * d.w * (0.45 + 0.55 * (i / pts.length)) * (pass ? 0.72 : 1);
            ctx.beginPath();
            ctx.moveTo(pts[i - 1].x - pass, pts[i - 1].y - pass);
            ctx.lineTo(pts[i].x - pass, pts[i].y - pass);
            ctx.stroke();
          }
        }
        const tip = pts[pts.length - 1], tr = w * 0.036 * d.w;
        ctx.drawImage(ice > 0.5 ? sprites.foamIcy : sprites.foam, tip.x - tr, tip.y - tr, tr * 2, tr * 2.2);
        ctx.globalAlpha = 1;
      }

      // Contact shadow where the foam sits on the hairline
      const sh = local(0, 0.1);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(f.roll);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(shadow, -w * 0.75, -w * 0.18, w * 1.5, w * 0.36);
      ctx.restore();
      ctx.globalAlpha = 1;

      // Foam crown
      const bob = Math.sin(t * 2.2) * 0.006;
      for (const m of mass) {
        const wob = Math.sin(t * 1.7 + m.ph) * 0.006 * (1 - env.ice);
        const p = local(m.x, m.y + bob + wob), r = m.r * w * (1 + wob);
        if (ice < 0.99) {
          ctx.globalAlpha = 1;
          ctx.drawImage(sprites.foam, p.x - r, p.y - r, r * 2, r * 2);
        }
        if (ice > 0.01) {
          ctx.globalAlpha = ice;
          ctx.drawImage(sprites.foamIcy, p.x - r, p.y - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1;

      // Iridescent bubbles
      for (const b of bubbles) {
        const p = local(b.x, b.y + bob), r = b.r * w * (0.3 + 0.7 * b.grow);
        if (b.pop >= 0) {
          const q = b.pop / 0.2;
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * (1 + q * 0.7), 0, F.TAU);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${1 - q})`;
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * F.TAU + b.rot;
            ctx.fillRect(p.x + Math.cos(a) * r * (1.2 + q * 1.5), p.y + Math.sin(a) * r * (1.2 + q * 1.5), 2, 2);
          }
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(b.rot + t * 0.4 * (1 - env.ice));
        ctx.globalAlpha = 1 - ice * 0.6;
        ctx.drawImage(sprites.bubbleRim, -r, -r, r * 2, r * 2);
        ctx.restore();
        ctx.globalAlpha = 1;
        if (ice > 0.3) {
          ctx.fillStyle = `rgba(225,242,255,${0.55 * ice})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.95, 0, F.TAU);
          ctx.fill();
        }
        ctx.drawImage(sprites.bubbleHi, p.x - r, p.y - r, r * 2, r * 2);
      }

      // Frozen crown gets icicles along its bottom edge
      if (env.ice > 0.01) {
        const anchors = [];
        for (let i = 0; i < 9; i++) anchors.push(local(-0.55 + i * 0.1375, 0.1 + 0.05 * Math.sin((i / 8) * Math.PI)));
        F.drawIcicles(ctx, anchors, env.ice, w * 0.14, 90);
      }
    },
  };
}
