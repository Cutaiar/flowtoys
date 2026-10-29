// save a still, where the viewer allows downloads
export function initExport(stage, state) {
  (async () => {
    const dl = await window.claude?.use?.('downloads');
    if (!dl) return;
    const b = document.getElementById('save');
    b.hidden = false;
    b.addEventListener('click', () => {
      stage.draw();
      stage.canvas.toBlob(async (blob) => {
        if (!blob) return;
        try { await dl.save({ filename: `flowtoys-${state.source}-${state.look}.png`, data: blob }); }
        catch (e) { if (e?.code === 'unavailable' || e?.code === 'not_granted') b.hidden = true; }
      }, 'image/png');
    });
  })();
}
