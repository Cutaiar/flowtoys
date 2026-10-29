// Stepped-clock recorder: drive the page with a virtual clock (rAF +
// performance.now wrapped in an init script), step 1/30 s per frame,
// screenshot each frame into ffmpeg. Deterministic given the seeded state.
//
//   node tests/record.mjs                     record strokes.svg w/ demo voice
//   OUT=out.mp4 SECONDS=4 FIXTURE=strokes     tweak output / length / fixture
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = process.env.OUT || path.join(root, 'tests/out/strokes-audio.mp4');
const FIXTURE = process.env.FIXTURE || 'strokes';
const SECONDS = +(process.env.SECONDS || 4);
const FPS = 30;
const PORT = 8766;
mkdirSync(path.dirname(OUT), { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: root, stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/index.html`, { method: 'HEAD' }).then(r => r.ok && r.body?.cancel()); break; }
  catch { await new Promise(r => setTimeout(r, 200)); }
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
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
      source: 'mark', look: 'clay', tex: 'none', uvmode: 0, color: 'source',
      depth: 1, amount: 0.7, audio: 'off', spin: 'still', ground: 'look',
    }));
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(
    () => document.getElementById('stats')?.textContent !== 'Loading…',
    null, { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts.ready);

  await page.setInputFiles('#svg-file', path.join(root, 'fixtures', `${FIXTURE}.svg`));
  await page.waitForFunction(
    () => document.getElementById('stats')?.textContent.startsWith('Your SVG'),
    null, { timeout: 15000 },
  );
  await page.click('#audio [data-v="voice"]');

  const clip = await page.locator('#stage').boundingBox();
  const ff = spawn('ffmpeg', [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });

  const frames = Math.round(SECONDS * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((ms) => window.__step(ms), 1000 / FPS);
    const png = await page.screenshot({ clip });
    ff.stdin.write(png);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg ${c}`))));
  console.log(`recorded ${frames} frames -> ${OUT}`);
} finally {
  await browser.close();
  server.kill();
}
