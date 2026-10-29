// Stills and clips off the stage, plus the share row. saveFile() is the one
// way files leave the app: the artifact's downloads bridge when it exists,
// an <a download> when running standalone.
import { state } from './state.js';
import { hasAudioFile, isAudioFilePlaying, audioFileStream } from './audio.js';
import * as ui from './ui.js';
import { shareFieldValue } from './share.js';
import { LOOP_SECONDS } from './timing.js';

// Save a blob. In the artifact this goes through the downloads bridge
// (mp4, webm and png are on its allowlist); standalone it is an <a download>.
// A declined save is silent; anything else surfaces as an error.
export async function saveFile(blob, name) {
  const dl = await Promise.resolve(window.claude?.use?.('downloads')).catch(() => null);
  if (dl?.save) {
    try { await dl.save({ filename: name, data: blob }); return; }
    catch (e) {
      if (e?.code === 'unavailable' || e?.code === 'not_granted' || /declin|denied|cancel/i.test(e?.message || '')) return;
      ui.showError(e?.message || 'The file could not be saved.');
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const CLIP_TYPES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];
const clipType = () => (window.MediaRecorder ? CLIP_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) : null);

export function initExport(stage) {
  const sec = ui.panels.add({ id: 'export', title: 'Export & share', after: 'sec-ground' });

  // -- PNG -------------------------------------------------------------
  const sizeLabel = document.createElement('div');
  sizeLabel.className = 'label';
  sizeLabel.textContent = 'PNG';
  const sizeSeg = document.createElement('div');
  sizeSeg.className = 'seg';
  sizeSeg.id = 'exp-size';
  let pngScale = 2;
  for (const k of [1, 2, 4]) {
    const b = document.createElement('button');
    b.dataset.v = String(k);
    b.textContent = `${k}×`;
    b.setAttribute('aria-pressed', String(k === pngScale));
    b.addEventListener('click', () => {
      pngScale = k;
      sizeSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    sizeSeg.append(b);
  }
  const alphaBtn = document.createElement('button');
  alphaBtn.className = 'btn';
  alphaBtn.id = 'exp-alpha';
  alphaBtn.setAttribute('aria-pressed', 'false');
  alphaBtn.textContent = 'Transparent';
  let pngAlpha = false;
  alphaBtn.addEventListener('click', () => {
    pngAlpha = !pngAlpha;
    alphaBtn.setAttribute('aria-pressed', String(pngAlpha));
  });
  const alphaRow = document.createElement('div');
  alphaRow.className = 'row';
  alphaRow.append(alphaBtn);

  // the Save PNG button from the Ground section moves here
  const saveBtn = document.getElementById('save');
  const oldRow = saveBtn?.closest('.row');
  if (saveBtn) {
    saveBtn.hidden = false;
    saveBtn.addEventListener('click', () => savePng(stage, pngScale, pngAlpha));
  }
  const pngRow = document.createElement('div');
  pngRow.className = 'row';
  if (saveBtn) pngRow.append(saveBtn);
  if (oldRow && !oldRow.children.length) oldRow.remove();
  if (!oldRow) {
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = 'Save PNG';
    b.addEventListener('click', () => savePng(stage, pngScale, pngAlpha));
    pngRow.append(b);
  }

  // -- clip ------------------------------------------------------------
  const clipLabel = document.createElement('div');
  clipLabel.className = 'label';
  clipLabel.textContent = 'Clip';
  const lenSeg = document.createElement('div');
  lenSeg.className = 'seg';
  lenSeg.id = 'exp-len';
  let clipLen = 4;
  for (const [s, name] of [[4, '4 s'], [LOOP_SECONDS, `${LOOP_SECONDS} s loop`]]) {
    const b = document.createElement('button');
    b.dataset.v = String(s);
    b.textContent = name;
    b.setAttribute('aria-pressed', String(s === clipLen));
    b.addEventListener('click', () => {
      clipLen = s;
      lenSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    lenSeg.append(b);
  }
  const recBtn = document.createElement('button');
  recBtn.className = 'btn primary';
  recBtn.id = 'exp-rec';
  recBtn.textContent = 'Record clip';
  if (!clipType()) { recBtn.disabled = true; recBtn.textContent = 'No recorder'; }

  const badge = document.createElement('div');
  badge.style.cssText =
    'position:absolute;top:12px;right:14px;display:none;align-items:center;gap:7px;' +
    'padding:7px 10px;border-radius:6px;background:rgba(0,0,0,.5);color:#fff;' +
    'font:600 11px/1 var(--font-data);letter-spacing:.05em;pointer-events:none;' +
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-variant-numeric:tabular-nums;';
  badge.innerHTML =
    '<span style="width:8px;height:8px;border-radius:50%;background:#FF4842;box-shadow:0 0 6px #FF4842"></span><span></span>';
  stage.stageEl.append(badge);
  recBtn.addEventListener('click', () => toggleRec(stage, clipLen, recBtn, badge));

  const clipRow = document.createElement('div');
  clipRow.className = 'row';
  clipRow.append(recBtn);

  // -- share -----------------------------------------------------------
  const shareLabel = document.createElement('div');
  shareLabel.className = 'label';
  shareLabel.textContent = 'Share';
  const shareRow = document.createElement('div');
  shareRow.className = 'row';
  const field = document.createElement('input');
  field.id = 'shr-field';
  field.readOnly = true;
  field.style.cssText =
    'flex:1;min-width:0;font:12px/1.2 var(--font-data);color:var(--fg);' +
    'background:var(--chip);border:1px solid var(--line);border-radius:8px;padding:8px 10px;';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.id = 'shr-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } catch {
      field.focus(); field.select();   // clipboard blocked: select it for a manual copy
    }
  });
  shareRow.append(field, copyBtn);
  const shareNote = document.createElement('p');
  shareNote.className = 'note';
  shareNote.id = 'shr-note';
  shareRow.append(shareNote);

  sec.append(
    sizeLabel, sizeSeg, alphaRow, pngRow,
    clipLabel, lenSeg, clipRow,
    shareLabel, shareRow,
  );

  const syncField = () => {
    const v = shareFieldValue();
    if (field.value !== v) field.value = v;
    shareNote.textContent = window.top !== window
      ? 'Pasted into another Flowtoys, this code restores these settings.'
      : 'The link follows your settings; paste a link or code anywhere to apply it.';
  };
  syncField();
  setInterval(syncField, 500);
}

function savePng(stage, scale, transparent) {
  const { renderer, scene, stageEl } = stage;
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  const max = renderer.capabilities.maxTextureSize || 4096;
  const k = Math.max(0.25, Math.min(scale, max / w, max / h));
  if (k < scale) ui.showError(`The GPU caps stills at ${Math.floor(k * 100) / 100}× here.`);

  const prevRatio = renderer.getPixelRatio();
  const prevBg = scene.background;
  const prevAlpha = renderer.getClearAlpha();
  const prevBackdrop = stage.backdrop.visible;

  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(w * k), Math.round(h * k), false);
  if (transparent) {
    // alpha:true on the renderer lets the clear show through; draw(direct)
    // skips the bloom composer and any in-flight crossfade for this pass
    scene.background = null;
    renderer.setClearAlpha(0);
    stage.backdrop.visible = false;
  }
  stage.draw(transparent);
  stage.canvas.toBlob((blob) => {
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(w, h, false);
    scene.background = prevBg;
    renderer.setClearAlpha(prevAlpha);
    stage.backdrop.visible = prevBackdrop;
    stage.draw();
    if (!blob) { ui.showError('The PNG could not be rendered.'); return; }
    saveFile(blob, `flowtoys-${state.source}-${state.look}${transparent ? '-alpha' : ''}.png`);
  }, 'image/png');
}

// ------------------------------------------------------------ recording
let rec = null;   // { recorder, stream, timer, badge }

function toggleRec(stage, len, btn, badge) {
  if (rec) { stopRec(); return; }
  const mime = clipType();
  if (!mime) { ui.showError('This browser cannot record video.'); return; }

  const stream = stage.canvas.captureStream(30);
  // fold the audio file's track into the clip when it is the motion source
  if (state.audio === 'file' && hasAudioFile() && isAudioFilePlaying()) {
    const as = audioFileStream();
    // clone the track: the shared destination's track must survive stopRec,
    // which stops every track on this stream — a stopped track can't restart
    if (as) for (const t of as.getAudioTracks()) stream.addTrack(t.clone());
  }
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    for (const t of stream.getTracks()) t.stop();
    const type = mime.split(';')[0];
    saveFile(new Blob(chunks, { type }),
      `flowtoys-${state.source}-${state.look}-${len}s.${type === 'video/mp4' ? 'mp4' : 'webm'}`);
  };
  recorder.start(250);
  rec = { recorder, stream };

  const t0 = performance.now();
  const iv = setInterval(() => {
    const left = len - (performance.now() - t0) / 1000;
    badge.lastElementChild.textContent = `REC ${Math.max(0, left).toFixed(1)}s`;
    if (left <= 0) stopRec();
  }, 100);
  badge.style.display = 'flex';
  badge.lastElementChild.textContent = `REC ${len.toFixed(1)}s`;
  rec.iv = iv; rec.btn = btn; rec.badge = badge;
  btn.textContent = 'Stop';
}

function stopRec() {
  if (!rec) return;
  clearInterval(rec.iv);
  rec.recorder.stop();
  rec.badge.style.display = 'none';
  rec.btn.textContent = 'Record clip';
  rec = null;
}
