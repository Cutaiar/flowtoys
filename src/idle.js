// The Idle motion source: a slow travelling wave across the bars. It lives
// here rather than in audio.js because this is the looks-and-motion stream's
// module — it only registers with the motion registry.
// Period 3 s = 4 * LOOP_W, so recordings still loop on the 12 s loop.
import { motion } from './audio.js';
import { LOOP_W } from './timing.js';

motion.register({ id: 'idle', name: 'Idle wave',
  levels: (t, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(Math.max(0, 0.45 + 0.5 * Math.sin(t * 4 * LOOP_W - i * 0.9)));
    }
    return out;
  } });
