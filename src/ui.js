// DOM controls: segmented buttons, sliders, the error toast, and the panel
// sections feature modules mount into.
import { set, subscribe } from './state.js';

// Write a state key and refresh pressed states (via the bindSeg
// subscription). uvmode stays a number; everything else is the string
// from data-v.
export function pick(group, v) {
  set(group, isNaN(+v) || group !== 'uvmode' ? v : +v);
}

// Build a segmented control's buttons from registry entries.
// Entry fields used: id (data-v), name (label), swatch (optional .sw
// class), disabled (optional).
export function fillSeg(id, entries) {
  const el = document.getElementById(id);
  el.textContent = '';
  for (const e of entries) {
    const b = document.createElement('button');
    b.dataset.v = e.id;
    b.setAttribute('aria-pressed', 'false');
    if (e.swatch) {
      const s = document.createElement('span');
      s.className = 'sw ' + e.swatch;
      b.append(s);
    }
    b.append(e.name);
    if (e.disabled) b.disabled = true;
    el.append(b);
  }
}

// A segmented control bound to a state key: clicks pick() the value, and
// pressed states follow the state (however it was changed). fn(v) runs
// after each click pick.
export function bindSeg(group, fn) {
  const el = document.getElementById(group);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    pick(group, b.dataset.v);
    fn?.(b.dataset.v);
  });
  subscribe(group, (v) => {
    el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  });
}

export function setSegDisabled(group, v, disabled) {
  const b = document.querySelector(`#${group} [data-v="${v}"]`);
  if (b) b.disabled = disabled;
}

const errEl = document.getElementById('error');
export function showError(msg) {
  errEl.textContent = msg; errEl.hidden = false;
  clearTimeout(showError.t); showError.t = setTimeout(() => { errEl.hidden = true; }, 6000);
}

// Named panel sections. Existing sections carry ids sec-<name>; a feature
// module adds its own with panels.add and mounts its controls inside —
// without touching index.html or these internals.
export const panels = {
  get: (name) => document.getElementById('sec-' + name) || document.getElementById(name),
  add({ id, title, after }) {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = 'sec-' + id;
    if (title) {
      const label = document.createElement('div');
      label.className = 'label';
      label.id = 'l-' + id;
      label.textContent = title;
      sec.setAttribute('aria-labelledby', label.id);
      sec.append(label);
    }
    const anchor = after && panels.get(after)
      ? panels.get(after).nextSibling
      : document.querySelector('.panel .foot');
    document.querySelector('.panel').insertBefore(sec, anchor);
    return sec;
  },
};

export function slider(id, fn) {
  const el = document.getElementById(id);
  el.addEventListener('input', () => fn(+el.value));
  return el;
}
