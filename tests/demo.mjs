// Demo-video recorder: same stepped-clock technique as record.mjs, but with a
// timed choreography — a tour of every look, flat/3D, a stroke fixture with
// source colours, a preset, the mic source, and the export controls.
//
//   node tests/demo.mjs                -> demo.mp4 at the repo root
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = process.env.OUT || path.join(root, 'demo.mp4');
const SECONDS = +(process.env.SECONDS || 36);
const FPS = 30;
const PORT = 8767;
mkdirSync(path.dirname(OUT), { recursive: true });

const LOOK_TOUR = ['chrome', 'glass', 'pearl', 'toon', 'halftone', 'plasma', 'hyper', 'neon', 'liquid', 'ink', 'clay'];

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: root, stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/index.html`, { method: 'HEAD' }).then(r => r.ok && r.body?.cancel()); break; }
  catch { await new Promise(r => setTimeout(r, 200)); }
}

const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let s = 42;
    Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pending = [];
    window.__vt = 12000;
    window.__step = (ms) => {
      window.__vt += ms;
      for (const cb of pending.splice(0)) cb(window.__vt);
    };
    window.requestAnimationFrame = (cb) => { pending.push(cb); return pending.length; };
    performance.now = () => window.__vt;
    localStorage.setItem('hs-subjects', JSON.stringify({
      source: 'mark', look: 'clay', tex: 'none', uvmode: 0, color: 'look',
      depth: 1, amount: 0.7, audio: 'voice', spin: 'sway', ground: 'look', glow: 0,
    }));
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(
    () => document.getElementById('stats')?.textContent !== 'Loading…',
    null, { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts.ready);

  const ff = spawn('ffmpeg', [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });

  // timed beats; actions whose virtual time has passed run before the frame
  const beats = [
    [3.5, () => page.click('#form-flat')],
    [5.5, () => page.click('#form-3d')],
    ...LOOK_TOUR.map((l, i) => [7 + i * 1.1, () => page.click(`#look [data-v="${l}"]`)]),
    [19.5, () => page.setInputFiles('#svg-file', path.join(root, 'fixtures', 'strokes.svg'))],
    [20.5, () => page.click('#color [data-v="source"]')],
    [22.5, () => page.locator('#pre-list button', { hasText: 'Neon night' }).click()],
    [24.5, () => page.locator('#pre-list button', { hasText: 'Liquid' }).click()],
    [26.5, () => page.click('#audio [data-v="mic"]')],
    [29.5, () => page.click('#audio [data-v="voice"]')],
    [30.0, () => page.click('#exp-alpha')],
    [30.5, () => page.locator('button', { hasText: 'Save PNG' }).click()],
    [31.5, () => page.click('#exp-rec')],
    [33.5, () => page.click('#exp-rec')],
    [34.0, () => page.click('#source [data-v="mark"]')],
    [34.2, () => page.click('#look [data-v="liquid"]')],
  ];

  const frames = Math.round(SECONDS * FPS);
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    for (const [at, fn] of beats.splice(0, beats.filter(b => b[0] <= t).length))
      await fn().catch(e => console.warn(`beat@${at}s: ${e.message.split('\n')[0]}`));
    await page.evaluate((ms) => window.__step(ms), 1000 / FPS);
    ff.stdin.write(await page.screenshot());
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg ${c}`))));
  console.log(`recorded ${frames} frames -> ${OUT}`);
} finally {
  await browser.close();
  server.kill();
}
