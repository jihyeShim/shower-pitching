// Server calls (backend owner). Always resolves: falls back to canned lines on timeout or error.
import { LLM_TIMEOUT_MS, ENDING_TIMEOUT_MS } from './config.js';
import { VCS, pick } from './characters.js';

async function post(path, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchVcLine({ company, vcId, transcript, buzzwords, temp, elapsed }) {
  try {
    const data = await post('/api/vc-line', { company, vcId, transcript, buzzwords, temp, elapsed }, LLM_TIMEOUT_MS);
    if (data?.text) return data.text;
  } catch (e) {
    console.warn('[api] vc-line fallback', e.message);
  }
  return pick(VCS[vcId].fallback);
}

const FALLBACK_ENDING = {
  frozen: {
    title: 'Re: Your pitch',
    lines: [
      'Thanks for jumping in the shower with us.',
      "It's a bit early for us, and frankly a bit cold.",
      'Let us know when you hit more milestones.',
    ],
    signoff: "We're excited to follow along. Skyler, Vibe Ventures",
    translation: "You said 'AI-powered platform'. You meant 'a website'.",
  },
  funded: {
    title: 'TERM SHEET (non-binding, slightly damp)',
    lines: [
      'Valuation: $4B pre-revenue, pre-product, pre-shower',
      'Equity: 51% of your company and 20% of your future shower thoughts',
      'Board seat: in the hot tub',
    ],
    signoff: 'Gordon, Legacy Capital Fund X',
    translation: 'You explained it like a human. Suspicious.',
  },
};

export async function fetchEnding({ company, type, transcript, buzzwords, minTemp, worstWord }) {
  try {
    const data = await post('/api/ending', { company, type, transcript, buzzwords, minTemp, worstWord }, ENDING_TIMEOUT_MS);
    if (data?.lines?.length) return { ...data, type };
  } catch (e) {
    console.warn('[api] ending fallback', e.message);
  }
  return { type, ...FALLBACK_ENDING[type] };
}
