// The founder's face window: live webcam with the filter-lab shower filter, drawn on a 2D canvas overlay
// (space owner). Filter modules are ported from samples/filter-lab into ./filter/.
import { bus } from '../bus.js';
import { FLAGS, FACE_FILTER_STYLE, FILTER_BY_BAND } from '../config.js';
import { createShowerFilter, STYLES } from './filter/shower-filter.js';

const FACE_FPS = 30;
const FADE_MS = 650;

const styleFor = (band) => {
  const s = FACE_FILTER_STYLE === 'auto' ? FILTER_BY_BAND[band] : FACE_FILTER_STYLE;
  return STYLES[s] ? s : 'shampoo';
};

export function init(world) {
  // Frame: rounded window with a temperature chip. The fade canvas holds the last frame of the
  // outgoing filter style and fades out over the new one (crossfade on style switch).
  const wrap = document.createElement('div');
  wrap.id = 'face';
  wrap.hidden = true;
  wrap.dataset.band = 'warm';
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 600;
  canvas.className = 'face-live';
  const fade = document.createElement('canvas');
  fade.width = canvas.width;
  fade.height = canvas.height;
  fade.className = 'face-fade';
  const fctx = fade.getContext('2d');
  const chip = document.createElement('div');
  chip.className = 'face-chip';
  chip.innerHTML = '<span class="dot"></span><span class="deg">40°C</span>';
  const deg = chip.querySelector('.deg');
  const you = document.createElement('div');
  you.className = 'face-you';
  you.textContent = 'YOU';
  wrap.append(canvas, fade, chip, you);
  document.getElementById('stage').appendChild(wrap);

  const video = document.createElement('video');
  Object.assign(video, { muted: true, playsInline: true, autoplay: true });

  let band = 'warm';
  let filter = null;
  const make = () => {
    filter?.destroy();
    filter = createShowerFilter(canvas, FLAGS.nocam ? null : video, { style: styleFor(band), autoRun: false, tracking: !FLAGS.nocam });
    filter.setTemp(band);
  };
  make();

  async function startCam() {
    if (FLAGS.nocam || video.srcObject) return;
    try {
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      await video.play();
    } catch (e) {
      console.warn('[founder] webcam unavailable, using placeholder', e);
    }
  }

  let fadeTimer = 0;
  function switchStyle(name) {
    if (!filter || filter.style === name) return;
    // Snapshot the outgoing look, swap underneath, then fade the snapshot away.
    fctx.clearRect(0, 0, fade.width, fade.height);
    fctx.drawImage(canvas, 0, 0);
    fade.style.transition = 'none';
    fade.style.opacity = '1';
    filter.setStyle(name);
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      fade.style.transition = `opacity ${FADE_MS}ms ease`;
      fade.style.opacity = '0';
    }, 40);
  }

  let acc = 1;
  world.onFrame((dt) => {
    if (wrap.hidden || !filter) return;
    acc += dt;
    if (acc < 1 / FACE_FPS) return;
    acc = 0;
    filter.render(performance.now());
  });

  bus.on('request:start', startCam);
  bus.on('phase', ({ phase }) => {
    wrap.hidden = phase === 'lobby' || phase === 'result';
    if (phase === 'intro') {
      // Full reset: frost, splash and style back to warm (webcam stream is kept).
      band = 'warm';
      wrap.dataset.band = band;
      deg.textContent = '40°C';
      fade.style.opacity = '0';
      make();
    }
  });
  bus.on('temp', ({ temp, band: b }) => {
    band = b;
    wrap.dataset.band = b;
    deg.textContent = `${Math.round(temp)}°C`;
    filter?.setTemp(b);
    switchStyle(styleFor(b));
  });
  bus.on('buzzword', () => {
    filter?.hit();
    wrap.classList.remove('hit');
    void wrap.offsetWidth;
    wrap.classList.add('hit');
  });
}
