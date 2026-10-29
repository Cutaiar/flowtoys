// One-file artifact: bundle src/ into a single dist/index.html.
// three and three/addons/* stay external — the import map in index.html
// still resolves them from jsDelivr, so the artifact works standalone.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const res = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  write: false,
  external: ['three', 'three/addons/*'],
});
const js = res.outputFiles[0].text;

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const tag = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(tag)) throw new Error(`entry tag not found in index.html: ${tag}`);

mkdirSync(path.join(root, 'dist'), { recursive: true });
writeFileSync(
  path.join(root, 'dist/index.html'),
  html.replace(tag, () => `<script type="module">\n${js}\n</script>`),
);
console.log('dist/index.html written');
