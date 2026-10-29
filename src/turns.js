// Turn modes as a registry — the per-frame pivot rotation. An entry:
//   { id, name, t, follows, update(entry, dt, pivot) }
//     id      — the value stored in state.spin
//     name    — button label
//     t       — the mode's phase accumulator
//     follows — while any mode is idle (decaying back to zero), the loop
//               keeps t synced to pivot.rotation.y so the mode resumes
//               smoothly when picked again
//     update  — optional; when present and motion is allowed it runs every
//               frame, otherwise the loop decays the rotation to zero
// Any periodic motion must use integer multiples of LOOP_W so a
// LOOP_SECONDS recording loops seamlessly.
import { LOOP_W } from './timing.js';
import { createRegistry } from './registry.js';

export const turns = createRegistry('turn mode');

turns.register({ id: 'still', name: 'Still', t: 0 });

turns.register({ id: 'sway', name: 'Sway', t: 0,
  update(e, dt, pivot) {
    e.t += dt;
    pivot.rotation.y = 0.5 * Math.sin(e.t * LOOP_W);
    pivot.rotation.x = 0.14 * Math.sin(e.t * LOOP_W + 2.1);
  } });

turns.register({ id: 'turn', name: 'Turn', t: 0, follows: true,
  update(e, dt, pivot) {
    e.t += dt * LOOP_W;   // one revolution per loop
    pivot.rotation.y = e.t; pivot.rotation.x = 0;
  } });
