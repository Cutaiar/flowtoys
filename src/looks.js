// Looks and textures as registries. A look entry:
//   { id, name, swatch, ground, textured, backdrop, wire, mat() }
//     id       — the value stored in state.look
//     name     — button label
//     swatch   — optional .sw CSS class for the button's colour dot
//     ground   — stage colour when Ground is "Look's own"
//     textured — accepts a texture map (also enables the texture controls)
//     backdrop — shows the refraction backdrop plane behind the subject
//     wire     — draws the line and point layers
//     mat()    — returns a fresh material (each call; the old one is disposed)
// A texture entry: { id, name, tex, disabled } — tex is a THREE.Texture
// (or null), disabled keeps the button greyed out until content arrives.
import * as THREE from 'three';
import { U, VS, FS, subjectize } from './glsl.js';
import { createRegistry } from './registry.js';

export const CREAM = '#FFFFEB', TEAL = '#034F46', RED = '#FF2B2B';

function customMat(mode, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS,
    uniforms: {
      ...U,
      uMode: { value: mode },
      uInk: { value: new THREE.Color(extra.ink || TEAL) },
      uPaper: { value: new THREE.Color(extra.paper || CREAM) },
      uBase: { value: new THREE.Color(extra.base || '#FFB24A') },
      uMap: { value: null },
      uHasMap: { value: 0 },
    },
    transparent: mode === 3,
    depthWrite: mode !== 3,
    blending: mode === 3 ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export const looks = createRegistry('look');

looks.register({ id: 'clay', name: 'Clay', swatch: 'clay', ground: TEAL, textured: true,
  mat: () => subjectize(new THREE.MeshPhysicalMaterial({
    color: CREAM, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color('#fff7d6') })) });
looks.register({ id: 'chrome', name: 'Chrome', swatch: 'chrome', ground: '#0D1112', textured: true,
  mat: () => subjectize(new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 1, roughness: 0.1, envMapIntensity: 1.3 })) });
looks.register({ id: 'glass', name: 'Glass', swatch: 'glass', ground: TEAL, textured: true, backdrop: true,
  mat: () => subjectize(new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.9, ior: 1.5,
    attenuationColor: new THREE.Color('#D8FFF0'), attenuationDistance: 1.6, specularIntensity: 1, clearcoat: 1 })) });
looks.register({ id: 'pearl', name: 'Pearl', swatch: 'pearl', ground: '#0B0C12', textured: true,
  mat: () => subjectize(new THREE.MeshPhysicalMaterial({
    color: '#2a2e38', metalness: 0.85, roughness: 0.22, iridescence: 1, iridescenceIOR: 1.8,
    iridescenceThicknessRange: [180, 900], clearcoat: 0.6 })) });
looks.register({ id: 'toon', name: 'Toon', swatch: 'toon', ground: '#1B1030', textured: true,
  mat: () => customMat(2, { ink: '#1B1030', base: '#FFB24A' }) });
looks.register({ id: 'halftone', name: 'Halftone', swatch: 'halftone', ground: CREAM,
  mat: () => customMat(1, { ink: TEAL, paper: CREAM }) });
looks.register({ id: 'plasma', name: 'Plasma', swatch: 'plasma', ground: '#05060A',
  mat: () => customMat(0) });
looks.register({ id: 'hyper', name: 'Wireframe', swatch: 'hyper', ground: '#000000', wire: true,
  mat: () => customMat(3) });

// ------------------------------------------------------------ textures
export function canvasTex(draw, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export const textures = createRegistry('texture');

textures.register({ id: 'none', name: 'None', tex: null });
textures.register({ id: 'checker', name: 'Checker', tex: canvasTex((g, s) => {
  const n = 8, k = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? TEAL : CREAM;
    g.fillRect(i * k, j * k, k, k);
  }
}) });
textures.register({ id: 'stripes', name: 'Stripes', tex: canvasTex((g, s) => {
  const cols = [TEAL, CREAM, RED, '#0E1A18', CREAM];
  g.save(); g.translate(s / 2, s / 2); g.rotate(-Math.PI / 4); g.translate(-s, -s);
  const w = s / 10;
  for (let i = 0; i < 40; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * w, 0, w, s * 2); }
  g.restore();
}) });
textures.register({ id: 'aurora', name: 'Aurora', tex: canvasTex((g, s) => {
  const gr = g.createLinearGradient(0, s, s, 0);
  gr.addColorStop(0, '#034F46'); gr.addColorStop(0.35, '#2BD49A');
  gr.addColorStop(0.65, '#FFFFEB'); gr.addColorStop(1, '#FF7A6E');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = s * (0.15 + Math.random() * 0.25);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${0.12 + Math.random() * 0.18})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
  }
}) });
textures.register({ id: 'grid', name: 'Grid', tex: canvasTex((g, s) => {
  g.fillStyle = '#05080A'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * s;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
  }
  g.fillStyle = RED;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    g.beginPath(); g.arc(i / n * s, j / n * s, 3, 0, Math.PI * 2); g.fill();
  }
}) });
textures.register({ id: 'image', name: 'Image', tex: null, disabled: true });
