// js/message-autofit.js
// 目的: PCで意図した <br> 区切りが、モバイルでも追加折返しなく再現されるよう
//       フォントサイズを自動調整する（最大化しつつ各行が収まる値に収束）。
// 既存JSは変更しない。DOM監視で本文変更・カードサイズ変更にも追従。

(function () {
  const MSG_SEL = '.greeting-side .greeting-message, .greeting-side p.greeting-message, .greeting-side > p';

  const $ = (s, r = document) => r.querySelector(s);

  // 指定要素の <br> 区切りごとの各行テキスト幅（ノーラップ）最大値を計測
  function measureMaxLineWidth(el) {
    const html = el.innerHTML;
    const lines = html
      .replace(/\s*\n\s*/g, '')
      .split(/<br\s*\/?>/i)
      .map(s => s.replace(/<\/?[^>]+>/g, '').trim());

    // 計測用コンテナ
    const probe = document.createElement('div');
    const s = getComputedStyle(el);
    probe.style.cssText = `
      position: absolute; left: -99999px; top: -99999px; visibility: hidden;
      white-space: nowrap; letter-spacing: ${s.letterSpacing};
      font-family: ${s.fontFamily}; font-weight: ${s.fontWeight};
      font-size: ${s.fontSize}; line-height: ${s.lineHeight};`;
    document.body.appendChild(probe);

    let max = 0;
    for (const line of lines) {
      const span = document.createElement('span');
      // 空行も測る（全角スペース1つ入れて高さ確保）
      span.textContent = line.length ? line : '　';
      probe.innerHTML = '';
      probe.appendChild(span);
      const w = Math.ceil(span.getBoundingClientRect().width);
      if (w > max) max = w;
    }

    document.body.removeChild(probe);
    return { maxLinePx: max, lineCount: lines.length };
  }

  // 要素幅（内側有効幅：padding込み）を取得
  function getEffectiveWidth(el) {
    const rect = el.getBoundingClientRect();
    return Math.floor(rect.width);
  }

  // 収束計算：フォントサイズ(px)を二分探索で決定
  function fitFont(el, { minPx = 12, maxPx = 40, marginPx = 1 }) {
    // 一旦、現在値（cqh等）を計算用のpxにロック
    const s0 = getComputedStyle(el);
    const currentPx = parseFloat(s0.fontSize) || 16;
    el.style.fontSize = `${currentPx}px`;

    const avail = getEffectiveWidth(el); // 行が入るべき幅
    let lo = minPx, hi = Math.max(currentPx, maxPx), ans = currentPx;

    // 10回程度で十分に収束
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      const { maxLinePx } = measureMaxLineWidth(el);
      if (maxLinePx <= (avail - marginPx)) {
        ans = mid; lo = mid; // まだ大きくできる
      } else {
        hi = mid; // はみ出した→小さく
      }
    }

    el.style.fontSize = `${Math.floor(ans)}px`;
  }

  // 再計算トリガ
  function recompute() {
    const el = $(MSG_SEL);
    if (!el) return;
    // Webフォントが読み込み済みかチェックしてから
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fitFont(el, { minPx: 12, maxPx: 40, marginPx: 2 }));
    } else {
      // フォントAPI非対応でも実行
      fitFont(el, { minPx: 12, maxPx: 40, marginPx: 2 });
    }
  }

  // 起動：DOMContentLoaded後に実行、カードサイズ変化と本文変化を監視
  window.addEventListener('DOMContentLoaded', () => {
    recompute();

    // カードのリサイズ（向き変更/ズーム等）
    const card = document.getElementById('card');
    if (window.ResizeObserver && card) {
      const ro = new ResizeObserver(() => recompute());
      ro.observe(card);
    } else {
      window.addEventListener('resize', recompute);
      window.addEventListener('orientationchange', recompute);
    }

    // 本文がJSで書き換わるケースに追従
    const msg = document.querySelector(MSG_SEL);
    if (msg && window.MutationObserver) {
      const mo = new MutationObserver(recompute);
      mo.observe(msg, { childList: true, characterData: true, subtree: true });
    }

    // エディタの開閉でカードが再レイアウトされた場合にも再計算
    const overlay = document.getElementById('editor-overlay');
    if (overlay && window.MutationObserver) {
      const mo2 = new MutationObserver(recompute);
      mo2.observe(overlay, { attributes: true, attributeFilter: ['aria-hidden'] });
    }
  });
})();
