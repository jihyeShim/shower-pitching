// Buzzword detection in the browser, no server round trip (interaction owner).
// Counts each word in final + interim text and only emits new occurrences,
// so interim results that repeat or get revised never double count.
import { bus } from '../bus.js';
import { BUZZWORDS, WARMWORDS } from '../config.js';

const norm = (s) => ` ${s.toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

// Dedupe variants that normalize the same ("AI-powered" / "AI powered").
// Also catch simple inflections: disrupts, disrupted, leveraging.
const entries = (list) => [...new Map(list.map((w) => [norm(w), w])).entries()].map(([key, word]) => ({
  word,
  re: new RegExp(`(?<= )${key.trim().replace(/ /g, " +")}(?:s|es|d|ed|ing)?(?= )`, "g"),
}));
const ENTRIES = entries(BUZZWORDS);
const WARM_ENTRIES = entries(WARMWORDS);

export function countBuzzwords(text, list = ENTRIES) {
  const t = norm(text).replace(/ /g, '  ');
  const counts = {};
  for (const { re, word } of list) {
    const n = t.match(re)?.length ?? 0;
    if (n) counts[word] = n;
  }
  return counts;
}

// For the HUD: which original words to highlight.
export const BUZZ_REGEX = new RegExp(
  `\\b(${BUZZWORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, '[- ]')).join('|')})(?:s|es|d|ed|ing)?\\b`,
  'gi',
);

export function init() {
  let emitted = {};
  let warmed = {};
  let total = 0;
  bus.on('phase', ({ phase }) => {
    if (phase === 'intro') {
      emitted = {};
      warmed = {};
      total = 0;
    }
  });
  // Evidence words warm the water back up.
  bus.on('transcript', ({ final, interim }) => {
    const counts = countBuzzwords(`${final} ${interim}`, WARM_ENTRIES);
    for (const [word, n] of Object.entries(counts)) {
      while ((warmed[word] || 0) < n) {
        warmed[word] = (warmed[word] || 0) + 1;
        bus.emit('warmword', { word });
      }
    }
  });
  bus.on('transcript', ({ final, interim }) => {
    const counts = countBuzzwords(`${final} ${interim}`);
    for (const [word, n] of Object.entries(counts)) {
      while ((emitted[word] || 0) < n) {
        emitted[word] = (emitted[word] || 0) + 1;
        bus.emit('buzzword', { word, index: ++total });
      }
    }
  });
}
