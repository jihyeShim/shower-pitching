// POST /api/ending { type, transcript, buzzwords, minTemp, worstWord } -> { type, title, lines[], signoff, translation }
import { chat, hasKey, json, parseJson, rateLimited } from '../lib/llm.mjs';

const MOCK = {
  frozen: {
    title: 'Re: Your pitch',
    lines: ['Thanks for jumping in the shower with us.', "It's a bit early for us, and frankly a bit cold.", 'Let us know when you hit more milestones.'],
    signoff: "We're excited to follow along. Skyler, Vibe Ventures",
    translation: "You said 'AI-powered platform'. You meant 'a website'.",
  },
  funded: {
    title: 'TERM SHEET (non-binding, slightly damp)',
    lines: ['Valuation: $4B pre-revenue, pre-product, pre-shower', 'Equity: 51% of your company and 20% of your future shower thoughts', 'Board seat: in the hot tub'],
    signoff: 'Gordon, Legacy Capital Fund X',
    translation: 'You explained it like a human. Suspicious.',
  },
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (rateLimited(req)) return json({ error: 'Too many requests' }, 429);
  const body = await req.json().catch(() => ({}));
  // Public endpoint: accept only small, well-typed inputs.
  const type = body.type === 'funded' ? 'funded' : 'frozen';
  const name = String(body.company ?? '').slice(0, 40);
  const transcript = String(body.transcript ?? '').slice(-1200);
  const buzzwords = (Array.isArray(body.buzzwords) ? body.buzzwords : []).slice(0, 40).map((w) => String(w).slice(0, 30));
  const minTemp = Math.round(Number(body.minTemp) || 0);
  const worstWord = body.worstWord ? String(body.worstWord).slice(0, 30) : null;

  if (!hasKey()) return json({ type, ...MOCK[type], mock: true });

  const task =
    type === 'frozen'
      ? 'Write a polite, vague VC rejection email. Classic phrases like "excited to follow along" are welcome.'
      : 'Write an absurd term sheet: ridiculous valuation, predatory equity, a board seat in the hot tub.';
  const prompt = `${name ? `The startup is called "${name}". Use the name in the title. ` : ''}A founder just pitched for 60 seconds in a shower that got colder with every buzzword.
Transcript: "${transcript}"
Buzzwords used: ${buzzwords.join(', ') || 'none'}. Deadliest word: ${worstWord ?? 'none'}. Lowest temperature: ${minTemp}°C.

${task}
Also write "translation": one line that rewrites their pitch in plain human words, starting with "You said".
Keep lines short (max 20 words each, 3 to 4 lines). Never use em dashes. Never mention real people or real companies. Never comment on race, body, age, gender or looks.
Reply with ONLY this JSON:
{"title": "...", "lines": ["...", "...", "..."], "signoff": "...", "translation": "..."}`;

  try {
    const data = parseJson(await chat([{ role: 'user', content: prompt }], { maxTokens: 350 }));
    if (!Array.isArray(data.lines) || !data.lines.length) throw new Error('bad shape');
    return json({ type, ...data });
  } catch (e) {
    console.error(e);
    return json({ type, ...MOCK[type] });
  }
};
