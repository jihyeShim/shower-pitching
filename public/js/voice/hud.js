// 2D overlay: lobby, timer, thermometer, captions, interruption card, result card (interaction owner).
// Visual language: visionOS-style glass.
import { bus } from '../bus.js';
import { PITCH_SECONDS, START_TEMP, MIN_TEMP, DROP_PER_BUZZWORD, RISE_PER_WARMWORD, BANDS, FLAGS } from '../config.js';
import { state } from '../state.js';
import { VCS } from '../characters.js';
import { BUZZ_REGEX } from './buzzword.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const highlight = (s) => esc(s).replace(BUZZ_REGEX, (m) => `<span class="bz">${m}</span>`);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const tempPct = (t) => clamp01((t - MIN_TEMP) / (START_TEMP - MIN_TEMP)) * 100;
const RING = 169.6; // 2πr for r=27
const minus = (n) => String(n).replace('-', '−');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const avatar = (vc, cls = 'avatar') =>
  `<span class="${cls}" style="background:${esc(vc?.look?.robe ?? '#6b7280')}">${esc((vc?.name ?? '?')[0])}</span>`;

const ICON = {
  drop: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 2.5c2.3 2.8 3.8 4.9 3.8 6.8a3.8 3.8 0 0 1-7.6 0c0-1.9 1.5-4 3.8-6.8Z"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
  again: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.5 2.5v2.6h2.6"/></svg>',
  frozen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5M6.2 2.6 8 4.2l1.8-1.6M6.2 13.4 8 11.8l1.8 1.6"/></svg>',
  funded: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8.5 3 3 7-7"/></svg>',
};

export function init() {
  const root = document.getElementById('hud');
  const ticks = [START_TEMP, ...BANDS.filter((b) => Number.isFinite(b.min)).map((b) => b.min)]
    .map((t) => `<span class="num${t === 0 ? ' zero' : ''}" style="bottom:${tempPct(t)}%">${t}°</span>`)
    .join('');

  root.innerHTML = `
    <div class="scrim"></div>
    <section class="lobby glass">
      <div>
        <div class="eyebrow"><span class="dot"></span>Hot tub is open</div>
        <h1 class="display">Shower Pitching</h1>
        <p class="tagline">Forget the elevator pitch.<br>This is the shower pitch.</p>
        <p class="rule"><b>${PITCH_SECONDS} seconds of hot water.</b> Every buzzword makes it colder. Real numbers warm it back up.</p>
      </div>
      <form class="go" novalidate>
        <label class="field"><span class="flabel">Company Name</span><input class="company" type="text" name="company" maxlength="40" placeholder="e.g. Laundrify" autocomplete="off" spellcheck="false" /></label>
        <button class="btn-primary start" type="submit" disabled><span class="ico">${ICON.drop}</span>Turn on the water</button>
      </form>
      <div class="lobby-foot">
        <div class="lineup" hidden><div class="avatars"></div><div class="tub"></div></div>
        <div class="note">${ICON.lock}Camera and audio aren't stored. Your transcript is sent to generate VC responses.</div>
      </div>
    </section>

    <div class="timer glass" hidden>
      <div class="ring">
        <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="27" fill="none" stroke-width="5"/><circle class="prog" cx="32" cy="32" r="27" fill="none" stroke-width="5" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
        <div class="live"><i></i></div>
        <div class="pause"><div><i></i><i></i></div></div>
      </div>
      <div class="t num display"><span class="n">${PITCH_SECONDS}</span><small>s</small></div>
      <div class="lbl"><span class="state-live"><b>Pitching</b>of ${PITCH_SECONDS} seconds</span><span class="state-paused"><b>Paused</b>VC has the floor</span></div>
    </div>

    <div class="thermo glass" hidden>
      <div class="read num display"><span class="deg">${START_TEMP}</span><sup>°C</sup></div>
      <div class="band">Warm</div>
      <div class="scale">
        <div class="tube"><div class="fill"></div></div>
        <div class="marker"></div>
        <div class="ticks">${ticks}</div>
      </div>
    </div>

    <div class="captions glass" hidden>
      <div class="cap-head">
        <span class="you"><span class="bars"><i></i><i></i><i></i><i></i></span><b class="co">Company Name</b><span class="st">&nbsp;· pitching</span></span>
        <span>Live captions</span>
      </div>
      <p class="cap-text"></p>
    </div>

    <div class="interrupt glass" hidden role="status" aria-live="polite">
      <div class="int-top int-who">
        <span class="int-av"></span>
        <div><b class="who"></b><span class="role"></span></div>
        <span class="chip"><span class="dot"></span>VC interruption</span>
      </div>
      <p class="quote display"></p>
    </div>

    <section class="result" hidden>
      <article class="card glass">
        <header class="sc-top"><span class="mark"><span class="dot"></span>showerpitching</span><span class="sc-kind">Demo Day scorecard</span></header>
        <div class="sc-head">
          <h2 class="sc-co display"></h2>
          <span class="stamp display"></span>
        </div>
        <div class="stats"></div>
        <div class="punch"><span class="k">Translation</span><p class="tx display"></p></div>
        <blockquote class="vcq"><span class="vq"></span><cite></cite></blockquote>
        <div class="r-actions"><span class="sc-url">showerpitching · 60 seconds of hot water</span><button class="btn-primary again" type="button"><span class="ico">${ICON.again}</span>Pitch again</button></div>
      </article>
    </section>`;

  const $ = (sel) => root.querySelector(sel);
  const lobby = $('.lobby'), timer = $('.timer'), num = $('.timer .n'), prog = $('.timer .prog'), thermo = $('.thermo');
  const caps = $('.captions'), capText = $('.cap-text'), result = $('.result'), banner = $('.interrupt');

  // Company name gate: the CTA stays disabled until a name is typed; Enter in the field also starts.
  const form = $('.go'), companyIn = $('.company'), startBtn = $('.start');
  const typedName = () => companyIn.value.trim().slice(0, 40);
  const companyName = () => state.company || typedName() || 'Your startup';
  const syncStart = () => { startBtn.disabled = !typedName(); };
  syncStart();
  companyIn.addEventListener('input', syncStart);
  companyIn.addEventListener('keydown', (e) => e.stopPropagation()); // keep debug keys out of the field
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const company = typedName();
    if (!company) return companyIn.focus();
    bus.emit('request:start', { company });
  });
  if (!FLAGS.debug) setTimeout(() => companyIn.focus(), 0);
  $('.again').addEventListener('click', () => bus.emit('request:restart'));

  let phase = 'lobby';
  let talking = 0;
  let bannerFor = null;
  let bannerId = null;

  const setClock = (r) => {
    num.textContent = r;
    prog.setAttribute('stroke-dashoffset', (RING * (1 - clamp01(r / PITCH_SECONDS))).toFixed(1));
  };

  function setTalking(n) {
    talking = Math.max(0, n);
    // Only a pitch can be paused; during the ending the clock is simply over.
    const paused = talking > 0 && phase === 'pitching';
    timer.classList.toggle('paused', paused);
    root.classList.toggle('paused', paused);
  }

  function setTemp(temp, band) {
    const p = tempPct(temp);
    $('.fill').style.height = `${p}%`;
    $('.marker').style.bottom = `calc(${p}% - 1.3rem)`;
    $('.deg').textContent = minus(temp);
    $('.band').textContent = cap(band);
    thermo.dataset.band = band;
    root.dataset.band = band;
  }

  bus.on('lineup', ({ vcIds }) => {
    const vcs = vcIds.map((id) => VCS[id]).filter(Boolean);
    $('.lineup').hidden = !vcs.length;
    $('.avatars').innerHTML = vcs.map((vc) => avatar(vc, 'av')).join('');
    $('.tub').innerHTML = `In the hot tub today: <strong>${vcs.map((vc) => esc(vc.name)).join(', ')}</strong>`;
  });

  bus.on('phase', (p) => {
    phase = p.phase;
    lobby.hidden = phase !== 'lobby';
    const live = phase === 'intro' || phase === 'pitching' || phase === 'ending';
    timer.hidden = thermo.hidden = caps.hidden = !live;
    if (phase === 'ending') {
      timer.classList.remove('paused');
      root.classList.remove('paused');
      setClock(0);
    }
    result.hidden = phase !== 'result';
    root.dataset.phase = phase;
    if (phase === 'intro') $('.cap-head .co').textContent = companyName();
    if (phase === 'intro' || phase === 'lobby') {
      setClock(PITCH_SECONDS);
      timer.classList.remove('low');
      capText.innerHTML = '<span><span class="dim">Get ready. The water is warming up.</span></span>';
      banner.hidden = true;
      bannerFor = null;
      setTalking(0);
      setTemp(START_TEMP, BANDS[0].name);
    }
    if (phase === 'pitching') capText.innerHTML = '<span><span class="dim">Start pitching. We are listening.</span><span class="caret"></span></span>';
    if (phase !== 'pitching' && phase !== 'ending') banner.hidden = true;
  });

  bus.on('timer', ({ remaining }) => {
    const r = Math.max(0, remaining);
    setClock(r);
    timer.classList.toggle('low', r <= 10);
  });

  let lastTemp = START_TEMP;
  bus.on('temp', ({ temp, band }) => {
    setTemp(temp, band);
    if (temp < lastTemp && phase === 'pitching') {
      thermo.classList.remove('hit');
      void thermo.offsetWidth;
      thermo.classList.add('hit');
    }
    lastTemp = temp;
  });

  // Warm toast: "+5°C · real number".
  bus.on('warmword', ({ word }) => {
    if (phase !== 'pitching') return;
    const chip = document.createElement('div');
    chip.className = 'toast glass warm';
    chip.innerHTML = `<span class="delta num">+${RISE_PER_WARMWORD}°C</span><span class="w">·&nbsp;<em>${esc(word)}</em></span>`;
    chip.style.top = `${36 + (toastN++ % 5) * 7}%`;
    root.appendChild(chip);
    chip.addEventListener('animationend', (e) => e.animationName === 'toast' && chip.remove());
    setTimeout(() => chip.remove(), 3000);
  });

  // Toast next to the thermometer: "−6°C · synergy".
  let toastN = 0;
  bus.on('buzzword', ({ word }) => {
    if (phase !== 'pitching') return;
    const chip = document.createElement('div');
    chip.className = 'toast glass';
    chip.innerHTML = `<span class="delta num">−${DROP_PER_BUZZWORD}°C</span><span class="w">·&nbsp;<em>${esc(word)}</em></span>`;
    chip.style.top = `${36 + (toastN++ % 5) * 7}%`;
    root.appendChild(chip);
    chip.addEventListener('animationend', (e) => e.animationName === 'toast' && chip.remove());
    setTimeout(() => chip.remove(), 3000);
  });

  bus.on('transcript', ({ final, interim }) => {
    if (phase !== 'pitching' && phase !== 'ending') return;
    const f = final.slice(-260);
    if (!f && !interim) return;
    capText.innerHTML = `<span>${highlight(f)}${interim ? ` <span class="dim">${highlight(interim)}</span>` : ''}<span class="caret"></span></span>`;
  });

  bus.on('vc:say', ({ vcId, text, kind, id }) => {
    // Only interjections pause the clock (state.js); cheers and jabs do not.
    if (kind === 'interject') setTalking(talking + 1);
    if (kind !== 'interject') return;
    const vc = VCS[vcId];
    $('.int-av').innerHTML = avatar(vc);
    $('.interrupt .who').textContent = vc?.name ?? vcId;
    $('.interrupt .role').textContent = vc?.title ?? '';
    $('.quote').innerHTML = `<span class="q">“</span>${esc(text)}<span class="q">”</span>`;
    banner.hidden = false;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    bannerFor = vcId;
    bannerId = id;
  });

  bus.on('vc:done', ({ vcId, id }) => {
    if (id === bannerId) setTalking(talking - 1);
    if (bannerFor && (id === bannerId || talking === 0)) {
      banner.hidden = true;
      bannerFor = null;
    }
  });

  bus.on('ending', ({ type, letter = {}, stats }) => {
    const t = type ?? letter.type;
    const frozen = t === 'frozen';
    $('.sc-co').textContent = companyName();
    $('.stamp').textContent = frozen ? 'Frozen out' : 'Funded';
    const stat = (v, k, cls = '') => `<div class="stat"><b class="num display ${cls}">${esc(v)}</b><span>${k}</span></div>`;
    $('.stats').innerHTML =
      stat(stats.buzzwordCount, stats.buzzwordCount === 1 ? 'buzzword' : 'buzzwords', stats.buzzwordCount ? 'red' : '') +
      stat(`${minus(stats.minTemp)}°`, 'lowest temp', stats.minTemp <= 0 ? 'blue' : 'warm') +
      stat(stats.worstWord ?? 'none', 'deadliest word', stats.worstWord ? 'red' : 'dim');
    // Fit the deadliest word on one line: shrink the type as the word gets longer.
    const wlen = String(stats.worstWord ?? 'none').length;
    $('.stats .stat:last-child b').style.fontSize = `${Math.max(2, Math.min(4.8, 24 / wlen)).toFixed(2)}rem`;
    const tx = String(letter.translation ?? '').trim();
    $('.tx').innerHTML = highlight(tx);
    $('.punch').hidden = !tx;
    // One short VC line: the letter's first line, signed; the signoff alone if there are no lines.
    const first = String((letter.lines ?? [])[0] ?? '').trim();
    const sign = String(letter.signoff ?? '').trim();
    const q = first || sign;
    $('.vq').textContent = q ? `“${q}”` : '';
    $('.vcq cite').textContent = first && sign ? sign : '';
    $('.vcq').hidden = !q;
    result.dataset.type = t;
  });
}
