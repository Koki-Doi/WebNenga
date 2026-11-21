// ガチャ演出の共有状態（WebNenga 統合版）
export const state = {
  phase: 'idle',
  bloom: 0.35,         // 毎フレーム composer に反映
  after: 0,            // AfterimagePass damp (0=off)
  radial: 0,           // RadialBlur strength
  whiteout: 0,         // 光源から画面へ広がる白光 (0–1)
  whiteFlat: 0,        // 画面全体が均一に白む量 (0–1)
  skyWhite: 0,         // 地平線より上だけが白く飛ぶ量 (0–1)。芝は残る
  horizonAt: .43,      // skyWhite の境目（画面UVのy。下が0）
  blurAt: [.5, .5],    // 放射ブラーの中心（画面UV）。画面外へ置くと一方向の流しブラーになる
  shake: 0,            // カメラ揺れ強度
  frame: null,         // フェーズごとの毎フレームフック (dt, t) => {}
  // 追加FX（resetFx が毎フェーズ初期値へ戻す）
  burst: null,         // ゲートごとの光の粒の強さ (ゲート配列の添字) => 0–1
  streak: 0,           // 疾走のスピード線の強さ (0–1)
  trail: 0,            // 年賀状のきらめき軌跡（毎秒の放出数）
  cardShadow: 0,       // 年賀状の接地影の濃さ (0–1)
  flare: 0,            // レンズゴーストの強さ (0–1)
  whiteAt: [.58, .66], // 白光が広がる中心（画面UV）
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
