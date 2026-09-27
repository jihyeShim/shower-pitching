// Style 2: Steamy Glass. The camera looks through a fogged shower door. A hand-wiped clear patch
// around the face slowly fogs over again; droplets bead, grow, run down and leave clear trails.
// Fog density lives in a small Float32 grid so slow regrowth does not get lost to 8-bit rounding.
import * as F from './fx.js';

export function createGlass(env) {
  const { W, H } = env;
  const MS = 4;
  const mw = Math.ceil(W / MS), mh = Math.ceil(H / MS);
  const fog = new Float32Array(mw * mh).fill(1);
  const mask = F.makeCanvas(mw, mh);
  const mctx = mask.getContext('2d');
  const img = mctx.createImageData(mw, mh);
  for (let i = 0; i < mw * mh; i++) {
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255;
  }
  const bw = Math.round(W / 3), bh = Math.round(H / 3);
  const blur = F.makeCanvas(bw, bh);
  const bctx = blur.getContext('2d');
  const layer = F.makeCanvas(W, H);
  const lctx = layer.getContext('2d');
  const speck = F.condensationTexture(W, H);

  function erase(x, y, r, amt) {
    const mx = x / MS, my = y / MS, mr = r / MS;
    const x0 = Math.max(0, Math.floor(mx - mr)), x1 = Math.min(mw - 1, Math.ceil(mx + mr));
    const y0 = Math.max(0, Math.floor(my - mr)), y1 = Math.min(mh - 1, Math.ceil(my + mr));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const d2 = ((xx - mx) ** 2 + (yy - my) ** 2) / (mr * mr);
        if (d2 >= 1) continue;
        const i = yy * mw + xx;
        fog[i] = Math.max(0, fog[i] - amt * (1 - d2));
      }
    }
  }

  // Droplets
  const beads = Array.from({ length: 110 }, () => ({ x: F.rand(0, W), y: F.rand(0, H), r: Math.pow(Math.random(), 2) * 3 + 1.2 }));
  const drops = Array.from({ length: 24 }, () => newDrop(true));
  function newDrop(init) {
    return { x: F.rand(10, W - 10), y: init ? F.rand(0, H * 0.9) : F.rand(-20, H * 0.4), r: F.rand(3.5, 8), vy: 0, run: false, wob: F.rand(0, F.TAU) };
  }

  let wipe = null, lastWipe = -100;
  function startWipe() {
    const f = env.face;
    wipe = { t: 0, dur: 1.0, cx: f.cx, cy: f.cy - f.fw * 0.1, fw: f.fw, px: null, py: null };
    lastWipe = env.t;
  }

  return {
    faceIcicles: false,
    enter() { startWipe(); },
    wipe() { startWipe(); },
    hit() {
      for (let i = 0; i < fog.length; i++) fog[i] = Math.min(1, fog[i] + 0.55);
      for (let i = 0; i < 8; i++) drops[Math.floor(Math.random() * drops.length)] = { ...newDrop(true), r: F.rand(7, 11) };
    },
    update(env) {
      const dt = env.dt, frozen = env.ice > 0.5;
      // Fog regrows: fast when steamy, slow when cold, not at all when frozen.
      const rate = frozen ? 0 : F.lerp(0.14, 0.035, env.cold);
      if (rate > 0) for (let i = 0; i < fog.length; i++) { const v = fog[i] + rate * dt; fog[i] = v > 1 ? 1 : v; }
      if (!frozen && env.t - lastWipe > 9) startWipe();

      if (wipe) {
        wipe.t += dt;
        const q = Math.min(1, wipe.t / wipe.dur);
        const x = wipe.cx + wipe.fw * 0.85 * Math.sin(q * Math.PI * 5);
        const y = wipe.cy - wipe.fw * 0.95 + q * wipe.fw * 1.95;
        const r = wipe.fw * 0.34;
        if (wipe.px !== null) {
          const n = Math.ceil(Math.hypot(x - wipe.px, y - wipe.py) / (r * 0.3));
          for (let k = 1; k <= n; k++) erase(F.lerp(wipe.px, x, k / n), F.lerp(wipe.py, y, k / n), r, 1);
        }
        wipe.px = x; wipe.py = y;
        if (q >= 1) {
          // A wipe leaves water beads along its lower edge.
          for (let i = 0; i < 6; i++) drops[Math.floor(Math.random() * drops.length)] = { x: wipe.cx + F.rand(-1, 1) * wipe.fw, y: wipe.cy + wipe.fw * F.rand(0.8, 1.1), r: F.rand(6, 10), vy: 0, run: false, wob: F.rand(0, F.TAU) };
          wipe = null;
        }
      }

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!frozen) {
          if (!d.run) {
            d.r += dt * 0.35 * (1 - env.cold);
            if (d.r > 9 && Math.random() < dt * 1.2) d.run = true;
            erase(d.x, d.y, d.r * 1.5, dt * 0.6);
          } else {
            d.vy = Math.min(d.vy + dt * 260, 120 + d.r * 10) * (1 - env.cold * 0.6);
            const oy = d.y;
            d.y += d.vy * dt;
            d.x += Math.sin(d.y * 0.045 + d.wob) * 0.5;
            for (let yy = oy; yy < d.y; yy += 3) erase(d.x, yy - d.r * 0.4, d.r * 1.15, 0.9);
            d.r = Math.max(5, d.r - dt * 0.4);
            if (Math.random() < dt * 3) {
              const b = beads[Math.floor(Math.random() * beads.length)];
              b.x = d.x + F.rand(-2, 2); b.y = d.y - d.r * 2; b.r = F.rand(1.2, 2.5);
            }
            for (const b of beads) {
              if (Math.abs(b.x - d.x) < d.r && Math.abs(b.y - d.y) < d.r) {
                d.r = Math.min(13, Math.sqrt(d.r * d.r + b.r * b.r));
                b.x = F.rand(0, W); b.y = F.rand(0, H);
              }
            }
            if (d.y > H + d.r * 2) drops[i] = newDrop(false);
          }
        }
      }
    },
    draw(ctx, env) {
      for (let i = 0; i < fog.length; i++) img.data[i * 4 + 3] = fog[i] * 255;
      mctx.putImageData(img, 0, 0);

      bctx.filter = 'blur(5px)';
      bctx.drawImage(env.src, -10, -10, bw + 20, bh + 20);
      bctx.filter = 'none';

      lctx.globalCompositeOperation = 'source-over';
      lctx.globalAlpha = 1;
      lctx.clearRect(0, 0, W, H);
      lctx.drawImage(blur, 0, 0, W, H);
      const c = env.cold;
      lctx.fillStyle = `rgba(${Math.round(F.lerp(240, 222, c))},${Math.round(F.lerp(236, 238, c))},${Math.round(F.lerp(232, 252, c))},${0.4 + 0.2 * c})`;
      lctx.fillRect(0, 0, W, H);
      lctx.globalAlpha = 0.85;
      lctx.drawImage(speck, 0, 0);
      if (env.frost > 0.01) {
        lctx.globalAlpha = env.frost;
        lctx.drawImage(env.frostTex, 0, 0);
      }
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(mask, 0, 0, W, H);
      lctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer, 0, 0);

      const frost = F.smooth(0.55, 0.95, env.temp);
      for (const b of beads) ctx.drawImage(env.sprites.drop, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      for (const d of drops) F.drawDrop(ctx, env.src, env.sprites.drop, d.x, d.y, d.r, frost, d.run ? 1.3 : 1.05);

      // Frozen glass: icicles along the door's top frame.
      if (env.ice > 0.01) {
        const a = [];
        for (let i = 0; i < 16; i++) a.push({ x: (i + 0.5) * (W / 16), y: 0 });
        F.drawIcicles(ctx, a, env.ice, H * 0.09, 200);
      }
    },
  };
}
