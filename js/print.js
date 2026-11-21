import { escapeHtml } from './utils.js';
import { trackPage } from './card-analytics.js';
// js/print.js
// カードを画像化して印刷する（裏面=挨拶面、表面=宛名面）
const GREETING_SELECTOR = '.greeting-side';
const ADDRESS_SELECTOR = '.address-side';
const ADDRESS_HIDE_SELECTORS = ['.stamp', '.postal-code', '.tap-hint', '.tap-hint__text'];

let html2canvasLoader = null;
function loadHtml2Canvas() {
  if (!html2canvasLoader) {
    html2canvasLoader = import('./html2canvas.esm.js').then((mod) => mod.default || mod).catch((error) => {
      html2canvasLoader = null;
      throw error;
    });
  }
  return html2canvasLoader;
}

function withTempStyles(nodes, styles, fn) {
  const restore = [];
  nodes.forEach((node) => {
    if (!node) return;
    const prev = {};
    Object.entries(styles).forEach(([k, v]) => {
      prev[k] = node.style[k];
      node.style[k] = v;
    });
    restore.push(() => {
      Object.entries(styles).forEach(([k]) => { node.style[k] = prev[k]; });
    });
  });
  return async () => {
    try { return await fn(); } finally { restore.reverse().forEach((r) => r()); }
  };
}

function hideTemporarily(selectors) {
  const elements = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
  const restore = elements.map((el) => {
    const prev = { display: el.style.display, visibility: el.style.visibility };
    el.style.display = 'none';
    el.style.visibility = 'hidden';
    return () => { el.style.display = prev.display; el.style.visibility = prev.visibility; };
  });
  return () => restore.reverse().forEach((r) => r());
}

function normalizeGreetingBackground() {
  const targets = Array.from(document.querySelectorAll('.greeting-message, .print-greeting-body'));
  const restore = targets.map((el) => {
    const prev = {
      background: el.style.background,
      boxShadow: el.style.boxShadow,
      backdropFilter: el.style.backdropFilter,
      WebkitBackdropFilter: el.style.WebkitBackdropFilter,
      filter: el.style.filter,
      opacity: el.style.opacity,
    };
    // PCで灰色レイヤが乗るのを防ぐため、背景を純白に固定しフィルタ系を無効化
    el.style.background = '#ffffff';
    el.style.boxShadow = 'none';
    el.style.backdropFilter = 'none';
    el.style.WebkitBackdropFilter = 'none';
    el.style.filter = 'none';
    el.style.opacity = '1';
    return () => {
      el.style.background = prev.background;
      el.style.boxShadow = prev.boxShadow;
      el.style.backdropFilter = prev.backdropFilter;
      el.style.WebkitBackdropFilter = prev.WebkitBackdropFilter;
      el.style.filter = prev.filter;
      el.style.opacity = prev.opacity;
    };
  });
  return () => restore.reverse().forEach((r) => r());
}

// writing-modeを使わず、横書き+<br>で縦並びを作る。スペースは空行を1つ追加。
function verticalizeElements(selectors) {
  const targets = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
  const restore = [];
  targets.forEach((el) => {
    const originalHTML = el.innerHTML;
    const text = el.textContent || '';
    const lines = [];
    Array.from(text).forEach((c) => {
      if (c === ' ' || c === '　' || /\s/.test(c)) {
        lines.push('&nbsp;');
        lines.push('&nbsp;'); // 空行
      } else {
        lines.push(escapeHtml(c));
      }
    });
    const prevStyle = {
      display: el.style.display,
      whiteSpace: el.style.whiteSpace,
      letterSpacing: el.style.letterSpacing,
      lineHeight: el.style.lineHeight,
      textAlign: el.style.textAlign,
      writingMode: el.style.writingMode,
      textOrientation: el.style.textOrientation,
    };
    el.innerHTML = lines.join('<br>');
    el.style.display = 'block';
    el.style.whiteSpace = 'nowrap';
    el.style.letterSpacing = '-0.1em';
    el.style.lineHeight = '1.05';
    el.style.textAlign = 'center';
    el.style.writingMode = 'horizontal-tb';
    el.style.textOrientation = 'initial';
    restore.push(() => {
      el.innerHTML = originalHTML;
      Object.assign(el.style, prevStyle);
    });
  });
  return () => restore.reverse().forEach((r) => r());
}

async function captureElement(el, { hideSelectors = [], beforeCapture, width, height, scale } = {}) {
  if (!el) throw new Error('印刷対象のカードが見つかりません');
  // ライブラリの読込失敗時にカードをキャプチャ用表示のまま残さない。
  const html2canvas = await loadHtml2Canvas();

  const root = document.documentElement;
  const addedSnapshotClass = !root.classList.contains('h2c-snapshot');
  if (addedSnapshotClass) root.classList.add('h2c-snapshot');

  const restoreHide = hideSelectors.length ? hideTemporarily(hideSelectors) : () => {};
  const restoreBefore = beforeCapture ? beforeCapture() : () => {};

  // 既定はハガキ実寸（100x148mm相当）で固定キャプチャし、印刷時の余白をなくす
  const targetWidth = width ?? 600;
  const targetHeight = height ?? 888; // 600 * 1.48
  const targetScale = scale ?? Math.min(3, Math.max(1, (window.devicePixelRatio || 1)));

  const run = await withTempStyles(
    [el],
    {
      width: `${targetWidth}px`,
      height: `${targetHeight}px`,
      transform: 'none',
      position: 'static',
      inset: 'auto',
    },
    async () => {
      const canvas = await html2canvas(el, {
        backgroundColor: '#fff',
        scale: targetScale,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });
      return canvas.toDataURL('image/png');
    }
  );

  try {
    return await run();
  } finally {
    restoreBefore();
    restoreHide();
    if (addedSnapshotClass) root.classList.remove('h2c-snapshot');
  }
}

function openPrintWindow(targetWindow, dataUrls) {
  const w = targetWindow || window.open('', '_blank');
  if (!w) throw new Error('ポップアップがブロックされています');

  const doc = w.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print</title>
        <style>
          @page { size: 100mm 148mm; margin: 0; }
          html, body { margin: 0; padding: 0; background: #fff; }
          .page {
            width: 100mm; height: 148mm;
            page-break-after: always;
            display: flex; align-items: center; justify-content: center;
          }
          .page:last-child { page-break-after: auto; }
          img { width: 100%; height: 100%; object-fit: contain; display: block; }
        </style>
      </head>
      <body>
        ${dataUrls.map((src) => `<div class="page"><img src="${src}" alt="print image" /></div>`).join('')}
      </body>
    </html>
  `);
  doc.close();
  w.focus();
  w.onload = () => w.print();
}

async function printAsImage(popup) {
  const greetingEl = document.querySelector(GREETING_SELECTOR);
  const addressEl = document.querySelector(ADDRESS_SELECTOR);
  const greetingImg = await captureElement(greetingEl, {
    beforeCapture: () => normalizeGreetingBackground(),
  });
  const addressImg = await captureElement(addressEl, {
    hideSelectors: ADDRESS_HIDE_SELECTORS,
    beforeCapture: () => verticalizeElements(['.address-main', '.sender']),
  });
  openPrintWindow(popup, [greetingImg, addressImg]);
}

// ---------- ガチャ演出用のカード画像 ----------
// 縦書きで字形が変わる文字。upright でも縦組み用の字形になるもの（長音・括弧類）は90°回し、
// 句読点は升目の右上、小書きの仮名は少し右上へ寄せて、縦組みの見え方に合わせる。
const VERTICAL_ROTATE = /[ー－—―〜～…‥（）「」『』【】［］｛｝〈〉《》〔〕＝]/;
const VERTICAL_CORNER = /[、。，．]/;
const VERTICAL_SMALL = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/;

// font-family を指定していない要素は「その言語の既定フォント」（日本語なら游ゴシックなど）で表示されるが、
// getComputedStyle は総称の既定名（Times New Roman など）しか返さない。それを canvas へ渡すと別の書体になる。
// 同じ文字列を画面（既定フォントを継ぐ測定用span）と canvas の両方で測り、幅が合う候補を選ぶ。
const DEFAULT_FONT_CANDIDATES = [
  'sans-serif', 'serif', 'system-ui',
  '"Yu Gothic UI"', '"Yu Gothic"', 'Meiryo', '"Meiryo UI"', '"BIZ UDPGothic"', '"MS PGothic"', '"MS Gothic"',
  '"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans CJK JP"', '"Noto Sans JP"',
  '"Yu Mincho"', '"Hiragino Mincho ProN"', '"MS PMincho"', '"Segoe UI"', 'Roboto', 'Arial',
];
const FONT_PROBE = 'Hamburgefonstiv 0123456789 あいうえおアイウエオ永国東、。□';
const defaultFamilies = new Map();
function resolveDefaultFamily({ g, face, toLocal }, font) {
  const key = `${font.family}|${font.weight}|${font.style}`;
  if (defaultFamilies.has(key)) return defaultFamilies.get(key);
  // 測定用spanは面の直下へ置く（絶対配置で、レイアウトにも本文の監視にも影響しない）
  const probe = document.createElement('span');
  probe.textContent = FONT_PROBE;
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;'
    + 'writing-mode:horizontal-tb;letter-spacing:0;font-size:100px;line-height:1;'
    + `font-weight:${font.weight};font-style:${font.style};font-family:inherit`;
  face.appendChild(probe);
  let best = font.family;
  try {
    const target = toLocal(probe.getBoundingClientRect()).w;
    let bestError = Infinity;
    for (const family of [font.family, ...DEFAULT_FONT_CANDIDATES]) {
      g.font = `${font.style} ${font.weight} 100px ${family}`;
      const error = Math.abs(g.measureText(FONT_PROBE).width - target) / target;
      if (error < bestError) { best = family; bestError = error; }
      if (error < .004) break;     // 先に並べた候補を優先（指定どおりで合うならそれを使う）
    }
  } finally {
    probe.remove();
  }
  defaultFamilies.set(key, best);
  return best;
}

// 画面の実レイアウトで1文字ずつ位置を測る（face の左上を原点とするCSS px）
function measureGlyphs(elements, context) {
  const { face, toLocal } = context;
  const glyphs = [];
  const range = document.createRange();
  const faceFamily = getComputedStyle(face).fontFamily;
  const rootFamily = getComputedStyle(document.documentElement).fontFamily;
  for (const el of elements.filter(Boolean)) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const style = getComputedStyle(node.parentElement);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const font = {
        style: style.fontStyle, weight: style.fontWeight,
        size: parseFloat(style.fontSize) || 16, family: style.fontFamily,
      };
      // どこにも font-family の指定が無い（ブラウザ既定のまま）なら、実際に使われている書体を調べる
      if (font.family === rootFamily && font.family === faceFamily) {
        font.family = `${resolveDefaultFamily(context, font)}, ${font.family}`;
      }
      const vertical = style.writingMode.startsWith('vertical');
      const spacing = parseFloat(style.letterSpacing) || 0;
      let offset = 0;
      for (const ch of node.data) {
        const start = offset;
        offset += ch.length;
        if (!ch.trim()) continue;                 // 空白（&nbsp; を含む）は描かない
        range.setStart(node, start);
        range.setEnd(node, offset);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        glyphs.push({ ch, ...toLocal(rect), vertical, spacing, font, color: style.color });
      }
    }
  }
  return glyphs;
}

function drawGlyphs(g, glyphs, scale) {
  g.save();
  for (const glyph of glyphs) {
    const size = glyph.font.size * scale;
    g.font = `${glyph.font.style} ${glyph.font.weight} ${size}px ${glyph.font.family}`;
    g.fillStyle = glyph.color;
    if (glyph.vertical) {
      // 字送りの末尾に付く字間ぶんを除き、升目の中心へ置く
      const cx = (glyph.x + glyph.w / 2) * scale;
      const cy = (glyph.y + (glyph.h - glyph.spacing) / 2) * scale;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (VERTICAL_ROTATE.test(glyph.ch)) {
        g.save(); g.translate(cx, cy); g.rotate(Math.PI / 2); g.fillText(glyph.ch, 0, 0); g.restore();
      } else if (VERTICAL_CORNER.test(glyph.ch)) g.fillText(glyph.ch, cx + size * .58, cy - size * .56);
      else if (VERTICAL_SMALL.test(glyph.ch)) g.fillText(glyph.ch, cx + size * .1, cy - size * .1);
      else g.fillText(glyph.ch, cx, cy);
    } else {
      // 横書きは行ボックス内のベースライン位置をフォントの実寸から求める
      const metrics = g.measureText(glyph.ch);
      const ascent = metrics.fontBoundingBoxAscent ?? size * .88;
      const descent = metrics.fontBoundingBoxDescent ?? size * .12;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText(glyph.ch, glyph.x * scale,
        glyph.y * scale + (glyph.h * scale - (ascent + descent)) / 2 + ascent);
    }
  }
  g.restore();
}

function cardCaptureSize(card, maxHeight = 1100) {
  // 傾き・反転中の見かけの矩形ではなく、元のレイアウト寸法を使う。
  const width = card?.offsetWidth || 600;
  const height = card?.offsetHeight || Math.round(width * 1.48);
  return { width, height, scale: Math.min(4, Math.max(1.2, maxHeight / height)) };
}

// カードを平らにした状態（傾き・反転の transform を外す）で face を測り、canvas へ描く共通手順。
// html2canvas は文書を複製して別枠で組み直すため、縦書き・cqh 単位・折り返しなどが画面と変わることがある。
// 画面の実レイアウトそのものを1文字ずつ測れば、改行位置も字の大きさも必ず画面と一致する。
function withFlatCard(selector, paint) {
  const face = document.querySelector(selector);
  const card = document.getElementById('card');
  if (!face || !card) throw new Error('年賀状の面が見つかりません');
  const root = document.documentElement;
  const addedSnapshotClass = !root.classList.contains('h2c-snapshot');
  const previousTransition = card.style.transition;
  const canvas = document.createElement('canvas');
  // 文字のフォールバック（□ や、Webフォントに無い字の字形）は canvas が属する文書の lang で決まる。
  // 文書へつないだ状態で描き、画面と同じ日本語フォントを選ばせる（つながないと欧文用の小さな □ になる）
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(canvas);
  if (addedSnapshotClass) root.classList.add('h2c-snapshot');
  card.style.transition = 'none';     // transition 中の途中の形を拾わない
  try {
    const { width, height, scale } = cardCaptureSize(card);
    const base = face.getBoundingClientRect();
    const ratio = base.width ? face.offsetWidth / base.width : 1;   // 祖先の拡縮を打ち消す
    const toLocal = (rect) => ({
      x: (rect.left - base.left) * ratio, y: (rect.top - base.top) * ratio,
      w: rect.width * ratio, h: rect.height * ratio,
    });
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const g = canvas.getContext('2d');
    if ('lang' in g) g.lang = document.documentElement.lang || 'ja';
    const paper = getComputedStyle(face).backgroundColor;
    g.fillStyle = isTransparent(paper) ? '#fff' : paper;
    g.fillRect(0, 0, canvas.width, canvas.height);
    paint({ face, g, scale, width, height, toLocal });
    return canvas;
  } finally {
    canvas.remove();
    canvas.style.cssText = '';
    card.style.transition = previousTransition;
    if (addedSnapshotClass) root.classList.remove('h2c-snapshot');
  }
}
const isTransparent = (color) => !color || color === 'transparent' || /,\s*0\)$/.test(color);
const isShown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

// 宛名面: 切手 + 郵便番号 + 宛名 + 差出人。同期で数ms
export function renderAddressFaceCanvas() {
  return withFlatCard(ADDRESS_SELECTOR, (context) => {
    const { face, g, scale, toLocal } = context;
    const stamp = face.querySelector('.stamp');
    if (isShown(stamp) && stamp.complete && stamp.naturalWidth) {
      const r = toLocal(stamp.getBoundingClientRect());
      g.drawImage(stamp, r.x * scale, r.y * scale, r.w * scale, r.h * scale);
    }
    const texts = ['.postal-code', '.address-main', '.sender'].map((selector) => face.querySelector(selector));
    drawGlyphs(g, measureGlyphs(texts, context), scale);
  });
}

// ---- 挨拶面 ----
// canvas を WebGL のテクスチャにするので、別オリジンの画像は CORS 付きで読み直す
// （CORS 非対応の画像は描けない。その場合は画像なしで続ける）
const drawableImages = new Map();
function loadDrawable(url) {
  if (!drawableImages.has(url)) {
    drawableImages.set(url, new Promise((resolve) => {
      const img = new Image();
      let sameOrigin = /^(data|blob):/.test(url);
      try { sameOrigin ||= new URL(url, location.href).origin === location.origin; } catch (e) { }
      if (!sameOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => { drawableImages.delete(url); resolve(null); };
      img.src = url;
    }));
  }
  return drawableImages.get(url);
}
function roundedRect(g, x, y, w, h, radius) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  else g.rect(x, y, w, h);
}
// 背景画像(cover + 位置ずらし) / 謹賀新年などの画像 / 題字 / 挨拶文のパネルと本文
export async function renderGreetingFaceCanvas() {
  const face = document.querySelector(GREETING_SELECTOR);
  if (!face) throw new Error('挨拶面が見つかりません');
  const faceStyle = getComputedStyle(face);
  const backgroundUrl = /url\(["']?(.*?)["']?\)/.exec(faceStyle.backgroundImage)?.[1];
  const photoEl = face.querySelector('.new-year-image');
  const photoUrl = isShown(photoEl) ? (photoEl.currentSrc || photoEl.src) : '';
  // 画像の読み込みだけを先に待ち、採寸と描画は1回の同期処理で行う（途中でレイアウトが動かないように）
  const [background, photo] = await Promise.all([
    backgroundUrl ? loadDrawable(backgroundUrl) : null,
    photoUrl ? loadDrawable(photoUrl) : null,
  ]);
  return withFlatCard(GREETING_SELECTOR, (context) => {
    const { g, scale, width, height, toLocal } = context;
    const style = getComputedStyle(face);
    if (background) {
      // background-size: cover / background-position: calc(50% + ずらし量)
      const fit = Math.max(width / background.naturalWidth, height / background.naturalHeight);
      const bw = background.naturalWidth * fit, bh = background.naturalHeight * fit;
      const at = (name) => (50 + (parseFloat(style.getPropertyValue(name)) || 0)) / 100;
      g.drawImage(background, (width - bw) * at('--bg-off-x') * scale, (height - bh) * at('--bg-off-y') * scale,
        bw * scale, bh * scale);
    }
    // 位置をずらすと画像と挨拶文が重なる。画面と同じ重なり順（z-index → 文書順）で描く
    const layers = [];
    const layer = (el, paint) => {
      if (!isShown(el)) return;
      layers.push({ z: parseInt(getComputedStyle(el).zIndex, 10) || 0, order: layers.length, paint });
    };
    const title = face.querySelector('h1');
    layer(title, () => drawGlyphs(g, measureGlyphs([title], context), scale));
    layer(photo && photoEl, () => {
      const r = toLocal(photoEl.getBoundingClientRect());
      const radius = parseFloat(getComputedStyle(photoEl).borderTopLeftRadius) || 0;
      g.save();
      roundedRect(g, r.x * scale, r.y * scale, r.w * scale, r.h * scale, radius * scale);
      g.clip();
      g.drawImage(photo, r.x * scale, r.y * scale, r.w * scale, r.h * scale);
      g.restore();
    });
    const message = face.querySelector('.greeting-message') || face.querySelector('p');
    layer(message, () => {
      const box = getComputedStyle(message);
      if (!isTransparent(box.backgroundColor)) {
        const r = toLocal(message.getBoundingClientRect());
        g.save();
        // box-shadow: 「色 x y ぼかし 広がり」の順で返る
        const shadow = /^(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(box.boxShadow);
        if (shadow) {
          g.shadowColor = shadow[1];
          g.shadowOffsetX = parseFloat(shadow[2]) * scale;
          g.shadowOffsetY = parseFloat(shadow[3]) * scale;
          g.shadowBlur = parseFloat(shadow[4]) * scale;
        }
        g.fillStyle = box.backgroundColor;
        roundedRect(g, r.x * scale, r.y * scale, r.w * scale, r.h * scale,
          (parseFloat(box.borderTopLeftRadius) || 0) * scale);
        g.fill();
        g.restore();
      }
      drawGlyphs(g, measureGlyphs([message], context), scale);
    });
    layers.sort((a, b) => a.z - b.z || a.order - b.order).forEach((entry) => entry.paint());
  });
}

export function initPrint() {
  const btn = document.getElementById('btn-print');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      trackPage('print_card', { result: 'popup_blocked' });
      alert('ポップアップがブロックされています。許可してください。');
      return;
    }
    popup.document.write('<!doctype html><title>Generating…</title><body style="margin:0;display:flex;align-items:center;justify-content:center;font-family:sans-serif;">生成中…</body>');
    popup.document.close();

    printAsImage(popup).then(() => {
      trackPage('print_card', { result: 'opened' });
    }).catch((err) => {
      trackPage('print_card', { result: 'failed' });
      console.error('印刷用画像の生成に失敗しました', err);
      try { popup.close(); } catch (_) {}
      alert('印刷用画像の生成に失敗しました。ポップアップの許可やネットワーク状態をご確認ください。');
    });
  });
}
