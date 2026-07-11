// js/card-analytics.js
// 共有リンクのカードID(#id=…)を GA4 イベントに付与して、ID単位で開封状況を追えるようにする。
// ※ 宛名・差出人・本文などの個人情報は送らない（card_id のみ）。
//    GA4 側で「カスタムディメンション card_id（イベントスコープ）」を登録すると
//    探索レポートやリアルタイムで ID ごとに絞り込める。
import { parseHash } from './utils.js';

const getCardId = () => {
  try { return parseHash(location.hash)?.id ?? null; } catch { return null; }
};

/** GA4 イベント送信（gtag 未ロード時は何もしない） */
export function trackCard(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  const id = getCardId();
  window.gtag('event', eventName, {
    card_id: id ?? '(no_id)',
    ...params,
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const id = getCardId();
  if (!id) return; // 共有リンク以外（素のエディタ画面）は計測しない

  // ユーザープロパティにも入れておく（ユーザースコープ分析用）
  if (typeof window.gtag === 'function') {
    window.gtag('set', 'user_properties', { card_id: id });
  }

  // 開封（共有リンクでの表示）
  trackCard('card_view');

  // 裏面に初めて到達（ガチャ経由・通常フリップ共通）
  const card = document.getElementById('card');
  if (card) {
    let sent = false;
    const mo = new MutationObserver(() => {
      if (!sent && card.classList.contains('flipped')) {
        sent = true;
        trackCard('card_flip_to_back');
        mo.disconnect();
      }
    });
    mo.observe(card, { attributes: true, attributeFilter: ['class'] });
  }
});
