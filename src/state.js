// App state, persisted to localStorage. The key name stays 'hs-subjects'
// so settings saved by earlier versions keep working.
const KEY = 'hs-subjects';

export const state = {
  source: 'mark', look: 'clay', color: 'look', tex: 'none', uvmode: 0,
  depth: 1, depthTarget: null, amount: 0.7, audio: 'voice', spin: 'sway', ground: 'look',
};
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}'), { depthTarget: null }); } catch {}
if (state.source === 'custom') state.source = 'mark';
if (state.tex === 'image') state.tex = 'none';
if (state.audio === 'file') state.audio = 'voice';

export function remember() {
  try {
    const { depthTarget, ...keep } = state;
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {}
}

const subs = new Map();   // key -> [fn]

// Write one key, persist, and notify subscribers. Emits even when the value
// is unchanged, so programmatic picks still refresh the controls.
export function set(key, value) {
  state[key] = value;
  remember();
  for (const fn of subs.get(key) || []) fn(value);
}

// fn(value) runs on every set(key, ...); returns an unsubscribe function.
export function subscribe(key, fn) {
  if (!subs.has(key)) subs.set(key, []);
  subs.get(key).push(fn);
  return () => {
    const l = subs.get(key);
    const i = l ? l.indexOf(fn) : -1;
    if (i >= 0) l.splice(i, 1);
  };
}
