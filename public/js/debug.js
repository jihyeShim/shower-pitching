// Debug keys (PRD 2부 17장). Active with ?debug=1.
import { bus } from './bus.js';
import { FLAGS, BUZZWORDS } from './config.js';
import { state, interject, finish, restart } from './state.js';
import { pick } from './characters.js';

export function init() {
  if (!FLAGS.debug) return;
  window.__state = state;
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === 's') bus.emit('request:start');
    if (key === 'b') bus.emit('buzzword', { word: pick(BUZZWORDS), index: state.buzzwords.length + 1 });
    if (key === 'v') interject();
    if (key === 'f') finish('frozen');
    if (key === 'w') finish('funded');
    if (key === 'r') restart();
  });
  console.info('[debug] keys: S start, B buzzword, V interject, F frozen, W funded, R restart');
}
