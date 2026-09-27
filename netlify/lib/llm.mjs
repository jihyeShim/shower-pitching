// Featherless client (backend owner). Without FEATHERLESS_API_KEY, callers use mock replies.
const BASE = 'https://api.featherless.ai/v1/chat/completions';
export const MODEL = process.env.FEATHERLESS_MODEL || 'Qwen/Qwen3-Next-80B-A3B-Instruct';

export const hasKey = () => Boolean(process.env.FEATHERLESS_API_KEY);

export async function chat(messages, { maxTokens = 200, temperature = 0.9 } = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}` },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature, messages }),
  });
  if (!res.ok) throw new Error(`Featherless ${res.status}: ${await res.text()}`);
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

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
