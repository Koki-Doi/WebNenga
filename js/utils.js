// js/utils.js

// ---- 文字列ユーティリティ ----
export function sanitize(v) {
  if (v == null) return '';
  // 制御/危険タグの簡易除去
  const s = String(v).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                     .replace(/<\/?(iframe|object|embed|style|link|meta)[^>]*>/gi, '');
  return s.trim();
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function htmlToPlain(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?[^>]+>/g, '')
    .trim();
}

export function plainToHtml(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

/** 宛名末尾の敬称を抽出（様/殿/君/御中）。なければ honor='' */
export function splitHonorific(full) {
  const s = (full || '').trim();
  const honors = ['様', '殿', '君', '御中'];
  for (const h of honors) {
    if (s.endsWith(h)) return { base: s.slice(0, -h.length).trim(), honor: h };
  }
  return { base: s, honor: '' };
}

// ---- UI ユーティリティ ----
export function showToast(msg, ms = 1600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(showToast._to);
  showToast._to = setTimeout(() => (t.style.display = 'none'), ms);
}

export function showBusy(text = '処理中です…') {
  const b = document.getElementById('busy');
  if (!b) return;
  b.setAttribute('aria-hidden', 'false');
  const txt = b.querySelector('.busy-text');
  if (txt) txt.textContent = text;
}

export function hideBusy() {
  const b = document.getElementById('busy');
  if (!b) return;
  b.setAttribute('aria-hidden', 'true');
}

export function setBusy(on) {
  document.documentElement.style.cursor = on ? 'progress' : 'auto';
}

export async function tryCopy(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // フォールバック
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  return ok;
}

// ---- ハッシュ/エンコード ----
/** Base64URL（= URL安全な Base64） */
function base64url(buf) {
  let b64 = typeof buf === 'string' ? btoa(buf) : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** 短いID: SHA-256(address|sender) → base64url → 先頭 len 文字 */
export async function hashIdShort(address, sender, len = 12) {
  const enc = new TextEncoder();
  const data = enc.encode(`a:${address}|s:${sender}`);
  if (crypto?.subtle?.digest) {
    const h = await crypto.subtle.digest('SHA-256', data);
    return base64url(h).slice(0, Math.max(6, len));
  }
  // フォールバック: 簡易ハッシュ
  let x = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i++) {
    x ^= data[i]; x = Math.imul(x, 16777619) >>> 0;
  }
  const hex = ('00000000' + x.toString(16)).slice(-8);
  return hex.slice(0, Math.max(6, len));
}

/** data を JSON→UTF-8→Base64URL で圧縮（簡易） */
export function encodeData(obj) {
  try {
    const json = JSON.stringify(obj);
    // 可能な限り短く：UTF-8 → Base64URL
    const bin = new TextEncoder().encode(json);
    // 短縮のために簡易 RLE/trim はせず、そのまま base64url へ
    let s = '';
    for (let i = 0; i < bin.length; i++) s += String.fromCharCode(bin[i]);
    return base64url(s);
  } catch (e) {
    console.warn('encodeData error', e);
    return '';
  }
}

/** encodeData の復号 */
export function decodeData(b64u) {
  try {
    // Base64URL → Base64
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(b64);
    const arr = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
    const json = new TextDecoder().decode(arr);
    return JSON.parse(json);
  } catch (e) {
    console.warn('decodeData error', e);
    return null;
  }
}

/** location.hash → {id, data} */
export function parseHash(hash) {
  if (!hash) return null;
  const h = hash.replace(/^#/, '');
  const q = new URLSearchParams(h);
  const id = q.get('id');
  const data = q.get('data');
  if (!id || !data) return null;
  return { id, data };
}

// ---- debounce（flush 対応）----
/**
 * debounce(fn, wait)：
 *  - 呼び出しを wait ms まとめる
 *  - debounced.flush() で最後の引数で即時実行
 */
export function debounce(fn, wait = 100) {
  let t = null;
  let lastArgs = null;
  let lastThis = null;

  const debounced = function (...args) {
    lastArgs = args;
    lastThis = this;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn.apply(lastThis, lastArgs);
    }, wait);
  };

  debounced.flush = function () {
    if (t) {
      clearTimeout(t);
      t = null;
      fn.apply(lastThis, lastArgs);
    }
  };

  return debounced;
}
