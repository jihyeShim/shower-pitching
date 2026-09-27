// Every number and word list lives here (PRD 2부 13장). Do not hardcode these elsewhere.
const params = new URLSearchParams(location.search);

export const FLAGS = {
  debug: params.has('debug'),
  nocam: params.has('nocam'),
  nomic: params.has('nomic'),
};

export const PITCH_SECONDS = 60;
export const INTRO_SECONDS = 5;
export const START_TEMP = 40;
export const DROP_PER_BUZZWORD = 6;
// Evidence warms the water back up: real customers, money, numbers.
export const RISE_PER_WARMWORD = 5;
export const WARMWORDS = ['pay us', 'paying', 'dollars', 'percent', 'retention', 'revenue of', 'profitable', 'interviewed', 'signed'];
export const MIN_TEMP = -20;
export const WORD_COOLDOWN_MS = 1500;
export const INTERJECT_AT = [20, 40];
// Lineup per run: CHEER_VC always sits in the tub, plus random picks from the rest.
// The random picks interject in seat order at INTERJECT_AT.
export const LINEUP_RANDOM = 2;
export const CHEER_VC = 'hype';
export const CHEER_COOLDOWN_MS = 8000;
// An interjection holds the clock for exactly this long.
export const INTERJECT_HOLD_MS = 2700; // plus up to one clock tick ≈ 3 s on screen
export const LLM_TIMEOUT_MS = 3000;
export const ENDING_TIMEOUT_MS = 6000;
export const ENDING_REVEAL_MS = 4000;
export const MAX_PARTICLES = 3000;

// Continuous coldness 0..1 per band. world.js eases toward it; scene modules read world.getCold().
export const BAND_COLD = { warm: 0, lukewarm: 0.34, cold: 0.67, frozen: 1 };
export const COLD_EASE_SECONDS = 1;
// Face window filter: 'auto' follows the temperature band (warm shampoo, lukewarm glass, cold/frozen rain),
// or force one of 'shampoo' | 'glass' | 'rain' with ?filter= (see samples/filter-lab).
export const FACE_FILTER_STYLE = new URLSearchParams(location.search).get('filter') || 'auto';
export const FILTER_BY_BAND = { warm: 'shampoo', lukewarm: 'glass', cold: 'rain', frozen: 'rain' };

export const HOST_LINE = 'Next up. Please keep it under sixty seconds.';
// Who says what the moment the water stops.
export const ENDING_SAY = {
  frozen: { vcId: 'hype', text: "We're excited to follow along." },
  funded: { vcId: 'hype', text: 'Take my money. Metaphorically.' },
};

// Temperature bands, checked top to bottom.
export const BANDS = [
  { name: 'warm', min: 30 },
  { name: 'lukewarm', min: 15 },
  { name: 'cold', min: 0 },
  { name: 'frozen', min: -Infinity },
];
export const bandFor = (temp) => BANDS.find((b) => temp >= b.min).name;
// "frozen" ending when the final temperature is at or below this.
export const FREEZE_AT = 0;
// Funded only if you end the pitch at least this warm; otherwise it is a polite no.
export const FUND_AT = 20;

export const BUZZWORDS = [
  'disrupt', 'disruptive', 'disruption', 'AI-powered', 'agentic', 'agent', 'synergy',
  'paradigm shift', 'game-changer', '10x', 'ten x', 'ecosystem', 'leverage', 'scalable',
  'platform', 'Uber for', 'revolutionize', 'revolutionary', 'seamless', 'next-gen',
  'next generation', 'web3', 'blockchain', 'frictionless', 'north star', 'move the needle',
  'first-mover', 'hockey stick', 'TAM', 'unicorn', 'flywheel', 'moat', 'AGI',
];
