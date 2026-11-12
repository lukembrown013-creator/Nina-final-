// Barcode scanning for the Food tab. iOS Safari has no built-in camera barcode API, so this
// uses a small WASM decoder that ships with the app (loaded on first use). If the camera or
// the decoder are not available, typing the number in always works.
import { $, esc } from './util.js';
import { actions, submits, closeSheet, openSheet, toast, buzz, icon } from './ui.js';

// The decoder files live in /vendor/barcode so scanning never depends on an outside server.
let detectorPromise = null;
function getDetector() {
  if (!detectorPromise) {
    detectorPromise = import('../vendor/barcode/ponyfill.js').then(m => {
      const wasm = new URL('../vendor/barcode/zxing_reader.wasm', import.meta.url).href;
      m.setZXingModuleOverrides({ locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm : prefix + path) });
      return new m.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    }).catch(e => { detectorPromise = null; throw e; });
  }
  return detectorPromise;
}

let stream = null, raf = null, live = false, resultCb = null;

function renderOverlay() {
  $('#scan').innerHTML = `<div class="scan-head"><button class="icon-btn" data-action="scan-close" aria-label="Close scanner">${icon.x}</button>
<span class="sub">Line up the barcode in the box</span>
<span style="width:44px"></span></div>
<video id="scan-video" autoplay playsinline muted></video>
<div class="scan-frame"></div>
<div class="scan-foot"><span class="muted small">Can't scan it?</span><button class="btn ghost sm" data-action="scan-manual">Type the barcode instead</button></div>`;
}

// onCode(code, errorMessage): called exactly once. code is a string on success; on cancel
// or failure, code is null and errorMessage is set only for an actual failure (not a plain cancel).
export async function openScanner(onCode) {
  resultCb = onCode;
  const el = $('#scan'); el.hidden = false;
  renderOverlay();
  let detector;
  try {
    [stream, detector] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }),
      getDetector()
    ]);
  } catch (e) {
    const msg = e && e.name === 'NotAllowedError' ? 'Camera access was not allowed.' : "Couldn't start the scanner. Type the number under the barcode instead.";
    closeScanner(); toast(msg); openManualEntry(); return; // fall back to typing it in, rather than a dead end
  }
  const video = $('#scan-video');
  if (!video) { closeScanner(); return; } // closed while starting up
  video.srcObject = stream;
  await video.play().catch(() => {});
  live = true;
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = 0, hits = {};
  const loop = async now => {
    if (!live) return;
    if (video.readyState >= 2 && video.videoWidth && now - last > 120) {
      last = now;
      // Look at the middle band of the picture (where the box is), scaled down for speed.
      const vw = video.videoWidth, vh = video.videoHeight, sh = Math.round(vh * 0.5), sy = Math.round((vh - sh) / 2);
      const scale = Math.min(1, 1000 / vw);
      canvas.width = Math.round(vw * scale); canvas.height = Math.round(sh * scale);
      ctx.drawImage(video, 0, sy, vw, sh, 0, 0, canvas.width, canvas.height);
      try {
        const codes = await detector.detect(canvas);
        const code = codes.length && live ? String(codes[0].rawValue || '') : '';
        // Ask for the same digits twice in a row, which filters out the occasional misread.
        if (/^\d{6,14}$/.test(code)) {
          hits = { [code]: (hits[code] || 0) + 1 };
          if (hits[code] >= 2) { buzz(20); closeScanner(); finish(code, null); return; }
        }
      } catch { /* decode miss on this frame, try the next one */ }
    }
    if (live) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

export function closeScanner() {
  live = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  const el = $('#scan'); if (el) { el.hidden = true; el.innerHTML = ''; }
}
function finish(code, err) { const cb = resultCb; resultCb = null; if (cb) cb(code, err); }

function openManualEntry() {
  openSheet(`<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col"><div class="sheet-head"><h2 class="sheet-title">Enter barcode</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<form data-submit="scan-manual-go" class="col" style="gap:12px">
<label class="field"><span>Barcode number</span><input type="text" name="code" inputmode="numeric" placeholder="e.g. 00000000000" autocomplete="off" autofocus></label>
<button class="btn primary block" type="submit">Look up</button></form></div>`);
}
actions['scan-close'] = () => { closeScanner(); finish(null, null); };
actions['scan-manual'] = () => { closeScanner(); openManualEntry(); };
submits['scan-manual-go'] = v => {
  const code = String(v.code || '').replace(/\D/g, '');
  closeSheet();
  if (!code) return toast('Enter the numbers under the barcode');
  finish(code, null);
};
