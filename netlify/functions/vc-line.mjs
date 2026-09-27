// POST /api/vc-line  { vcId, transcript, buzzwords, temp, elapsed } -> { vcId, text }
import { chat, hasKey, json, rateLimited } from '../lib/llm.mjs';
import { PERSONAS, RULES } from '../lib/prompts.mjs';

const MOCK = {
  moat: ["That's cute. But what's the moat?", 'What stops Big Tech from shipping this on Tuesday?'],
  hype: ['Love it. Is it agentic yet?', "Who's leading? We'd love to follow."],
  revenue: ["So, what's your revenue?", 'And revenue? Just roughly.'],
  portfolio: ['Our portfolio company does this. Have you met them?', 'We backed this exact thing. Twice.'],
  thesis: ["Love it. Doesn't fit this quarter's thesis.", 'Is it climate? We only do climate now.'],
  exit: ['When I sold my startup, we had revenue.', 'Reminds me of my exit. Great exit.'],
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (rateLimited(req)) return json({ error: 'Too many requests' }, 429);
  const body = await req.json().catch(() => ({}));
  // Public endpoint: accept only known characters and small, well-typed inputs.
  const vcId = Object.hasOwn(PERSONAS, body.vcId) ? body.vcId : 'moat';
  const name = String(body.company ?? '').slice(0, 40);
  const transcript = String(body.transcript ?? '').slice(-800);
  const buzzwords = (Array.isArray(body.buzzwords) ? body.buzzwords : []).slice(0, 40).map((w) => String(w).slice(0, 30));
  const temp = Math.round(Number(body.temp) || 0);
  const elapsed = Math.round(Number(body.elapsed) || 0);
  const persona = PERSONAS[vcId];

  if (!hasKey()) {
    const lines = MOCK[vcId] ?? MOCK.moat;
    return json({ vcId, text: lines[Math.floor(Math.random() * lines.length)], mock: true });
  }

  try {
    const text = await chat(
      [
        { role: 'system', content: `${persona} ${RULES}` },
        {
          role: 'user',
          content: `${name ? `The startup is called "${name}". You may address it by name. ` : ''}Pitch so far (${elapsed}s in, water is ${temp}°C, buzzwords used: ${buzzwords.join(', ') || 'none'}):\n"${transcript}"\n\nInterrupt the founder now.`,
        },
      ],
      { maxTokens: 60 },
    );
    return json({ vcId, text: text.trim().replace(/^["']|["']$/g, '') });
  } catch (e) {
    console.error(e);
    return json({ error: 'AI service unavailable' }, 502);
  }
};
