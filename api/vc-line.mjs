// Vercel entry: reuses the Netlify function so both hosts share one implementation.
import handler from '../netlify/functions/vc-line.mjs';

export const POST = (request) => handler(request);
