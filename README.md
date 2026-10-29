# Flowtoys

A fun toy for the Wispr Flow logo that you can play with and share. A
vector source (an SVG) is the subject, shown flat or lifted into 3D under
a set of materials. Open `index.html` from any static server
(`python3 -m http.server` in this folder); three.js loads from jsDelivr.

- **Sources.** `sources/flow-mark.svg` and `sources/flow-wordmark.svg`
  are the Wispr Flow mark and wordmark, taken as-is from wisprflow.ai's
  own SVGs (the mark's round backdrop removed). Both are embedded in the
  page; *Load SVG…* or a paste adds any other SVG.
- **SVG rules.** Pill-shaped paths become capsules; other filled paths
  are extruded with a rounded bevel. Strokes keep their width, caps and
  joins; circles become spheres, ellipses ellipsoids, rounded rects
  rounded boxes and rings tori. Transforms, `use`, `viewBox`, fill-rule
  and `display:none` are honoured; text needs converting to outlines
  first. *Source colours* paints each part with its own fill/stroke.
- **Flat ↔ 3D.** The Depth slider squashes z (and the normals with it),
  so 0 is the flat vector and 1 the full capsule.
- **Looks.** Clay, Chrome, Glass, Pearl and Liquid are physical
  materials; Toon, Halftone, Plasma, Wireframe, Neon and Ink are shaders
  of their own. Every look shares one vertex transform (`SUBJECT_GLSL`).
  The Glow slider adds bloom on top, and look changes crossfade.
- **Textures.** Checker, Stripes, Aurora, Grid or an image. They are mapped
  across the whole subject or per part (around and along each capsule).
- **Motion.** Each capsule has a gain slot (`uGain`), ordered left to
  right. A demo voice, an audio file, your microphone, or a quiet idle
  wave drive the gains — the mic path auto-gains and never listens unless
  you pick it. Still, Sway, Turn and Float turn the whole subject; every
  periodic motion loops seamlessly at 12 s.
- **Export & share.** Stills at 1×/2×/4× (transparent optionally), 4 s
  clips or a 12 s seamless loop via MediaRecorder, and a share link (or
  `subjects:` code embedded) that carries the whole configuration.
  Presets — Studio, Neon night, Liquid, Print, Signal — jump between
  whole setups; your own can be saved in the browser.

`demo.mp4` tours the toy: a flat/3D morph, every look, a custom stroked
SVG in its own colours, presets, the mic source, and PNG + clip export.
It was recorded headless on a stepped clock (`tests/demo.mjs`), so it
plays at an even 30 fps.

Flowtoys started as a prototype (`prototypes/subjects`) in
[cutaiar/hyperspace](https://github.com/Cutaiar/hyperspace).

## Development

No build step for development: `index.html` loads `src/main.js` as a
plain ES module (three.js comes from the jsDelivr import map), so any
static server works — `python3 -m http.server` in this folder.

```sh
npm install                     # playwright, esbuild, http-server
node tests/smoke.mjs            # headless check + look/source screenshots in tests/out/
node tests/demo.mjs             # re-record demo.mp4 on a stepped clock
node scripts/build-artifact.mjs # bundles src/ into a single dist/index.html
```
