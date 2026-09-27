// Vercel entry: reuses the Netlify function so both hosts share one implementation.
import handler from '../netlify/functions/ending.mjs';

export const POST = (request) => handler(request);
