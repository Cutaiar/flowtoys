// Motion sources as a registry — what drives the bars' uGain. An entry:
//   { id, name, disabled, active(), levels(t, n) }
//     id       — the value stored in state.audio
//     name     — button label
//     disabled — greys the button until the source can actually run
//     active() — optional; when present the source drives only while true
//     levels   — (t seconds, n bars) -> numbers 0..1, or omit for a source
//                that never drives (like "off")
import { U, MAX_PARTS, FIXED } from './glsl.js';
import { state } from './state.js';
import { createRegistry } from './registry.js';

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

let actx = null, analyser = null, audioEl = null, fft = null;

function fileLevels(n) {
  analyser.getFloatFrequencyData(fft);
  const sr = actx.sampleRate, bin = sr / analyser.fftSize, out = [];
  const lo = 90, hi = 7000;
  for (let i = 0; i < n; i++) {
    const f0 = lo * Math.pow(hi / lo, i / n), f1 = lo * Math.pow(hi / lo, (i + 1) / n);
    let s = 0, c = 0;
    for (let b = Math.floor(f0 / bin); b <= Math.ceil(f1 / bin) && b < fft.length; b++) { s += fft[b]; c++; }
    const db = c ? s / c : -120;
    out.push(Math.min(1, Math.max(0, (db + 85) / 55)));
  }
  return out;
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
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    fft = new Float32Array(analyser.frequencyBinCount);
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

// ------------------------------------------------------------ gains
const levels = new Float32Array(MAX_PARTS);

// n = number of gain slots the current subject uses (its primitives)
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
