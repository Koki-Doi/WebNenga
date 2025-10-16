// 画像まわり（HEIF→JPEG/EXIF向き/圧縮/トリミング適用）を分離
import { showToast, showBusy, hideBusy, setBusy } from './utils.js';
import { uploadBgWebP } from './storage.js';

export const OUT_H = 1700;
export const OUT_W = Math.round(OUT_H * (100/148));

/* ===== DataURL helpers ===== */
export function dataURLBytes(dataURL){
  const i = dataURL.indexOf(',');
  const b64 = i >= 0 ? dataURL.slice(i+1) : dataURL;
  const len = b64.length;
  const pad = (b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0));
  return Math.floor(len * 3/4) - pad;
}
export function dataURLToBlob(dataURL){
  const [h, b64] = dataURL.split(',');
  const mime = (/data:([^;]+);/i.exec(h)?.[1]) || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
export function waitImageLoaded(img){
  return new Promise((res, rej)=>{
    if (img.complete && img.naturalWidth) res();
    else { img.onload = res; img.onerror = rej; }
  });
}

/* ===== HEIF/EXIF ===== */
export function isHeifFile(file){
  if (!file) return false;
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.includes('image/heic') || t.includes('image/heif') || /\.(heic|heif)$/.test(n);
}
function loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    if (document.querySelector(`script[data-heic2any="${src}"]`) || window.heic2any){
      resolve(); return;
    }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true; s.dataset.heic2any = src;
    s.onload = ()=>resolve(); s.onerror = reject; document.head.appendChild(s);
  });
}
export async function convertHeifToBlob(file){
  if (!window.heic2any) {
    await loadScriptOnce('https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js');
  }
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return new File([out], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() });
}
export async function normalizeForIOS(file, maxLong = 4096) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxLong / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width  * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
  return URL.createObjectURL(blob);
}

/* ===== 圧縮 ===== */
function resizeCanvas(srcCanvas, maxW, maxH){
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const r = Math.min(maxW / sw, maxH / sh, 1);
  if (r >= 1) return srcCanvas;
  const tw = Math.max(1, Math.round(sw * r));
  const th = Math.max(1, Math.round(sh * r));
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, tw, th);
  return c;
}
/** 2MB未満を保証して dataURL を返す */
export function encodeImageMax(canvas, opts = {}){
  const {
    maxKB=1900, startQ=0.78, minQ=0.35, stepQ=0.06,
    longStart=Math.max(canvas.width, canvas.height),
    minLong=1000, shrinkRate=0.9
  } = opts;
  const toData = (cv, q) => {
    let url = cv.toDataURL('image/webp', q);
    if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/jpeg', q);
    return url;
  };
  const maxBytes = maxKB * 1024;
  let work = resizeCanvas(canvas, longStart, longStart);
  let q = startQ;
  let url = toData(work, q);
  let bytes = dataURLBytes(url);
  if (bytes <= maxBytes) return url;

  while (bytes > maxBytes && q - stepQ >= minQ){
    q = Math.max(minQ, q - stepQ);
    url = toData(work, q); bytes = dataURLBytes(url);
  }
  if (bytes <= maxBytes) return url;

  while (bytes > maxBytes){
    const long = Math.max(work.width, work.height);
    if (long <= minLong){ url = toData(work, minQ); break; }
    const nextLong = Math.max(minLong, Math.round(long * shrinkRate));
    work = resizeCanvas(work, nextLong, nextLong);
    q = Math.min(0.72, Math.max(minQ, q + 0.03));
    url = toData(work, q); bytes = dataURLBytes(url);
    while (bytes > maxBytes && q - stepQ >= minQ){
      q = Math.max(minQ, q - stepQ);
      url = toData(work, q); bytes = dataURLBytes(url);
    }
  }
  return url;
}

/* ===== トリミング → 即時プレビュー(BlobURL) → アップロード(URL置換) ===== */
export async function applyCroppedAndUpload({ cropper, greetingEl, getShortId }){
  if (!cropper) return { previewObjUrl:null, dataUrl:null, publicUrl:null };

  const cRaw = cropper.getCroppedCanvas({
    width: OUT_W, height: OUT_H, imageSmoothingQuality: 'high'
  });

  const dataURL = encodeImageMax(cRaw, {
    maxKB: 1900, startQ: 0.78, minQ: 0.35, stepQ: 0.06,
    longStart: Math.max(OUT_W, OUT_H), minLong: 1000, shrinkRate: 0.9
  });

  // ① すぐに BlobURL を背景へ（iOS の dataURL 制限回避）
  const objUrl = URL.createObjectURL(dataURLToBlob(dataURL));
  greetingEl.style.setProperty('--bg-image', `url("${objUrl}")`);

  // ② Supabase へアップロードして公開URLに差し替え
  let publicUrl = null;
  try{
    showBusy('背景をアップロード中…'); setBusy(true);
    const shortId = await getShortId();
    publicUrl = await uploadBgWebP(dataURL, shortId);
    greetingEl.style.setProperty('--bg-image', `url("${publicUrl}")`);
    showToast('背景をアップロードしてURLを更新しました');
  } finally { hideBusy(); setBusy(false); }

  return { previewObjUrl: objUrl, dataUrl: dataURL, publicUrl };
}
