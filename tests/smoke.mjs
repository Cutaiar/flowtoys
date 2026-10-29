// Smoke test: load the page headless, fail on console errors, and screenshot
// every look for each built-in source into tests/out/ (gitignored).
//
//   node tests/smoke.mjs            serve the repo root and test index.html
//   BASE_URL=http://localhost:9000  test an already-running server instead
//   OUT_DIR=/tmp/shots              screenshot somewhere else
//
// The page is driven deterministically: a seeded Math.random, a fixed rAF
// clock and a "still / no audio" state in localStorage, so screenshots are
// comparable run to run.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || path.join(root, 'tests/out');
const PORT = 8765;
mkdirSync(OUT_DIR, { recursive: true });

const LOOKS = ['clay', 'chrome', 'glass', 'pearl', 'toon', 'halftone', 'plasma', 'hyper', 'neon', 'liquid', 'ink'];
const SOURCES = ['mark', 'wordmark'];

let server = null;
const base = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
if (!process.env.BASE_URL) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: root, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/index.html', { method: 'HEAD' }).then(r => r.ok && r.body?.cancel()); break; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    let s = 42;
    Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const raf = window.requestAnimationFrame.bind(window);
    window.__vt = 12000; window.__advance = false;
    window.requestAnimationFrame = (cb) => raf(() => cb((window.__vt += window.__advance ? 16 : 0)));
    localStorage.setItem('hs-subjects', JSON.stringify({
      source: 'mark', look: 'clay', tex: 'none', uvmode: 0,
      depth: 1, amount: 0.7, audio: 'off', spin: 'still', ground: 'look',
    }));
  });

  await page.goto(base + '/index.html');
  await page.waitForFunction(
    () => document.getElementById('stats')?.textContent !== 'Loading…',
    null, { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  // look/source/texture changes crossfade for ~0.6 s; wait it out so the
  // stills compare like-for-like
  for (const source of SOURCES) {
    await page.click(`#source [data-v="${source}"]`);
    await page.waitForTimeout(700);
    for (const look of LOOKS) {
      await page.click(`#look [data-v="${look}"]`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT_DIR, `${source}-${look}.png`) });
      console.log(`shot ${source}-${look}.png`);
    }
  }

  // stream C: each fixture SVG is uploaded through the file input and shot
  // under "Source colours" (exercises aColor through every look path)
  await page.click('#source [data-v="mark"]');
  await page.click('#look [data-v="clay"]');
  await page.click('#color [data-v="source"]');
  const FIXTURES = ['strokes', 'circles', 'rounded-rect', 'ring', 'holes', 'gradient', 'transforms', 'logo-complex'];
  for (const name of FIXTURES) {
    await page.setInputFiles('#svg-file', path.join(root, 'fixtures', `${name}.svg`));
    await page.waitForFunction(
      () => document.getElementById('stats')?.textContent.startsWith('Your SVG'),
      null, { timeout: 15000 },
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, `fixture-${name}.png`) });
    console.log(`shot fixture-${name}.png`);
  }

  // a text-only SVG must surface a clear message, not a crash
  await page.setInputFiles('#svg-file', path.join(root, 'fixtures', 'text.svg'));
  await page.waitForSelector('#error:not([hidden])', { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT_DIR, 'fixture-text.png') });
  console.log('shot fixture-text.png');
  await page.click('#color [data-v="look"]');

  // exercise the motion paths the still/off shots skip: advancing clock,
  // demo-voice gains and the turn loop
  await page.click('#source [data-v="mark"]');
  await page.click('#audio [data-v="voice"]');
  await page.click('#spin [data-v="turn"]');
  await page.evaluate(() => { window.__advance = true; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, 'mark-motion.png') });
  console.log('shot mark-motion.png');
} finally {
  await browser.close();
  server?.kill();
}

if (errors.length) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nsmoke ok — no console errors');
