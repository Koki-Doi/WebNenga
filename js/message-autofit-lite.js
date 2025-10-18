// js/message-autofit-lite.js
// 目的:
//  - PCでの <br> 区切りをモバイルでも維持
//  - 重さの原因だった「毎回のDOM採寸/二分探索」を排除
// アプローチ:
//  - テキストが変わったときだけ "基準サイズ(BPX)" で 1回だけ実測
//  - 以後のリサイズは、幅比からフォントpxを比例算出（再計測なし）
//  - 監視はデバウンス 150ms、オーバーヘッド最小

(() => {
  const SELECTOR = '.greeting-side .greeting-message, .greeting-side p.greeting-message, .greeting-side > p';
  const BASE_PX = 18;     // 計測用の基準フォントサイズ(px)
  const MIN_PX  = 12;     // 下限
  const MAX_PX  = 40;     // 上限
  const MARGIN  = 2;      // 余白（はみ出し安全マージン）

  const $ = (s, r = document) => r.querySelector(s);

  let baseMaxLinePx = null;   // 基準サイズで測った「最長行の幅(px)」
  let lastHtml = '';          // 前回の本文（変化検知用）
  let moText = null, roCard = null;
  let debouncedResize = null;

  function debounce(fn, ms = 150) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // 挨拶文の「内側実効幅」を取得（padding込みでOK）
  function getAvailWidth(el) {
    return Math.floor(el.getBoundingClientRect().width);
  }

  // <br>区切りの各行をノーラップで計測 → 最長行幅(px)
  function measureMaxLinePx(el, fontPx) {
    const html = el.innerHTML;
    const lines = html
      .replace(/\s*\n\s*/g, '')
      .split(/<br\s*\/?>/i)
      .map(s => s.replace(/<\/?[^>]+>/g, '').trim());

    const probe = document.createElement('div');
    const cs = getComputedStyle(el);
    probe.style.cssText = `
      position:absolute; left:-99999px; top:-99999px; visibility:hidden;
      white-space:nowrap;
      letter-spacing:${cs.letterSpacing};
      font-family:${cs.fontFamily}; font-weight:${cs.fontWeight};
      font-size:${fontPx}px; line-height:${cs.lineHeight};
    `;
    document.body.appendChild(probe);

    let max = 0;
    for (const line of lines) {
      const span = document.createElement('span');
      span.textContent = line.length ? line : '　';
      probe.innerHTML = '';
      probe.appendChild(span);
      const w = Math.ceil(span.getBoundingClientRect().width);
      if (w > max) max = w;
    }
    document.body.removeChild(probe);
    return max;
  }

  // 本文が変わった時だけ 1回だけ実測
  function recomputeBaseline(el) {
    // 一旦固定pxにしてから測る（cqh等の相対指定を排除）
    const prev = el.style.fontSize;
    el.style.fontSize = `${BASE_PX}px`;
    baseMaxLinePx = measureMaxLinePx(el, BASE_PX);
    el.style.fontSize = prev || '';
  }

  // リサイズやカードスケール時は「幅の比」で比例決定（採寸なし）
  function applyProportional(el) {
    if (baseMaxLinePx == null || baseMaxLinePx === 0) return;
    const avail = getAvailWidth(el);
    // (利用可能幅-マージン) / 基準行幅 * BASE_PX
    const px = Math.max(MIN_PX, Math.min(MAX_PX, Math.floor(((avail - MARGIN) / baseMaxLinePx) * BASE_PX)));
    el.style.fontSize = `${px}px`;
  }

  function refresh(el) {
    // 本文が変わっていれば基準を取り直す
    const cur = el.innerHTML;
    if (cur !== lastHtml) {
      lastHtml = cur;
      // Webフォントがある場合は読み込み完了後に1回だけ計測
      const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.then(() => {
        recomputeBaseline(el);
        applyProportional(el);
      });
    } else {
      applyProportional(el);
    }
  }

  function setup() {
    const el = $(SELECTOR);
    if (!el) return;

    // 初期
    refresh(el);

    // テキスト変更監視（子の追加/置換のみ。subtree: false で最小化）
    if ('MutationObserver' in window) {
      moText?.disconnect();
      moText = new MutationObserver(() => refresh(el));
      moText.observe(el, { childList: true, characterData: true });
    }

    // カードのサイズ変化に比例適用（再計測なし）
    const card = $('#card');
    debouncedResize = debouncedResize || debounce(() => applyProportional(el), 150);

    if ('ResizeObserver' in window && card) {
      roCard?.disconnect();
      roCard = new ResizeObserver(debouncedResize);
      roCard.observe(card);
    } else {
      window.addEventListener('resize', debouncedResize, { passive: true });
      window.addEventListener('orientationchange', debouncedResize, { passive: true });
    }

    // エディタ開閉でレイアウトが動く場合にも比例だけ適用
    const overlay = $('#editor-overlay');
    if (overlay && 'MutationObserver' in window) {
      const mo = new MutationObserver(debouncedResize);
      mo.observe(overlay, { attributes: true, attributeFilter: ['aria-hidden'] });
    }
  }

  window.addEventListener('DOMContentLoaded', setup);
})();
