// Motion sources as a registry — what drives the bars' uGain. An entry:
//   { id, name, disabled, active(), levels(t, n) }
//     id       — the value stored in state.audio
//     name     — button label
//     disabled — greys the button until the source can actually run
//     active() — optional; when present the source drives only while true
//     levels   — (t seconds, n bars) -> numbers 0..1, or omit for a source
//                that never drives (like "off")
import { U, MAX_PARTS, FIXED } from './glsl.js';
import { state, set, subscribe } from './state.js';
import { createRegistry } from './registry.js';
import { panels, showError } from './ui.js';

export const motion = createRegistry('motion source');

motion.register({ id: 'off', name: 'Nothing' });

function voiceLevels(t, n) {
  // syllables at ~4 Hz inside phrases that come and go: a stand-in for someone talking
  const phrase = Math.max(0, Math.sin(t * 0.55) + 0.35) / 1.35;
  const syl = Math.pow(0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 3.6 + 2.2 * Math.sin(t * 1.7)), 1.6);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = n > 1 ? i / (n - 1) : 0.5;
    const formant = 0.55 + 0.45 * Math.sin(t * (5.1 + i * 0.9) + i * 1.9);
    const tilt = 1 - 0.35 * Math.abs(c - 0.5) * 2;
    out.push(Math.min(1, phrase * (0.25 + 0.75 * syl) * formant * tilt * 1.25));
  }
  return out;
}
motion.register({ id: 'voice', name: 'Demo voice', levels: (t, n) => voiceLevels(t, n) });

let actx = null, analyser = null, audioEl = null;
const ffts = new WeakMap();   // analyser -> Float32Array scratch buffer

// Shared by the file player and the mic: average each analyser's FFT into
// n log-spaced bands over 90 Hz – 7 kHz and return raw dB per band.
function bandLevels(an, n) {
  let fft = ffts.get(an);
  if (!fft) { fft = new Float32Array(an.frequencyBinCount); ffts.set(an, fft); }
  an.getFloatFrequencyData(fft);
  const bin = an.context.sampleRate / an.fftSize, out = [];
  const lo = 90, hi = 7000;
  for (let i = 0; i < n; i++) {
    const f0 = lo * Math.pow(hi / lo, i / n), f1 = lo * Math.pow(hi / lo, (i + 1) / n);
    let s = 0, c = 0;
    for (let b = Math.floor(f0 / bin); b <= Math.ceil(f1 / bin) && b < fft.length; b++) { s += fft[b]; c++; }
    out.push(c ? s / c : -120);
  }
  return out;
}

function fileLevels(n) {
  return bandLevels(analyser, n).map(db => Math.min(1, Math.max(0, (db + 85) / 55)));
}
motion.register({ id: 'file', name: 'Audio file', disabled: true,
  active: () => isAudioFilePlaying(),
  levels: (t, n) => fileLevels(n) });

export function hasAudioFile() { return !!audioEl; }
export function isAudioFilePlaying() { return !!(analyser && audioEl && !audioEl.paused); }
export function pauseAudioFile() { audioEl?.pause(); }
export function unpauseAudioFile() { audioEl?.play(); }

// the play button also wakes the AudioContext
export function playAudioFile() {
  actx.resume();
  return audioEl.play();
}

export async function loadAudioFile(file) {
  ensureCtx();
  if (!audioEl) {
    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    audioEl = new Audio();
    audioEl.loop = true;
    actx.createMediaElementSource(audioEl).connect(analyser);
    analyser.connect(actx.destination);
  }
  if (audioEl.src) URL.revokeObjectURL(audioEl.src);
  audioEl.src = URL.createObjectURL(file);
  await actx.resume();
  await audioEl.play();
  motion.get('file').disabled = false;
}

// ------------------------------------------------------------ microphone
// Its own analyser (never wired to the destination — that is feedback).
// Picking the source asks for permission; switching away stops the tracks.
let micStream = null, micAnalyser = null, micPending = null;
let micCeil = -60, micLast = 0, micSens = 0.5;

function ensureCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

async function startMic() {
  if (micStream) return true;
  if (micPending) return micPending;
  if (!navigator.mediaDevices?.getUserMedia) {
    if (state.audio === 'mic') showError('This browser or frame does not allow microphone input.');
    return false;
  }
  micPending = navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  }).then((stream) => {
    if (state.audio !== 'mic') {   // switched away while the prompt was up
      stream.getTracks().forEach((tr) => tr.stop());
      return true;
    }
    micStream = stream;
    micAnalyser = ensureCtx().createAnalyser();
    micAnalyser.fftSize = 2048;
    micAnalyser.smoothingTimeConstant = 0.5;
    // source -> analyser only; the file player's analyser alone reaches the destination
    ensureCtx().createMediaStreamSource(stream).connect(micAnalyser);
    micCeil = -60; micLast = 0;
    ensureCtx().resume();
    return true;
  }).catch(() => {
    if (state.audio === 'mic') {
      showError('No microphone — permission was refused or this frame blocks it.');
    }
    return false;
  }).finally(() => { micPending = null; });
  return micPending;
}

function stopMic() {
  micStream?.getTracks().forEach((tr) => tr.stop());
  micStream = null; micAnalyser = null; micCeil = -60; micLast = 0;
  updateMicMeter(0);
}

function micLevels(n) {
  const now = performance.now() / 1000;   // real clock: t is frozen under reduced-motion
  const dt = Math.min(0.1, Math.max(0, micLast ? now - micLast : 0));
  micLast = now;
  const dbs = bandLevels(micAnalyser, n);
  let peak = -Infinity;
  for (const db of dbs) if (db > peak) peak = db;
  if (peak < -75) {   // noise gate: a quiet room is silence, not a floor of motion
    updateMicMeter(0);
    return new Array(n).fill(0);
  }
  // auto-gain: a ceiling on the loudest band, decaying ~4 dB/s, floored at -60
  micCeil = Math.max(-60, micCeil - 4 * dt, peak);
  const sensDb = (micSens - 0.5) * 20;   // the panel's slider: ±10 dB
  const out = dbs.map((db, i) => {
    const tilt = n > 1 ? 12 * i / (n - 1) : 6;   // +12 dB across the range, so sibilants reach the right bars
    return Math.min(1, Math.max(0, (db + tilt + sensDb - (micCeil - 42)) / 38));
  });
  updateMicMeter(Math.max(...out));
  return out;
}
motion.register({ id: 'mic', name: 'Microphone',
  active: () => !!micAnalyser,
  levels: (t, n) => micLevels(n) });

// Live input meter + sensitivity slider, mounted into the Motion section so
// index.html stays untouched. Shown only while the mic source is selected.
let micFill = null, micBox = null;
{
  const sec = panels.get('sec-motion');
  if (sec) {
    micBox = document.createElement('div');
    micBox.className = 'group';
    micBox.hidden = state.audio !== 'mic';
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = 'Mic level';
    const track = document.createElement('div');
    track.style.cssText = 'height:6px;border-radius:3px;background:var(--chip);overflow:hidden';
    micFill = document.createElement('i');
    micFill.style.cssText = 'display:block;height:100%;width:0;background:var(--accent)';
    track.append(micFill);
    const slab = document.createElement('div');
    slab.className = 'label';
    slab.textContent = 'Mic sensitivity';
    const sens = document.createElement('input');
    sens.type = 'range'; sens.min = '0'; sens.max = '1'; sens.step = '0.01'; sens.value = String(micSens);
    sens.addEventListener('input', () => { micSens = +sens.value; });
    micBox.append(lab, track, slab, sens);
    sec.append(micBox);
  }
}
function updateMicMeter(level) {
  if (micFill) micFill.style.width = (level * 100).toFixed(1) + '%';
}

// Selecting a source starts or stops the mic — the seg click only writes
// state.audio, so the subscription is the whole wiring (no main.js changes).
// 'mic' is never restored from saved state (state.js maps it back to 'voice').
let lastAudio = state.audio;
subscribe('audio', (v) => {
  const prev = lastAudio; lastAudio = v;
  if (micBox) micBox.hidden = v !== 'mic';
  if (v !== 'mic') { stopMic(); return; }
  startMic().then((ok) => {
    if (!ok && state.audio === 'mic') set('audio', prev === 'mic' ? 'off' : prev);
  });
});

// ------------------------------------------------------------ gains
const levels = new Float32Array(MAX_PARTS);

// n = number of gain slots the current subject uses (its pills)
export function updateGains(t, dt, n) {
  const src = motion.get(state.audio);
  const moving = n > 0 && !!src?.levels && (src.active ? src.active() : true);
  const target = !moving ? [] : src.levels(t, n);
  const g = U.uGain.value;
  for (let i = 0; i < FIXED; i++) {
    const tgt = i < target.length ? target[i] : 0;
    // fast attack, slow release, as a level meter
    levels[i] += (tgt - levels[i]) * Math.min(1, dt * (tgt > levels[i] ? 22 : 7));
    // at rest every bar is exactly the source's length
    g[i] = moving ? Math.max(0, 1 + state.amount * (levels[i] * 1.7 - 0.7))
                  : 1 + (g[i] - 1) * Math.max(0, 1 - dt * 6);
  }
  g[FIXED] = 1;
}
