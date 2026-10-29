// Renderer, scene, camera, controls — plus the glass look's backdrop plane.
// One draw() is the only render call: the frame loop and every export go
// through it. The post chain (bloom composer, look-change crossfade) lives
// here too, so it applies to every draw and to recordings.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { U, FIXED } from './glsl.js';
import { canvasTex, TEAL, looks } from './looks.js';
import { state, remember, subscribe } from './state.js';
import { panels } from './ui.js';

export function initStage(canvas, stageEl, errEl) {
  let renderer;
  try {
    // alpha: true so export can render a transparent still (clear alpha 0)
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    errEl.textContent = 'This browser could not start WebGL, so the subject cannot be drawn here.';
    errEl.hidden = false;
    throw e;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  U.uDpr.value = renderer.getPixelRatio();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 9);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 30;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 4, 5);
  scene.add(key);

  const pivot = new THREE.Group();   // the turn
  scene.add(pivot);

  // the glass look's backdrop: something for the refraction to bend
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 24),
    new THREE.MeshBasicMaterial({ map: canvasTex((g, s) => {
      g.fillStyle = TEAL; g.fillRect(0, 0, s, s);
      const w = s / 16;
      for (let i = 0; i < 16; i += 2) { g.fillStyle = i % 4 ? '#0A6B5F' : '#E9F5C9'; g.fillRect(i * w, 0, w * 0.5, s); }
    }, 1024), toneMapped: false }),
  );
  backdrop.material.map.repeat.set(3, 1);
  backdrop.position.z = -4;
  scene.add(backdrop);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------ glow
  // The composer is built lazily and only used while the glow slider is
  // above zero, so the default looks render exactly as before.
  let composer = null, bloom = null;
  function ensureComposer() {
    if (composer) return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0.4, 0.62);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(stageEl.clientWidth, stageEl.clientHeight);
  }

  // the Glow slider mounts inside the Look section; each look's glow field
  // is its default, applied when the look is picked
  const glowLabel = document.createElement('div');
  glowLabel.className = 'label';
  glowLabel.id = 'l-glow';
  const glowOut = document.createElement('output');
  glowLabel.append('Glow ', glowOut);
  const glowEl = document.createElement('input');
  glowEl.type = 'range'; glowEl.id = 'glow';
  glowEl.min = 0; glowEl.max = 2; glowEl.step = 0.01;
  panels.get('sec-look')?.append(glowLabel, glowEl);
  function setGlow(v, persist = true) {
    state.glow = v;
    glowEl.value = v;
    glowOut.textContent = (+v).toFixed(2);
    if (persist) remember();
  }
  glowEl.addEventListener('input', () => setGlow(+glowEl.value));
  // apply the look's default only when the look actually changes — the
  // startup pick re-emits the persisted id, and must not clobber a saved glow
  let lastLook = state.look;
  subscribe('look', (id) => {
    if (id === lastLook) return;
    lastLook = id;
    setGlow(looks.get(id)?.glow ?? 0);
  });
  setGlow(state.glow ?? looks.get(state.look)?.glow ?? 0, false);

  // ------------------------------------------------------------ crossfade
  // xfade() re-renders the outgoing frame and copies it into a texture;
  // draw() then overlays that texture on the next frames, fading out over
  // ~0.6 s. The overlay writes raw shader output — the copied pixels are
  // already colour-space encoded, so no colourspace include.
  let fbTex = null, fadeStart = -1, xfadeLock = false;
  const FADE_MS = 600;
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { tPrev: { value: null }, uFade: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tPrev; uniform float uFade; uniform vec2 uSize;
      void main() { gl_FragColor = vec4(texture2D(tPrev, gl_FragCoord.xy / uSize).rgb, uFade); }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  quadScene.children[0].frustumCulled = false;

  function xfade() {
    if (reduced.matches || xfadeLock) return;
    renderer.render(scene, camera);   // the outgoing look, still bound
    if (fbTex) {
      renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), fbTex);
      quadMat.uniforms.tPrev.value = fbTex;
      fadeStart = performance.now();
      xfadeLock = true;   // applyLook's inner calls don't recapture
    }
  }

  function draw() {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - draw.t) / 1000)); draw.t = now;

    // uLevel: the mean bar gain, whatever the motion source (1 at rest)
    const n = Math.min(subject?.pills ?? 0, FIXED);
    if (n > 0) {
      let s = 0;
      for (let i = 0; i < n; i++) s += U.uGain.value[i];
      U.uLevel.value = s / n;
    } else {
      U.uLevel.value = 1;
    }
    // Float turn mode: ease the bob in when picked, out when left
    const ft = state.spin === 'float' && !reduced.matches ? 1 : 0;
    U.uFloat.value += (ft - U.uFloat.value) * Math.min(1, dt * 3.5);

    if (state.glow > 0) {
      ensureComposer();
      bloom.strength = state.glow;
      composer.render();
    } else {
      renderer.render(scene, camera);
    }

    if (fadeStart >= 0) {
      const p = (now - fadeStart) / FADE_MS;
      if (p >= 1) fadeStart = -1;
      else {
        quadMat.uniforms.uFade.value = 1 - p;
        renderer.autoClear = false;
        renderer.render(quadScene, quadCam);
        renderer.autoClear = true;
      }
    }
    xfadeLock = false;
  }
  draw.t = 0;

  // fit the camera to the built subject
  let subject = null;
  function fit(s) {
    subject = s;
    const [w, h] = s.size;
    const aspect = stageEl.clientWidth / Math.max(stageEl.clientHeight, 1);
    const fit = Math.max(h, w / aspect) * 1.5;
    const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.setLength(Math.max(dist, 4));
    controls.target.set(0, 0, 0);
  }

  function resize(s) {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (fbTex) fbTex.dispose();
    fbTex = new THREE.FramebufferTexture(size.x, size.y);
    quadMat.uniforms.uSize.value.copy(size);
    if (s) fit(s);
  }

  return { canvas, stageEl, renderer, scene, camera, controls, pivot, backdrop, draw, fit, resize, xfade };
}
