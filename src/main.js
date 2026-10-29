// The app wiring: build the stage and subject, connect controls to state,
// and run the frame loop.
import * as THREE from 'three';
import { U, FIXED, VS, LINE_FS, POINT_FS } from './glsl.js';
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

// ------------------------------------------------------------ subject layers
let subject = null, mesh = null, lines = null, points = null, material = null;
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
  lines.frustumCulled = points.frustumCulled = mesh.frustumCulled = false;
  pivot.add(mesh, lines, points);
  applyLook();
  applyUv();
  stage.fit(subject);
  const bits = [];
  if (subject.pills) bits.push(`${subject.pills} capsule${subject.pills === 1 ? '' : 's'}`);
  if (subject.solids) bits.push(`${subject.solids} extruded path${subject.solids === 1 ? '' : 's'}`);
  if (subject.dropped) bits.push('backdrop dropped');
  bits.push(`${subject.tris.toLocaleString()} tris`);
  document.getElementById('stats').textContent = `${state.source === 'custom' ? 'Your SVG' : SOURCES[state.source].name} · ${bits.join(' · ')}`;
}

function applyLook() {
  const L = looks.get(state.look);
  if (material) material.dispose();
  material = L.mat();
  mesh.material = material;
  lines.visible = points.visible = !!L.wire;
  backdrop.visible = !!L.backdrop;
  applyTex();
  applyGround();
  document.getElementById('tex-note').hidden = !!L.textured;
  document.querySelectorAll('#tex button, #uvmode button').forEach(b => {
    const entry = b.closest('#tex') ? textures.get(b.dataset.v) : null;
    b.disabled = !L.textured || !!entry?.disabled;
  });
}
function applyTex() {
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
  try { setSubject(v === 'custom' ? SOURCES.custom.svg : SOURCES[v].svg); errEl.hidden = true; }
  catch (e) { ui.showError(e.message || 'That SVG could not be read.'); }
}

// registry-driven segmented controls
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
  updateGains(motionOn ? t : 0, dt, subject ? Math.min(subject.pills, FIXED) : 0);
  controls.update();
  U.uCamDist.value = camera.position.distanceTo(controls.target);
  stage.draw();
  requestAnimationFrame(tick);
}

// first frame: restore the remembered controls, then build
for (const g of ['source', 'look', 'tex', 'uvmode', 'audio', 'spin', 'ground']) ui.pick(g, String(state[g]));
depthEl.value = state.depth; amountEl.value = state.amount; amountOut.textContent = (+state.amount).toFixed(2);
useSource(state.source);
requestAnimationFrame(tick);
