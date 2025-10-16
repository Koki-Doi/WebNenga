// tilt.js (type="module")
(() => {
  const card = document.querySelector('.card-3d');
  const root = document.querySelector('#card-root');
  if (!card || !root) return;

  // 最大傾き（強すぎると酔いやすいので 8〜12deg 推奨）
  const MAX_TILT = 8;

  // カード内の正規化座標を算出
  function calcRatios(point) {
    const rect = card.getBoundingClientRect();
    const x = (point.clientX - rect.left) / rect.width;   // 0..1
    const y = (point.clientY - rect.top)  / rect.height;  // 0..1
    // 画面外/要素外のときに NaN にならないようクリップ
    const sx = Math.min(Math.max(x, 0), 1);
    const sy = Math.min(Math.max(y, 0), 1);
    return {
      rx: (0.5 - sy) * (MAX_TILT * 2), // 上で手前（X回転）
      ry: (sx - 0.5) * (MAX_TILT * 2), // 右で手前（Y回転）
      sx, sy
    };
  }

  // 変数を更新
  function apply(rx, ry, sx, sy) {
    card.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    card.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    card.style.setProperty('--sx', sx.toFixed(3));
    card.style.setProperty('--sy', sy.toFixed(3));
  }

  // リセット
  function reset() {
    apply(0, 0, 0.5, 0.5);
  }

  // ポインタ追従（マウス/タッチ両対応）
  const onMove = (e) => {
    const point = (e.touches && e.touches[0]) ? e.touches[0] : e;
    const { rx, ry, sx, sy } = calcRatios(point);
    apply(rx, ry, sx, sy);
  };

  // イベント
  card.addEventListener('pointermove', onMove, { passive: true });
  card.addEventListener('pointerleave', reset);
  card.addEventListener('touchstart', onMove, { passive: true });
  card.addEventListener('touchmove',  onMove, { passive: true });
  card.addEventListener('touchend',   reset);

  // 初期
  reset();
})();
