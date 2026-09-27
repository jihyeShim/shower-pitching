// Game flow (lead owner): phases, timer, temperature, VC schedule, ending.
// Only this module decides numbers. Everyone else just reacts to events.
import { bus } from './bus.js';
import * as C from './config.js';
import { VCS, VC_IDS, pick } from './characters.js';
import { fetchVcLine, fetchEnding } from './api.js';

export const state = {
  phase: 'lobby',
  company: '',         // entered in the lobby; VCs and the result card use it
  lineup: [],          // VC ids seated in the tub this run, left to right
  temp: C.START_TEMP,
  minTemp: C.START_TEMP,
  elapsed: 0,
  remaining: C.PITCH_SECONDS,
  transcript: '',
  buzzwords: [],
  spoken: [],
};

let tickTimer = null;
let introTimer = null;
let nextInterject = 0;
let lastCheer = 0;
let reactions = 0;
let speaking = 0;
const holding = new Set(); // line ids of interjections holding the clock
let lineSeq = 0;
let runId = 0;

function setPhase(phase) {
  state.phase = phase;
  bus.emit('phase', { phase });
}

function clearTimers() {
  clearInterval(tickTimer);
  clearTimeout(introTimer);
  tickTimer = introTimer = null;
}

function reset() {
  clearTimers();
  runId++;
  Object.assign(state, {
    temp: C.START_TEMP,
    minTemp: C.START_TEMP,
    elapsed: 0,
    remaining: C.PITCH_SECONDS,
    transcript: '',
    buzzwords: [],
    spoken: [],
  });
  nextInterject = 0;
  lastCheer = 0;
  reactions = 0;
  speaking = 0;
  holding.clear();
}

function say(vcId, text, kind) {
  state.spoken.push({ vcId, text });
  speaking++;
  const id = ++lineSeq;
  if (kind === 'interject') holding.add(id);
  bus.emit('vc:say', { vcId, text, kind, id });
}

function seatLineup() {
  const others = VC_IDS.filter((id) => id !== C.CHEER_VC).sort(() => Math.random() - 0.5);
  const picks = others.slice(0, C.LINEUP_RANDOM);
  // Cheer VC sits in the middle so the loudest voice is center stage.
  state.lineup = [...picks.slice(0, 1), C.CHEER_VC, ...picks.slice(1)];
  bus.emit('lineup', { vcIds: state.lineup });
}

// Random picks interject in seat order; the cheer VC only cheers.
const interjectors = () => state.lineup.filter((id) => id !== C.CHEER_VC);

function emitTemp(prev) {
  bus.emit('temp', { temp: state.temp, prev, band: C.bandFor(state.temp) });
}

export function start(payload = {}) {
  const company = String(payload.company ?? '').trim().slice(0, 40);
  if (company) state.company = company;
  if (state.phase !== 'lobby' && state.phase !== 'result') return;
  reset();
  setPhase('intro');
  emitTemp(state.temp);
  introTimer = setTimeout(beginPitch, C.INTRO_SECONDS * 1000);
}

function beginPitch() {
  setPhase('pitching');
  bus.emit('timer', { remaining: state.remaining, elapsed: state.elapsed });
  tickTimer = setInterval(tick, 1000);
}

function tick() {
  // The clock stops during an interjection, so it never eats pitch time.
  // Buzzword cheers and jabs overlap the pitch like heckles and do not stop it.
  if (holding.size) return;
  state.elapsed++;
  state.remaining = C.PITCH_SECONDS - state.elapsed;
  bus.emit('timer', { remaining: state.remaining, elapsed: state.elapsed });
  if (state.elapsed === C.INTERJECT_AT[nextInterject]) interject();
  if (state.remaining <= 0) finish();
}

export async function interject() {
  if (state.phase !== 'pitching' || nextInterject >= interjectors().length) return;
  const vcId = interjectors()[nextInterject++];
  const myRun = runId;
  const text = await fetchVcLine({
    company: state.company,
    vcId,
    transcript: state.transcript,
    buzzwords: state.buzzwords.map((b) => b.word),
    temp: state.temp,
    elapsed: state.elapsed,
  });
  if (myRun === runId && state.phase === 'pitching') say(vcId, text, 'interject');
}

function onBuzzword({ word }) {
  if (state.phase !== 'pitching') return;
  state.buzzwords.push({ word, t: state.elapsed });
  const prev = state.temp;
  state.temp = Math.max(C.MIN_TEMP, state.temp - C.DROP_PER_BUZZWORD);
  state.minTemp = Math.min(state.minTemp, state.temp);
  emitTemp(prev);

  const now = performance.now();
  if (!speaking && now - lastCheer > C.CHEER_COOLDOWN_MS) {
    lastCheer = now;
    // Alternate: the hype VC cheers, then a skeptic in the tub jabs at the same word.
    const skeptics = state.lineup.filter((id) => id !== C.CHEER_VC && VCS[id]?.jabs);
    const jab = reactions++ % 2 === 1 && skeptics.length;
    const vcId = jab ? pick(skeptics) : C.CHEER_VC;
    const pool = jab ? VCS[vcId].jabs : VCS[C.CHEER_VC].cheers;
    say(vcId, pick(pool).replaceAll('{word}', word), jab ? 'jab' : 'cheer');
  }
}

function onWarmword({ word }) {
  if (state.phase !== 'pitching') return;
  const prev = state.temp;
  state.temp = Math.min(C.START_TEMP, state.temp + C.RISE_PER_WARMWORD);
  if (state.temp === prev) return;
  emitTemp(prev);
  const now = performance.now();
  if (!speaking && now - lastCheer > C.CHEER_COOLDOWN_MS) {
    lastCheer = now;
    const vcId = pick(state.lineup.filter((id) => VCS[id]?.praise));
    if (vcId) say(vcId, pick(VCS[vcId].praise), 'praise');
  }
}

function worstWord() {
  const counts = {};
  for (const { word } of state.buzzwords) counts[word] = (counts[word] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function finish(forceType) {
  if (state.phase !== 'pitching' && !forceType) return;
  clearTimers();
  const myRun = runId;
  if (forceType) {
    // Debug shortcut: jump the temperature so visuals match the forced ending.
    const prev = state.temp;
    state.temp = forceType === 'frozen' ? -10 : Math.max(state.temp, 25);
    state.minTemp = Math.min(state.minTemp, state.temp);
    emitTemp(prev);
  }
  setPhase('ending');
  const type = forceType ?? (state.temp >= C.FUND_AT ? 'funded' : 'frozen');
  const endSay = C.ENDING_SAY[type];
  say(endSay.vcId, endSay.text, 'ending');

  const stats = {
    buzzwordCount: state.buzzwords.length,
    minTemp: state.minTemp,
    finalTemp: state.temp,
    worstWord: worstWord(),
  };
  const letter = await fetchEnding({
    company: state.company,
    type,
    transcript: state.transcript,
    buzzwords: state.buzzwords.map((b) => b.word),
    minTemp: state.minTemp,
    worstWord: stats.worstWord,
  });
  if (myRun !== runId) return;
  bus.emit('ending', { type, stats, letter });
  introTimer = setTimeout(() => myRun === runId && setPhase('result'), C.ENDING_REVEAL_MS);
}

export function restart() {
  reset();
  seatLineup();
  setPhase('lobby');
}

export function init() {
  bus.on('request:start', start);
  bus.on('request:restart', () => {
    restart();
    start();
  });
  bus.on('buzzword', onBuzzword);
  bus.on('warmword', onWarmword);
  bus.on('transcript', ({ final }) => (state.transcript = final));
  bus.on('vc:done', ({ id }) => {
    speaking = Math.max(0, speaking - 1);
    holding.delete(id);
  });
  seatLineup();
  setPhase('lobby');
}
