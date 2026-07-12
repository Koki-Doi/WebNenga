// js/card-analytics.js
// 共有リンクのカードID(#id=…)・宛名・差出人を GA4 イベントに付与して、
// 「誰宛のカードが開封/完走したか」を個別に追えるようにする。
// GA4 側でカスタムディメンション card_id / recipient / sender（イベントスコープ）を
// 登録すると探索レポートやリアルタイムで絞り込める。
import { parseHash, decodeData } from './utils.js';

const getCardInfo = () => {
  try {
    const p = parseHash(location.hash);
    if (!p) return null;
    const obj = decodeData(p.data) || {};
    return {
      id: p.id,
      recipient: String(obj.a ?? '').trim() || null,   // 宛名（敬称は含まない）
      sender: String(obj.s ?? '').trim() || null,      // 差出人
    };
  } catch { return null; }
};

/** GA4 イベント送信（gtag 未ロード時は何もしない） */
export function trackCard(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  const info = getCardInfo();
  window.gtag('event', eventName, {
    card_id: info?.id ?? '(no_id)',
    recipient: info?.recipient ?? '(none)',
    sender: info?.sender ?? '(none)',
    ...params,
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const info = getCardInfo();
  if (!info) return; // 共有リンク以外（素のエディタ画面）は計測しない

  // ユーザープロパティにも入れておく（ユーザースコープ分析用）
  if (typeof window.gtag === 'function') {
    window.gtag('set', 'user_properties', {
      card_id: info.id,
      recipient: info.recipient ?? '(none)',
      sender: info.sender ?? '(none)',
    });
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
