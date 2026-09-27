// Event bus. Modules talk to each other only through these events (PRD 2부 12장).
import { FLAGS } from './config.js';

const handlers = new Map();

export const bus = {
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => handlers.get(type).delete(fn);
  },
  emit(type, payload = {}) {
    if (FLAGS.debug && type !== 'timer' && type !== 'transcript') console.debug('[bus]', type, payload);
    for (const fn of handlers.get(type) ?? []) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[bus] "${type}" handler failed`, e);
      }
    }
  },
};
