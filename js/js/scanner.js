// js/scanner.js
// Yalnızca arka kamera + kılavuz içinden okuma + debounce
let mediaStream = null;
let scanning = false;
let singleShot = false;
let lastCode = null;
let lastTime = 0;
let rafId = null;

let onScan = async (_code)=>{};           // dışarıdan verilecek callback
export function setOnScan(cb){ onScan = cb; }

const $video = () => document.getElementById('video');
const $guide = () => document.getElementById('guide');
const $fps = () => document.getElementById('fpsBadge');
const FRAME_INTERVAL = 120; // ms
const DUP_INTERVAL = 2000;  // aynı kodu tekrar kabul etmeme süresi

let detector = null;
let zxingReader = null;

export async function startCamera({ once=false } = {}) {
  stopCamera();
  singleShot = !!once;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    $video().srcObject = mediaStream;
    await $video().play();
    scanning = true;
    lastCode = null;
    lastTime = 0;

    if ('BarcodeDetector' in window) {
      const formats = ['ean_13','ean_8','upc_a','upc_e','qr_code','code_128','code_39','pdf417','data_matrix'];
      detector = new window.BarcodeDetector({ formats });
    } else {
      zxingReader = new ZXing.BrowserMultiFormatReader();
    }

    loop();
  } catch (err) {
    console.error(err);
    alert('Kamera açılamadı. Lütfen izin verdiğinden emin ol.');
  }
}

export function stopCamera() {
  scanning = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}

async function loop() {
  const video = $video();
  const guide = $guide();

  let prev = performance.now();
  const run = async () => {
    if (!scanning) return;

    const now = performance.now();
    const dt = now - prev;
    if (dt >= FRAME_INTERVAL) {
      prev = now;
      $fps().textContent = `FPS: ${Math.round(1000 / Math.max(dt,1))}`;

      try {
        const code = await detectInGuide(video, guide);
        if (code && /^\d+$/.test(code)) {
          const t = Date.now();
          if (code !== lastCode || (t - lastTime) > DUP_INTERVAL) {
            lastCode = code; lastTime = t;
            await onScan(code);
            if (singleShot) { stopCamera(); return; }
          }
        }
      } catch (e) { /* yut */ }
    }
    rafId = requestAnimationFrame(run);
  };
  rafId = requestAnimationFrame(run);
}

async function detectInGuide(video, guide) {
  const rect = guide.getBoundingClientRect();
  const vrect = video.getBoundingClientRect();

  const sx = (rect.left - vrect.left) / vrect.width * video.videoWidth;
  const sy = (rect.top - vrect.top) / vrect.height * video.videoHeight;
  const sw = rect.width / vrect.width * video.videoWidth;
  const sh = rect.height / vrect.height * video.videoHeight;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(sw));
  canvas.height = Math.max(1, Math.floor(sh));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (detector) {
    const bitmap = await createImageBitmap(canvas);
    const codes = await detector.detect(bitmap);
    if (codes && codes.length) {
      const best = codes.find(c => /^\d+$/.test(c.rawValue)) || codes[0];
      return best.rawValue;
    }
    return null;
  }

  if (zxingReader) {
    try {
      // ZXing UMD ile en sağlıklısı: video elementinden decode (crop olmadan)
      const result = await zxingReader.decodeOnceFromVideoElement($video());
      return result?.text || null;
    } catch(_) { return null; }
  }

  return null;
}
