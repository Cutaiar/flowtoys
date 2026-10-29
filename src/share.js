// Shareable settings as a URL hash, the `subjects:` code for embedded
// contexts, and presets built on the same map.
//
// Hash schema (every value is validated on the way in):
//   src  — mark | wordmark            (a custom SVG can't be shared)
//   look — a look id                  (unknown ids don't crash; they ride the
//                                      hash until a build registers them)
//   tex  — none | checker | stripes | aurora | grid   (an image can't be shared)
//   uv   — 0 | 1                      (0 across the subject, 1 per part)
//   d    — depth, 0..1.5
//   amt  — motion amount, 0..1
//   mot  — a motion-source id         (file/mic aren't shareable)
//   turn — a turn-mode id
//   gnd  — look | #rrggbb
//   glow — a number                   (stream-B param: parsed and round-tripped
//                                      even before its slider exists)
import { state, set, subscribe } from './state.js';
import { SOURCES } from './subject.js';
import { looks, textures } from './looks.js';
import { motion } from './audio.js';
import { turns } from './turns.js';
import * as ui from './ui.js';

// ids a link or preset names that this build hasn't registered yet (looks
// from a later stream, say). They stay in the serialised map until the user
// picks something real, so a link round-trips instead of being rewritten.
const pending = {};
for (const k of ['look', 'audio', 'spin']) subscribe(k, () => { pending[k] = null; });

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9_-]+$/i;
const num = (v, lo, hi) => {
  const n = +v;
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};

// Serialise the shareable settings into the {src, look, …} map everything
// (hash, code, preset) uses.
export function shareMap() {
  const m = {};
  if (SOURCES[state.source] && state.source !== 'custom') m.src = state.source;
  m.look = pending.look || state.look;
  if (state.tex !== 'image') m.tex = state.tex;
  m.uv = String(state.uvmode ? 1 : 0);
  m.d = String(+state.depth.toFixed(3));
  m.amt = String(+state.amount.toFixed(3));
  const mot = pending.audio || (!['file', 'mic'].includes(state.audio) ? state.audio : null);
  if (mot) m.mot = mot;
  m.turn = pending.spin || state.spin;
  m.gnd = state.ground;
  if (Number.isFinite(+state.glow)) m.glow = String(+state.glow);
  return m;
}

const qs = (m) => new URLSearchParams(m).toString();

// Standalone the share string is the page's own URL; embedded in an iframe
// the URL isn't shareable, so a `subjects:` code carries the same params.
export function shareFieldValue() {
  const s = qs(shareMap());
  return window.top === window
    ? location.origin + location.pathname + '#' + s
    : 'subjects:' + s;
}

// Pull a share map out of a pasted link, `#…` hash, `subjects:` code or a
// bare a=b&c=d string. Returns null when the text isn't ours.
export function parseShareText(text) {
  let s = (text || '').trim();
  if (/^https?:\/\//i.test(s)) {
    const i = s.indexOf('#');
    if (i < 0) return null;
    s = s.slice(i + 1);
  } else if (s.startsWith('subjects:')) {
    s = s.slice(9);
  } else if (s.startsWith('#')) {
    s = s.slice(1);
  } else if (!/^[a-z]+=/i.test(s)) {
    return null;
  }
  let p;
  try { p = new URLSearchParams(s); } catch { return null; }
  if (![...p.keys()].length) return null;
  return p;
}

// Validate a URLSearchParams into state-ready values. Unknown look/motion/
// turn ids are parked in `pending` (they round-trip; they don't crash), and
// every invalid value is dropped with a note for the toast.
function validate(p, animateDepth) {
  const notes = [];
  const out = {};
  const src = p.get('src');
  if (src) {
    if (SOURCES[src] && src !== 'custom') out.source = src;
    else notes.push(`source '${src}' isn't recognised`);
  }
  const look = p.get('look');
  if (look && ID.test(look)) {
    if (looks.has(look)) out.look = look;
    else { pending.look = look; notes.push(`look '${look}' isn't in this build yet`); }
  }
  const tex = p.get('tex');
  if (tex) {
    const t = textures.get(tex);
    if (t && tex !== 'image' && !t.disabled) out.tex = tex;
    else notes.push(`texture '${tex}' can't be shared`);
  }
  const uvm = p.get('uv');
  if (uvm === '0' || uvm === '1') out.uvmode = +uvm;
  const d = num(p.get('d'), 0, 1.5);
  if (d !== undefined) out.depth = d;
  const amt = num(p.get('amt'), 0, 1);
  if (amt !== undefined) out.amount = amt;
  const mot = p.get('mot');
  if (mot && ID.test(mot)) {
    if (['file', 'mic'].includes(mot)) { /* local-only sources, never shared */ }
    else if (motion.has(mot)) out.audio = mot;
    else { pending.audio = mot; notes.push(`motion source '${mot}' isn't in this build yet`); }
  }
  const turn = p.get('turn');
  if (turn && ID.test(turn)) {
    if (turns.has(turn)) out.spin = turn;
    else { pending.spin = turn; notes.push(`turn mode '${turn}' isn't in this build yet`); }
  }
  const gnd = p.get('gnd');
  if (gnd === 'look' || HEX.test(gnd)) out.ground = gnd;
  const glow = p.get('glow');
  if (glow !== null && glow !== undefined) {
    const g = +glow;
    if (Number.isFinite(g)) out.glow = g;
  }
  out._depthAnimate = animateDepth;
  return { out, notes };
}

// Write validated values into state. Depth eases when animateDepth (the
// frame loop lerps state.depth toward state.depthTarget).
function applyValidated(v) {
  const { out, notes } = v;
  for (const k of ['source', 'look', 'tex', 'uvmode', 'audio', 'spin', 'ground', 'amount', 'glow']) {
    if (out[k] !== undefined) set(k, out[k]);
  }
  if (out.depth !== undefined) {
    if (out._depthAnimate) state.depthTarget = out.depth;
    else { state.depth = out.depth; state.depthTarget = null; }
  }
  if (notes.length) ui.showError(`Applied what it could — ${notes.join('; ')}.`);
  return out;
}

// ------------------------------------------------------------ presets
const PKEY = 'hs-subjects-presets';

const BUILTINS = [
  { name: 'Studio', map: { src: 'mark', look: 'clay', mot: 'voice', turn: 'sway', gnd: 'look' } },
  { name: 'Neon night', map: { look: 'neon', turn: 'turn' } },
  { name: 'Liquid', map: { look: 'liquid', turn: 'float', mot: 'idle' } },
  { name: 'Print', map: { look: 'ink', d: '0.35', turn: 'still' } },
  { name: 'Signal', map: { look: 'hyper', turn: 'turn' } },
];

function loadSaved() {
  try {
    const l = JSON.parse(localStorage.getItem(PKEY) || '[]');
    return Array.isArray(l) ? l.filter((p) => p && typeof p.name === 'string' && p.map && typeof p.map === 'object') : [];
  } catch { return []; }
}
function saveSaved(list) {
  try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch {}
}

const presetParams = (map) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(map)) if (typeof v === 'string') p.set(k, v);
  return p;
};

export function initShare(ctx) {
  const { stage, applyAll } = ctx;

  // ---- apply the incoming URL hash before the first frame --------------
  if (window.top === window && location.hash.length > 1) {
    const p = parseShareText(location.hash);
    if (p) applyValidated(validate(p, false));
  }

  // ---- presets ---------------------------------------------------------
  const psec = ui.panels.add({ id: 'presets', title: 'Presets', after: 'sec-ground' });
  const list = document.createElement('div');
  list.className = 'seg';
  list.id = 'pre-list';
  const saveRow = document.createElement('div');
  saveRow.className = 'row';
  const nameIn = document.createElement('input');
  nameIn.id = 'pre-name';
  nameIn.placeholder = 'Preset name';
  nameIn.maxLength = 32;
  nameIn.style.cssText =
    'flex:1;min-width:0;font:500 12.5px/1 var(--font-ui);color:var(--fg);' +
    'background:var(--chip);border:1px solid var(--line);border-radius:8px;padding:8px 10px;';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save current';
  saveRow.append(nameIn, saveBtn);
  psec.append(list, saveRow);

  function renderPresets() {
    list.textContent = '';
    const saved = loadSaved();
    for (const p of [...BUILTINS, ...saved.map((s, i) => ({ ...s, saved: i }))]) {
      const b = document.createElement('button');
      b.dataset.v = p.name;
      b.setAttribute('aria-pressed', 'false');
      b.append(p.name);
      b.addEventListener('click', () => applyPreset(p.map));
      if (p.saved !== undefined) {
        const x = document.createElement('span');
        x.textContent = ' ×';
        x.style.opacity = '.6';
        x.title = 'Delete preset';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          const l = loadSaved();
          l.splice(p.saved, 1);
          saveSaved(l);
          renderPresets();
        });
        b.append(x);
      }
      list.append(b);
    }
  }
  renderPresets();

  saveBtn.addEventListener('click', () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.focus(); return; }
    const l = loadSaved();
    if (l.length >= 16) { ui.showError('Preset list is full — delete one first.'); return; }
    l.push({ name, map: shareMap() });
    saveSaved(l);
    nameIn.value = '';
    renderPresets();
  });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

  // a preset dips the stage and eases the depth slider to its value
  function applyPreset(map) {
    const c = stage.canvas;
    c.style.transition = 'opacity .22s ease';
    c.style.opacity = '0.08';
    setTimeout(() => {
      applyValidated(validate(presetParams(map), true));
      applyAll();
      c.style.opacity = '1';
    }, 170);
  }

  // ---- paste a link or code anywhere to apply it ------------------------
  document.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (/<svg[\s>]/i.test(text)) return;   // the SVG loader owns that paste
    const p = parseShareText(text);
    if (!p) return;
    e.preventDefault();
    applyValidated(validate(p, true));
    applyAll();
  });

  // ---- keep the standalone URL's hash live ------------------------------
  if (window.top === window) {
    setInterval(() => {
      const h = '#' + qs(shareMap());
      if (location.hash !== h) history.replaceState(null, '', h);
    }, 400);
  }
}
