# Flowtoys

A fun toy for the Wispr Flow logo that you can play with and share. A
vector source (an SVG) is the subject, shown flat or lifted into 3D under
a set of materials. Open `index.html` from any static server
(`python3 -m http.server` in this folder); three.js loads from jsDelivr.

- **Sources.** `sources/flow-mark.svg` and `sources/flow-wordmark.svg`
  are the Wispr Flow mark and wordmark, taken as-is from wisprflow.ai's
  own SVGs (the mark's round backdrop removed). Both are embedded in the
  page; *Load SVG…* or a paste adds any other filled SVG.
- **Flat ↔ 3D.** A filled path whose area matches a stadium for its
  bounding box is read as a pill and built as a capsule; every other path
  is extruded with a rounded bevel. The Depth slider squashes z (and the
  normals with it), so 0 is the flat vector and 1 the full capsule.
- **Looks.** Clay, Chrome, Glass and Pearl are three.js physical
  materials; Toon, Halftone, Plasma and Wireframe are shaders of their
  own. Every look shares one vertex transform (`SUBJECT_GLSL`).
- **Textures.** Checker, Stripes, Aurora, Grid or an image. They are mapped
  across the whole subject or per part (around and along each capsule).
- **Motion.** Each capsule has a gain slot (`uGain`), ordered left to
  right. A demo voice or an audio file's log-spaced bands drive the gains,
  so the bars move like the waveform they draw.

`demo.mp4` walks through it: the capsules moving to the demo voice, the
morph to flat and back, every look, a texture per part, and the wordmark
in chrome. It was recorded headless on a stepped clock, so it plays at an
even 30 fps.

Flowtoys started as a prototype (`prototypes/subjects`) in
[cutaiar/hyperspace](https://github.com/Cutaiar/hyperspace).

## Development

No build step for development: `index.html` loads `src/main.js` as a
plain ES module (three.js comes from the jsDelivr import map), so any
static server works — `python3 -m http.server` in this folder.

```sh
npm install                     # playwright, esbuild, http-server
node tests/smoke.mjs            # headless check + look/source screenshots in tests/out/
node scripts/build-artifact.mjs # bundles src/ into a single dist/index.html
```
