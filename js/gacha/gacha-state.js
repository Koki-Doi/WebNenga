// ガチャ演出の共有状態（WebNenga 統合版）
export const state = {
  phase: 'idle',
  bloom: 0.35,         // 毎フレーム composer に反映
  after: 0,            // AfterimagePass damp (0=off)
  radial: 0,           // RadialBlur strength
  shake: 0,            // カメラ揺れ強度
  frame: null,         // フェーズごとの毎フレームフック (dt, t) => {}
  muted: false,
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
    '明けましておめでとう',
  ],
};
