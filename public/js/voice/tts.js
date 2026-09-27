// VC voices and sound effects (interaction owner). Emits vc:done exactly once per line.
// All sound is synthesized with Web Audio; no audio files.
import { bus } from '../bus.js';
import { VCS, VC_IDS } from '../characters.js';
import { HOST_LINE, START_TEMP, FREEZE_AT, INTERJECT_HOLD_MS } from '../config.js';

const synth = window.speechSynthesis;

/* ---------------- Voices ---------------- */

// Novelty macOS voices that sound like jokes, not people.
const NOVELTY = /bad news|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const PREFERRED = [
  /google us english/i, /google uk english female/i, /google uk english male/i,
  /samantha/i, /daniel/i, /karen/i, /moira/i, /tessa/i, /alex/i, /serena/i, /arthur/i, /martha/i, /aaron/i, /nicky/i, /rishi/i,
];
let voiceMap = null;

function rank(v) {
  const i = PREFERRED.findIndex((re) => re.test(v.name));
  let score = i === -1 ? 50 : i;
  if (/premium|enhanced|natural/i.test(v.name)) score -= 20;
  if (v.lang === 'en-US') score -= 2;
  return score;
}

function buildVoiceMap() {
  const all = synth?.getVoices() ?? [];
  const en = all.filter((v) => /^en/i.test(v.lang) && !NOVELTY.test(v.name));
  const pool = (en.length ? en : all.filter((v) => /^en/i.test(v.lang))).sort((a, b) => rank(a) - rank(b));
  if (!pool.length) return null;
  // Samantha is the demo founder's recorded voice; keep her out of the tub so the VCs never sound like the founder.
  const free = pool.filter((v) => !/samantha/i.test(v.name));
  const used = new Set();
  const take = (v) => (used.add(v), v);
  const byName = (name) => free.find((v) => !used.has(v) && v.name.toLowerCase().startsWith(name.toLowerCase()));
  const map = { host: take(byName('Google US English') ?? free[0] ?? pool[0]) };
  // Each VC gets its preferred voice (characters.js voice.prefer), otherwise the next unused one.
  for (const id of VC_IDS) {
    const pref = (VCS[id].voice.prefer ?? []).map(byName).find(Boolean);
    map[id] = take(pref ?? free.find((v) => !used.has(v)) ?? free[0] ?? pool[0]);
  }
  return map;
}

const voiceFor = (id) => (voiceMap ??= buildVoiceMap())?.[id] ?? null;

/* ---------------- Speech with exactly-once completion ---------------- */

const pending = new Set(); // finish functions of lines not yet done

function speak(text, { voice, pitch = 1, rate = 1, lang = 'en-US' }, onDone) {
  let done = false;
  const timers = [];
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    pending.delete(finish);
    onDone?.();
  };
  pending.add(finish);
  const estimate = 1200 + (text.length * 75) / rate;
  if (!synth) {
    timers.push(setTimeout(finish, estimate));
    return finish;
  }
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? lang;
  u.pitch = pitch;
  u.rate = rate;
  u.volume = 1;
  u.onstart = () => timers.push(setTimeout(finish, estimate + 2500));
  u.onend = finish;
  u.onerror = finish;
  // Never started (queue stuck, no voices): give up after a generous bound.
  timers.push(setTimeout(finish, estimate * 2 + 6000));
  synth.resume(); // Chrome can get stuck paused
  synth.speak(u);
  return finish;
}

function cancelAll() {
  // Finish first so each outstanding line still gets its single vc:done.
  [...pending].forEach((f) => f());
  synth?.cancel();
}

/* ---------------- Web Audio ---------------- */

// Notification chime before a VC speaks: a bright two-tone "ding-dong" for interjections,
// one soft blip for heckles.
// "Your turn" cue after an interjection: a quick rising two-note pluck.
function yourTurn() {
  const a = ensureAudio();
  if (!a) return;
  [[659.25, 0], [987.77, 0.09]].forEach(([freq, at]) => {
    const t = a.currentTime + at;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  });
}

function chime(loud) {
  const a = ensureAudio();
  if (!a) return;
  const notes = loud ? [[1318.5, 0], [987.8, 0.14]] : [[1567.98, 0]];
  for (const [freq, at] of notes) {
    const t = a.currentTime + at;
    const o = a.createOscillator();
    const o2 = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o2.type = 'sine';
    o.frequency.value = freq;
    o2.frequency.value = freq * 2.01; // soft bell overtone
    const peak = loud ? 0.6 : 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (loud ? 0.9 : 0.45));
    const g2 = a.createGain();
    g2.gain.value = 0.18;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(master);
    o.start(t);
    o2.start(t);
    o.stop(t + 1);
    o2.stop(t + 1);
  }
}

let ac = null;
let master, noiseBuf;
let water = null; // { src, hp, lp, gain, lfo }
let tub = null; // { rumble, gain, timer }
let cold = 0;
let duck = 1;

function ensureAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ac.destination);
    // 2 s of pinkish noise, shared by every noise voice.
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

function noise(t0, dur) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.start(t0, Math.random() * 1.5);
  if (dur) src.stop(t0 + dur);
  return src;
}

function filt(type, freq, q = 0.7) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function env(t0, peak, attack, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function tone(type, freq, t0, peak, attack, decay, dest = master) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = env(t0, peak, attack, decay);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.05);
  return o;
}

/* Shower water: broad warm hiss that turns thin, bright and quieter as it gets cold. */
function startWater() {
  if (!ensureAudio() || water) return;
  const t = ac.currentTime;
  const src = noise(t);
  const hp = filt('highpass', 250);
  const lp = filt('lowpass', 3200);
  const peak = filt('peaking', 1200, 0.8);
  peak.gain.value = 3;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  // Slow wobble so it sounds like falling water, not a fan.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.35;
  const lfoAmt = ac.createGain();
  lfoAmt.gain.value = 0.015;
  lfo.connect(lfoAmt).connect(gain.gain);
  lfo.start(t);
  src.connect(hp).connect(peak).connect(lp).connect(gain).connect(master);
  water = { src, hp, lp, peak, gain, lfo };
  applyCold(0.8);
}

function stopWater(fade = 0.6) {
  if (!water) return;
  const { src, gain, lfo } = water;
  const t = ac.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setTargetAtTime(0.0001, t, fade / 3);
  src.stop(t + fade + 0.2);
  lfo.stop(t + fade + 0.2);
  water = null;
}

/* Hot tub: low rumble plus random bubble blips, quietly under the shower. */
function startTub() {
  if (!ensureAudio() || tub) return;
  const t = ac.currentTime;
  const rumble = noise(t);
  const lp = filt('lowpass', 180);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.setTargetAtTime(0.05, t, 0.8);
  rumble.connect(lp).connect(gain).connect(master);
  const bus2 = ac.createGain();
  bus2.gain.value = 0.9;
  bus2.connect(master);
  const blip = () => {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t0 = ac.currentTime + Math.random() * 0.25;
      const f = 180 + Math.random() * 260;
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 2.4, t0 + 0.06);
      const g = env(t0, 0.02 + Math.random() * 0.02, 0.005, 0.07);
      o.connect(g).connect(bus2);
      o.start(t0);
      o.stop(t0 + 0.12);
    }
  };
  const timer = setInterval(blip, 220);
  tub = { rumble, gain, bus2, timer };
}

function stopTub(fade = 0.6) {
  if (!tub) return;
  const t = ac.currentTime;
  clearInterval(tub.timer);
  tub.gain.gain.setTargetAtTime(0.0001, t, fade / 3);
  tub.bus2.gain.setTargetAtTime(0.0001, t, fade / 3);
  tub.rumble.stop(t + fade + 0.2);
  tub = null;
}

function applyCold(ramp = 0.8) {
  if (!water) return;
  const t = ac.currentTime;
  const tc = ramp / 3;
  // warm: full, low-mid body. cold: hiss only, thin and icy.
  water.hp.frequency.setTargetAtTime(250 + cold * 2200, t, tc);
  water.lp.frequency.setTargetAtTime(3200 + cold * 6000, t, tc);
  water.peak.frequency.setTargetAtTime(1200 + cold * 4500, t, tc);
  water.gain.gain.setTargetAtTime((0.16 - cold * 0.08) * duck, t, tc);
  if (tub) tub.gain.gain.setTargetAtTime(0.05 * (1 - cold * 0.4) * duck, t, tc);
}

/* Buzzword: sizzle on the skin plus an ice crack. */
function sizzle() {
  if (!ensureAudio()) return;
  const t = ac.currentTime;
  // Sizzle: bright noise chopped into crackles.
  const s = noise(t, 0.7);
  const hp = filt('highpass', 3500);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 28; i++) {
    const ti = t + i * 0.022 + Math.random() * 0.01;
    const a = 0.35 * (1 - i / 28) * (0.4 + Math.random() * 0.6);
    g.gain.setValueAtTime(a, ti);
    g.gain.setValueAtTime(a * 0.25, ti + 0.012);
  }
  g.gain.setTargetAtTime(0.0001, t + 0.62, 0.03);
  s.connect(hp).connect(g).connect(master);
  // Ice crack: sharp click then a resonant sweep downward.
  const c = noise(t + 0.04, 0.35);
  const bp = filt('bandpass', 3200, 9);
  bp.frequency.setValueAtTime(3200, t + 0.04);
  bp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
  const cg = env(t + 0.04, 0.9, 0.002, 0.28);
  c.connect(bp).connect(cg).connect(master);
  tone('triangle', 2400 + Math.random() * 800, t + 0.04, 0.08, 0.002, 0.15);
}

/* Frozen: pipes seize, a freezing whoosh, crystal shimmer, final crack. */
function stingFrozen() {
  if (!ensureAudio()) return;
  const t = ac.currentTime;
  const w = noise(t, 1.6);
  const bp = filt('bandpass', 5000, 1.5);
  bp.frequency.setValueAtTime(6000, t);
  bp.frequency.exponentialRampToValueAtTime(500, t + 1.4);
  const wg = env(t, 0.5, 0.15, 1.3);
  w.connect(bp).connect(wg).connect(master);
  [2093, 2637, 3136, 3951, 4699].forEach((f, i) => {
    tone('sine', f * (1 + (Math.random() - 0.5) * 0.01), t + 0.25 + i * 0.09, 0.07, 0.005, 1.6);
  });
  const c = noise(t + 1.2, 0.5);
  const cb = filt('bandpass', 1800, 6);
  c.connect(cb).connect(env(t + 1.2, 1.2, 0.002, 0.4)).connect(master);
  tone('sine', 70, t + 1.2, 0.3, 0.005, 0.5);
}

/* Funded: ka-ching, then a short brass-ish fanfare. */
function stingFunded() {
  if (!ensureAudio()) return;
  const t = ac.currentTime;
  // Drawer rattle.
  const r = noise(t, 0.25);
  r.connect(filt('bandpass', 900, 2)).connect(env(t, 0.35, 0.01, 0.2)).connect(master);
  // Bell: two strikes with inharmonic partials.
  [[t + 0.12, 1568], [t + 0.24, 2093]].forEach(([ti, f]) => {
    [1, 2.76, 5.4].forEach((m, i) => tone('sine', f * m, ti, 0.22 / (i + 1), 0.002, 1.1 - i * 0.3));
  });
  // Fanfare: C E G C, then a held chord.
  const brass = ac.createGain();
  brass.gain.value = 1;
  const lp = filt('lowpass', 2600);
  brass.connect(lp).connect(master);
  [523, 659, 784].forEach((f, i) => tone('sawtooth', f, t + 0.55 + i * 0.12, 0.09, 0.02, 0.16, brass));
  [523, 659, 784, 1047].forEach((f) => tone('sawtooth', f, t + 0.95, 0.06, 0.04, 1.3, brass));
}

function setDuck(on) {
  duck = on ? 0.45 : 1;
  applyCold(0.3);
}

/* ---------------- Wiring ---------------- */

export function init() {
  synth?.getVoices();
  synth?.addEventListener?.('voiceschanged', () => (voiceMap = null));

  const wake = () => ensureAudio();
  bus.on('request:start', wake);
  bus.on('request:restart', wake);

  bus.on('phase', ({ phase }) => {
    if (phase === 'intro') {
      cancelAll();
      cold = 0;
      duck = 1;
      startWater();
      startTub();
    }
    if (phase === 'lobby') {
      cancelAll();
      stopWater(0.3);
      stopTub(0.3);
    }
    if (phase === 'ending') stopWater(1.2); // the water stops the moment time is up
    if (phase === 'result') stopTub(1.5);
  });

  bus.on('temp', ({ temp }) => {
    cold = Math.max(0, Math.min(1, (START_TEMP - temp) / (START_TEMP - FREEZE_AT)));
    applyCold();
  });

  bus.on('buzzword', sizzle);

  bus.on('ending', ({ type }) => {
    if (type === 'frozen') stingFrozen();
    else stingFunded();
  });

  // VCs are silent: a chime announces them and the line stays on screen for reading time.
  // (Browser speech synthesis was unreliable across voices and stalled the clock.)
  let talking = 0;
  bus.on('vc:say', ({ vcId, text, kind, id }) => {
    talking++;
    setDuck(true);
    const loud = kind === 'interject' || kind === 'ending';
    chime(loud);
    const len = String(text || '').length;
    const ms = kind === 'interject' ? INTERJECT_HOLD_MS : loud ? Math.min(4000, Math.max(2200, 1300 + len * 45)) : Math.min(3000, Math.max(1600, 900 + len * 35));
    setTimeout(() => {
      talking = Math.max(0, talking - 1);
      if (!talking) setDuck(false);
      // User feedback: tell the founder when the floor is theirs again.
      if (kind === 'interject') yourTurn();
      bus.emit('vc:done', { vcId, id });
    }, ms);
  });
}
