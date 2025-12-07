// js/print.js
// カードを画像化して印刷する（裏面=挨拶面、表面=宛名面）
const GREETING_SELECTOR = '.greeting-side';
const ADDRESS_SELECTOR = '.address-side';
const ADDRESS_HIDE_SELECTORS = ['.stamp', '.postal-code'];

let html2canvasLoader = null;
function loadHtml2Canvas() {
  if (!html2canvasLoader) {
    html2canvasLoader = import('./html2canvas.esm.js').then((mod) => mod.default || mod);
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
        lines.push(c);
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

async function captureElement(el, { hideSelectors = [], beforeCapture } = {}) {
  if (!el) throw new Error('印刷対象のカードが見つかりません');

  const root = document.documentElement;
  const addedSnapshotClass = !root.classList.contains('h2c-snapshot');
  if (addedSnapshotClass) root.classList.add('h2c-snapshot');

  const restoreHide = hideSelectors.length ? hideTemporarily(hideSelectors) : () => {};
  const restoreBefore = beforeCapture ? beforeCapture() : () => {};

  const html2canvas = await loadHtml2Canvas();
  // ハガキ実寸（100x148mm相当）で固定キャプチャし、印刷時の余白をなくす
  const targetWidth = 600;
  const targetHeight = 888; // 600 * 1.48
  const scale = Math.min(3, Math.max(1, (window.devicePixelRatio || 1)));

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
        scale,
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

export function initPrint() {
  const btn = document.getElementById('btn-print');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      alert('ポップアップがブロックされています。許可してください。');
      return;
    }
    popup.document.write('<!doctype html><title>Generating…</title><body style="margin:0;display:flex;align-items:center;justify-content:center;font-family:sans-serif;">生成中…</body>');
    popup.document.close();

    printAsImage(popup).catch((err) => {
      console.error('印刷用画像の生成に失敗しました', err);
      try { popup.close(); } catch (_) {}
      alert('印刷用画像の生成に失敗しました。ポップアップの許可やネットワーク状態をご確認ください。');
    });
  });
}
