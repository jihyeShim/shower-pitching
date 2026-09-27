// Speech recognition with a typed fallback (interaction owner).
// Emits `transcript` { final, interim }. Pauses while a VC is talking.
// Built for a noisy venue: Chrome ends sessions on silence, noise and network hiccups,
// so we restart on every end while we still want to listen, with a small backoff
// and a watchdog in case Chrome goes quiet without firing onend.
import { bus } from '../bus.js';
import { FLAGS } from '../config.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);
const MAX_NETWORK_FAILS = 6;

export function init() {
  let final = '';
  let interim = '';
  let phase = 'lobby';
  let talking = 0; // VC lines in flight (vc:say minus vc:done)
  let rec = null;
  let running = false; // a recognition session is live (start called, onend not yet)
  let starting = false;
  let restartTimer = null;
  let netFails = 0;
  let typed = FLAGS.nomic || !SR;

  const wanted = () => phase === 'pitching' && talking === 0 && !typed;
  const emit = () => bus.emit('transcript', { final, interim });
  const commit = (text) => {
    const t = text.trim();
    if (t) final = `${final} ${t}`.trim();
  };

  // Typed input: always available while pitching, alongside the mic. When the mic fails it becomes the only input.
  const wrap = document.createElement('div');
  wrap.id = 'typed-wrap';
  wrap.hidden = true;
  wrap.innerHTML = `<p class="typed-hint"></p><input id="typed-pitch" autocomplete="off" spellcheck="false" placeholder="Type your pitch and press Enter" />`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector('input');
  const hint = wrap.querySelector('.typed-hint');
  hint.textContent = FLAGS.nomic || !SR ? 'Keyboard mode' : '';
  if (!typed) input.placeholder = 'Talk, or type here and press Enter';
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep debug keys from firing while typing
    if (e.key === 'Escape') return input.blur();
    if (e.key !== 'Enter' || !input.value.trim()) return;
    commit(input.value);
    input.value = '';
    emit();
  });

  function showTyped() {
    wrap.hidden = phase !== 'pitching';
    // Grab focus only when typing is the only input; with a live mic the box is optional.
    // In debug mode leave focus alone so the debug keys keep working; click the box to type.
    if (!wrap.hidden && typed && !FLAGS.debug) setTimeout(() => input.focus(), 0);
  }

  function fallBack(reason) {
    if (typed) return;
    console.warn('[stt] switching to typed input:', reason);
    typed = true;
    hint.textContent = reason;
    input.placeholder = 'Type your pitch and press Enter';
    stopRec();
    showTyped();
  }

  if (!SR && !FLAGS.nomic) hint.textContent = 'Speech recognition is not available in this browser. Type instead.';

  function build() {
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = 'en-US';
    rec.onstart = () => {
      starting = false;
      running = true;
    };
    rec.onresult = (e) => {
      netFails = 0;
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) commit(r[0].transcript);
        else live += r[0].transcript;
      }
      interim = live.trim();
      emit();
    };
    rec.onerror = (e) => {
      if (FATAL.has(e.error)) {
        const msg = e.error === 'audio-capture' ? 'No microphone found. Type your pitch instead.' : 'Microphone blocked. Type your pitch instead.';
        fallBack(msg);
        return;
      }
      if (e.error === 'network' && ++netFails >= MAX_NETWORK_FAILS) {
        fallBack('Speech service unreachable. Type your pitch instead.');
        return;
      }
      if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('[stt]', e.error);
    };
    rec.onend = () => {
      running = starting = false;
      // Keep words Chrome heard but never finalized (common when noise cuts a session).
      if (interim) {
        commit(interim);
        interim = '';
        emit();
      }
      scheduleStart(netFails ? Math.min(1500, 250 * netFails) : 50);
    };
  }

  function start() {
    if (!wanted() || running || starting) return;
    if (!rec) build();
    starting = true;
    try {
      rec.start();
    } catch {
      // InvalidStateError: a session is still winding down. Abort it; onend or the watchdog restarts.
      starting = false;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleStart(ms) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(start, ms);
  }

  function stopRec() {
    clearTimeout(restartTimer);
    if (rec && (running || starting)) {
      try {
        rec.stop();
      } catch {
        /* not running */
      }
    }
  }

  // Watchdog: if we should be listening but no session is alive, start one.
  setInterval(() => {
    if (wanted() && !running && !starting) start();
  }, 1500);

  bus.on('phase', (p) => {
    phase = p.phase;
    if (phase === 'intro') {
      final = interim = '';
      talking = 0;
      netFails = 0;
      input.value = '';
    }
    showTyped();
    if (wanted()) start();
    else stopRec();
  });
  bus.on('vc:say', () => {
    talking++;
    stopRec();
  });
  bus.on('vc:done', () => {
    talking = Math.max(0, talking - 1);
    if (wanted()) scheduleStart(150);
  });
}
