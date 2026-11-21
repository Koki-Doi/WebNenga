// ガチャ演出の共有状態（WebNenga 統合版）
export const state = {
  phase: 'idle',
  bloom: 0.35,         // 毎フレーム composer に反映
  after: 0,            // AfterimagePass damp (0=off)
  radial: 0,           // RadialBlur strength
  whiteout: 0,         // 光源から画面へ広がる白光 (0–1)
  shake: 0,            // カメラ揺れ強度
  frame: null,         // フェーズごとの毎フレームフック (dt, t) => {}
  muted: false,
  // 計測用: セリフをタップで送った回数/自動で進んだ回数、結果画面の終わり方(tap/timeout)
  speechTaps: 0,
  speechAuto: 0,
  revealExit: null,
};

// 単発の年賀状ガチャ: 排出はゲート10番の★3（虹）で確定。
// 1・7番の金(★2)はゲートパンの装飾として原作準拠のまま残す。
export const GACHA = {
  ssrGate: 10,
  srGates: [1, 7],
  // 年賀状データ（gacha-boot が URL の data から流し込む）
  card: {
    a: '宛名 太郎', h: '様', s: '差出人',
    m: 'あけましておめでとうございます。',
    bgurl: './images/background_sample1.png',
    pv: 1, mbg: 1,
  },
  speechLines: [
    '新年あけまして\nおめでとうございます！',
  ],
};
