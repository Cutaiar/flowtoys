// The app wiring: build the stage and subject, connect controls to state,
// and run the frame loop.
import * as THREE from 'three';
import { U, FIXED, VS, LINE_FS, POINT_FS, HULL_VS, HULL_FS } from './glsl.js';
import './idle.js';
import { SOURCES, buildSubject } from './subject.js';
import { looks, textures, RED } from './looks.js';
import { initStage } from './stage.js';
import { state, remember } from './state.js';
import { turns } from './turns.js';
import { motion, updateGains, loadAudioFile, hasAudioFile, isAudioFilePlaying, pauseAudioFile, unpauseAudioFile, playAudioFile } from './audio.js';
import * as ui from './ui.js';
import { initExport } from './export.js';

// ------------------------------------------------------------ stage
const canvas = document.getElementById('view');
const stageEl = document.getElementById('stage');
const errEl = document.getElementById('error');
const stage = initStage(canvas, stageEl, errEl);   // throws when WebGL is missing
const { scene, camera, controls, pivot, backdrop } = stage;
const WHITE = new THREE.Color(0xffffff);

// ------------------------------------------------------------ subject layers
let subject = null, mesh = null, lines = null, points = null, material = null, hull = null;
// the ink look's outline: an inverted copy of the subject drawn BackSide
const hullMat = new THREE.ShaderMaterial({
  vertexShader: HULL_VS, fragmentShader: HULL_FS,
  uniforms: { ...U, uColor: { value: new THREE.Color('#121216') }, uOutline: { value: 0 } },
  side: THREE.BackSide,
});
const lineMat = new THREE.ShaderMaterial({
  vertexShader: VS, fragmentShader: LINE_FS,
  uniforms: { ...U, uColor: { value: new THREE.Color('#ffffff') }, uAlpha: { value: 0.9 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const pointMat = new THREE.ShaderMaterial({
  vertexShader: VS, fragmentShader: POINT_FS,
  uniforms: { ...U, uColor: { value: new THREE.Color(RED) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

function setSubject(svgText) {
  const next = buildSubject(svgText);   // throws before anything is torn down
  if (subject) { subject.mesh.dispose(); subject.lines.dispose(); subject.points.dispose(); pivot.clear(); }
  subject = next;
  mesh = new THREE.Mesh(subject.mesh, material || looks.get(state.look).mat());
  lines = new THREE.LineSegments(subject.lines, lineMat);
  points = new THREE.Points(subject.points, pointMat);
  hull = new THREE.Mesh(subject.mesh, hullMat);
  lines.frustumCulled = points.frustumCulled = mesh.frustumCulled = hull.frustumCulled = false;
  hull.renderOrder = -1;
  pivot.add(hull, mesh, lines, points);
  applyLook();
  applyUv();
  stage.fit(subject);
  const KIND = { capsule: ['capsule', 'capsules'], sphere: ['sphere', 'spheres'], ellipsoid: ['ellipsoid', 'ellipsoids'], rbox: ['rounded box', 'rounded boxes'], torus: ['torus', 'tori'], extruded: ['extruded path', 'extruded paths'] };
  const bits = Object.entries(subject.counts).filter(([, n]) => n).map(([k2, n]) => `${n} ${KIND[k2][n === 1 ? 0 : 1]}`);
  if (subject.dropped) bits.push('backdrop dropped');
  bits.push(`${subject.tris.toLocaleString()} tris`);
  if (subject.warn) ui.showError(subject.warn);
  document.getElementById('stats').textContent = `${state.source === 'custom' ? 'Your SVG' : SOURCES[state.source].name} · ${bits.join(' · ')}`;
}

function applyLook() {
  stage.xfade();   // capture the outgoing frame for the crossfade
  const L = looks.get(state.look);
  if (material) material.dispose();
  material = L.mat();
  if (!material.isShaderMaterial) material.userData.srcBase = material.color.clone();
  mesh.material = material;
  lines.visible = points.visible = !!L.wire;
  backdrop.visible = !!L.backdrop;
  hull.visible = !!L.hull;
  hullMat.uniforms.uOutline.value = L.hull || 0;
  applyTex();
  applyGround();
  document.getElementById('tex-note').hidden = !!L.textured;
  document.querySelectorAll('#tex button, #uvmode button').forEach(b => {
    const entry = b.closest('#tex') ? textures.get(b.dataset.v) : null;
    b.disabled = !L.textured || !!entry?.disabled;
  });
  applyColor();
}
function applyColor() {
  const src = state.color === 'source';
  U.uSrcColor.value = src ? 1 : 0;   // shared: mesh, line and point shaders all read it
  if (material.isShaderMaterial) return;
  material.vertexColors = src;
  material.color.copy(src ? WHITE : material.userData.srcBase);   // a dark diffuse (Pearl) would swallow vertex colours
  material.needsUpdate = true;
}
function applyTex() {
  stage.xfade();   // capture the outgoing frame for the crossfade
  const L = looks.get(state.look);
  const t = L.textured ? textures.get(state.tex)?.tex ?? null : null;
  if (material.isShaderMaterial) {
    material.uniforms.uMap.value = t;
    material.uniforms.uHasMap.value = t ? 1 : 0;
  } else {
    material.map = t;
    material.needsUpdate = true;
  }
}
function applyUv() {
  U.uUvMode.value = state.uvmode;
  if (subject) for (const g of [subject.mesh]) g.setAttribute('uv', state.uvmode ? subject.attrs.uvPart : subject.attrs.uvLogo);
}
function applyGround() {
  const c = state.ground === 'look' ? looks.get(state.look).ground : state.ground;
  scene.background = new THREE.Color(c);
  stageEl.style.background = c;
}

// ------------------------------------------------------------ controls
function useSource(v) {
  stage.xfade();   // capture the outgoing frame for the crossfade
  try { setSubject(v === 'custom' ? SOURCES.custom.svg : SOURCES[v].svg); errEl.hidden = !subject?.warn; }
  catch (e) { ui.showError(e.message || 'That SVG could not be read.'); }
}

// registry-driven segmented controls
// Colour: "Look's own" or the SVG's own fills/strokes (aColor), mounted into
// the Look section without touching index.html.
{
  const label = document.createElement('div');
  label.className = 'label'; label.textContent = 'Colour';
  const seg = document.createElement('div');
  seg.className = 'seg'; seg.id = 'color';
  ui.panels.get('sec-look').append(label, seg);
}
ui.fillSeg('color', [{ id: 'look', name: "Look's own" }, { id: 'source', name: 'Source colours' }]);
ui.bindSeg('color', applyColor);

ui.fillSeg('look', looks.entries());
ui.fillSeg('tex', textures.entries());
ui.fillSeg('audio', motion.entries());
ui.fillSeg('spin', turns.entries());

ui.bindSeg('source', useSource);
ui.bindSeg('look', applyLook);
ui.bindSeg('tex', applyTex);
ui.bindSeg('uvmode', applyUv);
ui.bindSeg('audio', (v) => {
  if (v === 'file' && hasAudioFile() && !isAudioFilePlaying()) unpauseAudioFile();
  if (v !== 'file' && hasAudioFile()) pauseAudioFile();
  syncPlay();
});
ui.bindSeg('spin', () => {});
ui.bindSeg('ground', applyGround);

function loadCustom(text) {
  try {
    buildSubject(text);   // check it first
    SOURCES.custom = { name: 'Your SVG', svg: text };
    ui.setSegDisabled('source', 'custom', false);
    ui.pick('source', 'custom');
    useSource('custom');
  } catch (e) { ui.showError(e.message || 'That SVG could not be read.'); }
}
document.getElementById('svg-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  loadCustom(await f.text()); e.target.value = '';
});
document.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text') || '';
  if (/<svg[\s>]/i.test(text)) { e.preventDefault(); loadCustom(text); }
});
document.getElementById('img-file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    const img = textures.get('image');
    if (img.tex) img.tex.dispose();
    img.tex = t; img.disabled = false;
    ui.pick('tex', 'image'); applyLook();
  }, undefined, () => ui.showError('That image could not be read. Try a PNG or JPEG.'));
  e.target.value = '';
});
document.getElementById('audio-file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  loadAudioFile(f).then(() => {
    const play = document.getElementById('audio-play');
    play.hidden = false; play.textContent = 'Pause';
    ui.setSegDisabled('audio', 'file', false);
    ui.pick('audio', 'file');
  }).catch(() => ui.showError('That audio file could not be played. Try an MP3, M4A or WAV.'));
  e.target.value = '';
});
function syncPlay() {
  const b = document.getElementById('audio-play');
  if (hasAudioFile()) b.textContent = isAudioFilePlaying() ? 'Pause' : 'Play';
}
document.getElementById('audio-play').addEventListener('click', () => {
  if (!hasAudioFile()) return;
  if (!isAudioFilePlaying()) { playAudioFile(); ui.pick('audio', 'file'); } else pauseAudioFile();
  syncPlay();
});

const depthEl = document.getElementById('depth'), depthOut = document.getElementById('depth-out');
const amountEl = document.getElementById('amount'), amountOut = document.getElementById('amount-out');
depthEl.addEventListener('input', () => { state.depthTarget = null; state.depth = +depthEl.value; remember(); });
amountEl.addEventListener('input', () => { state.amount = +amountEl.value; amountOut.textContent = state.amount.toFixed(2); remember(); });

let faceFront = 0;   // seconds left of easing the view back to face-on
document.getElementById('form-flat').addEventListener('click', () => {
  state.depthTarget = 0; faceFront = 0.9;
  if (state.spin !== 'still') { ui.pick('spin', 'still'); }
});
document.getElementById('form-3d').addEventListener('click', () => {
  state.depthTarget = 1;
  if (state.spin === 'still') ui.pick('spin', 'sway');
});

initExport(stage, state);

// ------------------------------------------------------------ loop
function resize() { stage.resize(subject); }
new ResizeObserver(resize).observe(stageEl);
resize();

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  U.uTime.value = t;

  if (state.depthTarget !== null) {
    state.depth += (state.depthTarget - state.depth) * Math.min(1, dt * 5);
    if (Math.abs(state.depthTarget - state.depth) < 0.002) { state.depth = state.depthTarget; state.depthTarget = null; remember(); }
    depthEl.value = state.depth;
  }
  U.uDepth.value = state.depth;
  depthOut.textContent = state.depth.toFixed(2);
  const flat = state.depth < 0.05;
  document.getElementById('form-flat').setAttribute('aria-pressed', String(flat));
  document.getElementById('form-3d').setAttribute('aria-pressed', String(!flat));

  const motionOn = !reduced.matches;
  const mode = turns.get(state.spin);
  if (mode?.update && motionOn) {
    mode.update(mode, dt, pivot);
  } else {
    pivot.rotation.y *= Math.max(0, 1 - dt * 4); pivot.rotation.x *= Math.max(0, 1 - dt * 4);
    for (const e of turns.entries()) if (e.follows) e.t = pivot.rotation.y;
  }
  if (faceFront > 0) {
    faceFront -= dt;
    const d = camera.position.length();
    camera.position.lerp(new THREE.Vector3(0, 0, d), Math.min(1, dt * 6));
  }
  updateGains(motionOn ? t : 0, dt, subject ? Math.min(subject.movers, FIXED) : 0);
  controls.update();
  U.uCamDist.value = camera.position.distanceTo(controls.target);
  stage.draw();
  requestAnimationFrame(tick);
}

// first frame: restore the remembered controls, then build
for (const g of ['source', 'look', 'color', 'tex', 'uvmode', 'audio', 'spin', 'ground']) ui.pick(g, String(state[g]));
depthEl.value = state.depth; amountEl.value = state.amount; amountOut.textContent = (+state.amount).toFixed(2);
useSource(state.source);
requestAnimationFrame(tick);
