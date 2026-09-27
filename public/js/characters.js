// Character bible (PRD 1부 6장, 2부 14장). Shared by scene, voice and api.
// All names are fictional. Looks differ only by robe color and prop.
// Each run seats a lineup (see config LINEUP_*), so there is no fixed seat here.
export const VCS = {
  moat: {
    name: 'Gordon',
    title: 'Partner, Legacy Capital Fund X',
    look: { robe: '#2b3a55', prop: 'champagne' },
    idle: 'sip',
    voice: { lang: 'en-US', pitch: 0.7, rate: 0.9 , prefer: ['Daniel', 'Google UK English Male'] },
    jabs: ['{word}? Name one customer who asked for that.', '{word} is not a moat. What stops a copycat next week?', 'Define {word}. In one sentence. Without {word}.'],
    praise: ['Retention like that is a moat.', 'Now that is a real number.'],
    fallback: [
      "What's your moat?",
      'What if Big Tech builds this over a weekend?',
      'How is this a billion-dollar company?',
    ],
  },
  hype: {
    name: 'Skyler',
    title: 'Founding Partner, Vibe Ventures',
    look: { robe: '#ff6fb1', prop: 'phone' },
    idle: 'phone',
    voice: { lang: 'en-US', pitch: 1.4, rate: 1.15 , prefer: ['Karen', 'Google US English'] },
    jabs: ['Wait, is {word} the product or the vibe?', 'Love {word}. Who is actually paying for it?'],
    praise: ['Wait, real revenue? Is that allowed?', 'Numbers! I love numbers now.'],
    fallback: [
      'Love it. Who else is in the round?',
      'Come back when you have a lead.',
      "We're excited to follow along.",
    ],
    cheers: ['{word}! Love it!', 'Wait, say {word} again.', '{word}? Take my money. Metaphorically.', 'Ooh, {word}. Adding that to my thesis.', '{word}! My LPs will love this.'],
  },
  revenue: {
    name: 'Judge Kim',
    title: 'Demo Day Judge, Korean Accelerator',
    look: { robe: '#e8e2d0', prop: 'lanyard' },
    idle: 'nod',
    voice: { lang: 'en-US', pitch: 1.0, rate: 0.95 , prefer: ['Google UK English Female', 'Moira'] },
    jabs: ['{word} is nice. How many paying users?', 'And how does {word} make money?', 'What did {word} cost you per customer?'],
    praise: ['Finally, a number.', 'Good. Keep saying numbers.'],
    fallback: ["So, what's your revenue?", 'And your global expansion plan?', 'Interesting. But revenue?'],
  },
  portfolio: {
    name: 'Morgan',
    title: 'Principal, Copycat Capital',
    look: { robe: '#6b8f71', prop: 'laptop' },
    idle: 'type',
    voice: { lang: 'en-US', pitch: 1.1, rate: 1.05 , prefer: ['Tessa', 'Google US English'] },
    jabs: ['Our portfolio company also says {word}. They have twelve users.', '{word}? How are you different from the last five?'],
    praise: ['Our portfolio company does not have that.', 'Okay, that is better than ours.'],
    fallback: [
      'We actually backed something similar last year.',
      'Have you met our portfolio company? They do exactly this.',
      "How are you different from the one we funded?",
    ],
  },
  thesis: {
    name: 'Avery',
    title: 'Partner, Narrow Thesis Partners',
    look: { robe: '#8a6fd1', prop: 'clipboard' },
    idle: 'nod',
    voice: { lang: 'en-US', pitch: 0.9, rate: 0.9 , prefer: ['Moira', 'Google UK English Female'] },
    jabs: ['{word} is not a problem statement. What problem?', 'Why now? {word} was hot two years ago too.'],
    praise: ['Fine. That fits our thesis now.', 'Evidence. How refreshing.'],
    fallback: [
      "Not a fit for our current thesis.",
      'Is this climate? This quarter we only do climate.',
      'Love it, but we only invest in things we already understand.',
    ],
  },
  exit: {
    name: 'Chris',
    title: 'Angel Investor, Sold One Startup Once',
    look: { robe: '#d98c3f', prop: 'sunglasses' },
    idle: 'sip',
    voice: { lang: 'en-US', pitch: 0.8, rate: 1.0 , prefer: ['Rishi', 'Google UK English Male', 'Daniel'] },
    jabs: ['At my startup, {word} meant we had no plan.', 'I said {word} once. We sold for parts.'],
    praise: ['That beats my exit numbers.', 'Now you sound like a founder.'],
    fallback: [
      'When I sold my company, we never said platform.',
      'Back when I exited, pitches were shorter.',
      'Have I told you about my exit?',
    ],
  },
};

export const VC_IDS = Object.keys(VCS);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
