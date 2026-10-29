// Renderer, scene, camera, controls — plus the glass look's backdrop plane.
// One draw() is the only render call: the frame loop and every export go
// through it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { U } from './glsl.js';
import { canvasTex, TEAL } from './looks.js';

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

  function draw() {
    renderer.render(scene, camera);
  }

  // fit the camera to the built subject
  function fit(subject) {
    const [w, h] = subject.size;
    const aspect = stageEl.clientWidth / Math.max(stageEl.clientHeight, 1);
    const fit = Math.max(h, w / aspect) * 1.5;
    const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.setLength(Math.max(dist, 4));
    controls.target.set(0, 0, 0);
  }

  function resize(subject) {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    if (subject) fit(subject);
  }

  return { canvas, stageEl, renderer, scene, camera, controls, pivot, backdrop, draw, fit, resize };
}
