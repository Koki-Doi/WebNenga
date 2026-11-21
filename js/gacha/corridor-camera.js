// 廊下では年賀状が左から入り、そのまま扉へ走る。
// 参考画像は10fps。進行値を止めず、被写体とカメラを同じ時間軸で評価する。
const clamp = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const centerArrival = .4; // 80→90枚目: 左から入り、走り出す時には扉の軸上へ
const doorArrival = .84; // 100枚目: 年賀状が先に扉へ着く
const centerBlend = (t) => (1 - clamp(t / centerArrival)) ** 2;
const approach = (t) => .15 * t + .85 * t * t * (2 - t);
const run = (t) => {
  if (t <= centerArrival) {
    const s = t / centerArrival;
    return .3 * (.3 * s + .7 * s * s);
  }
  const s = clamp((t - centerArrival) / (doorArrival - centerArrival));
  return .3 + .7 * (.8 * s + 1.4 * s * s - 1.2 * s * s * s);
};

export const CORRIDOR_REFERENCE_FRAMES = Object.freeze({ entry: 80, turn: 90, arrive: 100, door: 104, open: 106, white: 108, crowd: 112 });
const framesToSeconds = (start, end) => (end - start) / 10;
export const CORRIDOR_TIMING = Object.freeze({
  chase: framesToSeconds(CORRIDOR_REFERENCE_FRAMES.entry, CORRIDOR_REFERENCE_FRAMES.door),
  doorApproach: framesToSeconds(CORRIDOR_REFERENCE_FRAMES.door, CORRIDOR_REFERENCE_FRAMES.open),
  // 105枚目から110枚目まで、扉が開き切る動きに0.5秒を使う。
  doorOpen: .4,
  doorSwingDelay: .1,
  doorSwing: .5,
  whiteHold: .2,
});

export function corridorChase(progress) {
  const t = clamp(progress), dolly = approach(t), side = centerBlend(t);
  return {
    cardZ: lerp(1.2, -11.4, run(t)),
    cardX: side > 0 ? -.9 * side : 0,
    camera: {
      px: side > 0 ? -.4 * side : 0, py: lerp(1.9, 1.75, dolly),
      pz: lerp(5.7, -6.5, dolly), lx: 0, ly: lerp(2.6, 3.6, dolly),
      lz: -13, fov: lerp(50, 58, dolly), roll: 0,
    },
  };
}
