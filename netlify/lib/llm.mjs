// Featherless client (backend owner). Without FEATHERLESS_API_KEY, callers use mock replies.
const BASE = 'https://api.featherless.ai/v1/chat/completions';
export const MODEL = process.env.FEATHERLESS_MODEL || 'Qwen/Qwen3-Next-80B-A3B-Instruct';

export const hasKey = () => Boolean(process.env.FEATHERLESS_API_KEY);

const TIMEOUT_MS = 8000;

export async function chat(messages, { maxTokens = 200, temperature = 0.9 } = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}` },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Keep provider details in server logs only.
  if (!res.ok) {
    console.error('Featherless error', res.status, (await res.text()).slice(0, 500));
    throw new Error(`upstream ${res.status}`);
  }
  const data = await res.json();
  // House style: no em dashes in anything shown on screen.
  return (data.choices?.[0]?.message?.content ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ');
}

// Models sometimes wrap JSON in prose or code fences; grab the first object.
export function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in model output: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// Light per-IP rate limit. Serverless instances do not share memory, so this only slows down
// a single client hammering one instance; the real cap is removing the key after the event.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
export function rateLimited(req) {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
