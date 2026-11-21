// 座標規約: コースはZ方向。+Zへ走るカットでは画面左がワールド+X。
// 観客席は走路の+X側に固定し、+Zを向くカメラで左側に映す。
export const RACE_LAYOUT = Object.freeze({
  railX: 9.6,
  standOffsetX: -8,
  standCenterZ: 60,
  standLengthScale: .72,
  standRotationY: -Math.PI / 2,
  gateZ: -5,
});

// movie/frames は10fps。境界の番号から尺を作り、0.1秒刻みの参考テンポを保つ。
export const REFERENCE_FRAMES = Object.freeze({ crowd: 112, turn: 124, white: 135, gate: 138, gatePan: 159, lamp: 222, lampLit: 228, goldGate: 237, launch: 243 });
const framesToSeconds = (start, end) => (end - start) / 10;
export const RACE_CAMERA_TIMING = Object.freeze({
  crowd: framesToSeconds(REFERENCE_FRAMES.crowd, REFERENCE_FRAMES.turn),
  course: framesToSeconds(REFERENCE_FRAMES.turn, REFERENCE_FRAMES.white),
  entryReveal: .55,
  flash: .22,
  hold: framesToSeconds(REFERENCE_FRAMES.white, REFERENCE_FRAMES.gate) - .22,
  wide: framesToSeconds(REFERENCE_FRAMES.gate, REFERENCE_FRAMES.gatePan),
  reveal: .25,
});
export const GATE_PASS_TIMING = Object.freeze({
  settle: .2,
  pan: framesToSeconds(REFERENCE_FRAMES.gatePan, REFERENCE_FRAMES.lamp) - .2,
});
const clamp = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;

// ---- 観客席 → 旋回 → 走路 → 白光: ひと続きのカメラ（参考 0113–0137） ----
// 原作の動き:
//   0113–0119 観客席を正面から望遠で捉え、高さと距離を保ったまま右へ速く横移動する
//   0120–0128 横移動を続けながら右へ振り向く（0124–0125 が最も速い）。同時に引いて走路の高さへ降りる
//   0129–0134 走路を見通して、ゆっくり前へ
//   0135–0137 空が白く飛び、芝を残したまま前へ突っ込む → 0138 でゲート全景
// 位置・向き・画角をすべて「0112 からの秒数」の滑らかな関数にして、区切りで速度が途切れないようにする。
const SWEEP = Object.freeze({
  x: [1.5, 6.8],            // 観客席(前縁 X=15.8)までの距離 → 振り向きながら観客席側の柵へ寄る
  y: [5, 2.3],              // 2層目の客席の高さ → 走路の目線
  settle: [1.2, 1.9],       // 寄りと降下にかける区間（観客席カットの間は動かさない）
  z0: 24,
  truck: 16,                // 横移動の速さ (m/s)
  drift: 2.5,               // 走路を見通す間の前進 (m/s)
  slow: [1.1, 1.8],         // 横移動から前進へ減速する区間
  turn: [.7, 1.84],         // 振り向きの区間
  turnSharpness: 2.2,       // 大きいほど中盤が速い（最速 約170°/秒）
  // 観客席では1層目の手すりのすぐ上から屋根の下までが画面いっぱいに入る。
  // 走路では地平線が画面の下から43%に来る（ゲート全景の芝の上端と揃う）
  pitch: [.6 * RAD, 4.1 * RAD],
  fov: [24, 54],
  zoom: [.95, 1.75],
  boostFrom: 2.12,          // 白光へ向けた加速の開始
  boost: 150,
  reach: 70,
});
const SWEEP_END = (REFERENCE_FRAMES.gate - REFERENCE_FRAMES.crowd) / 10;
const span = ([from, to], seconds) => clamp((seconds - from) / (to - from));
// 始点と終点で速度0、中盤で一気に進むS字
const gain = (u, k) => (u <= 0 ? 0 : u >= 1 ? 1 : u ** k / (u ** k + (1 - u) ** k));
function sweepDistance(seconds) {
  const { truck, drift, slow: [from, to], boostFrom, boost } = SWEEP;
  // 速度 = truck → drift へ smoothstep で減速。その積分
  const u = clamp((seconds - from) / (to - from));
  const eased = (to - from) * (u ** 3 - u ** 4 / 2) + Math.max(0, seconds - to);
  return truck * seconds + (drift - truck) * eased + boost * Math.max(0, seconds - boostFrom) ** 3 / 3;
}
export function sweepCamera(seconds) {
  const t = Math.max(0, Math.min(SWEEP_END, seconds));
  const settle = smooth(span(SWEEP.settle, t));
  const yaw = Math.PI / 2 * gain(span(SWEEP.turn, t), SWEEP.turnSharpness);   // 0=観客席に正対, 90°=走路(+Z)
  const pitch = lerp(SWEEP.pitch[0], SWEEP.pitch[1], settle);
  const px = lerp(SWEEP.x[0], SWEEP.x[1], settle);
  const py = lerp(SWEEP.y[0], SWEEP.y[1], settle);
  const pz = SWEEP.z0 + sweepDistance(t);
  return {
    px, py, pz,
    lx: px + Math.cos(yaw) * Math.cos(pitch) * SWEEP.reach,
    ly: py + Math.sin(pitch) * SWEEP.reach,
    lz: pz + Math.sin(yaw) * Math.cos(pitch) * SWEEP.reach,
    fov: lerp(SWEEP.fov[0], SWEEP.fov[1], smooth(span(SWEEP.zoom, t))),
    roll: 0,
  };
}
const CROWD_END = RACE_CAMERA_TIMING.crowd;
const COURSE_END = CROWD_END + RACE_CAMERA_TIMING.course;
export function crowdCamera(progress) {
  return sweepCamera(clamp(progress) * RACE_CAMERA_TIMING.crowd);
}
export function courseCamera(progress) {
  return sweepCamera(CROWD_END + clamp(progress) * RACE_CAMERA_TIMING.course);
}
// 白光の間も止まらず前へ進む（progress が1を超えるとカット切替の間も続く）
export function flashCamera(progress) {
  return sweepCamera(COURSE_END + Math.max(0, progress) * RACE_CAMERA_TIMING.flash);
}

// ---- 光とブラー（いずれも 0112 からの秒数で決まる） ----
// 扉からの白は、放射状ではなく画面全体が均一に引いていく（参考 0114–0117）
export function entryWhite(seconds) {
  return 1 - smooth((seconds - .08) / (RACE_CAMERA_TIMING.entryReveal - .08));
}
// 空だけが白く飛ぶ。芝は残し、その連続でカットをまたぐ（参考 0135–0137）
export function skyWhite(seconds) {
  return smooth((seconds - (COURSE_END - .08)) / .1);
}
// 振り向きの速さ（0–1）。横方向のブラーの強さに使う
export function whipAmount(seconds) {
  const u = span(SWEEP.turn, seconds), k = SWEEP.turnSharpness;
  if (u <= 0 || u >= 1) return 0;
  const a = u ** k, b = (1 - u) ** k;
  return (a * b / (u * (1 - u))) / (a + b) ** 2;      // gain'(u)/k。u=.5 で1
}
// 白光へ突っ込む加速（0–1）。消失点へ向かう放射ブラーの強さに使う
export function zoomAmount(seconds) {
  return smooth((seconds - SWEEP.boostFrom) / .26);
}
// 画面内の基準位置（UV。yは下が0）: 走路とゲート全景で共通の「芝の上端」と、横ブラーの向かう先
export const SWEEP_HORIZON = .43;
export const SWEEP_VANISH = Object.freeze([.5, SWEEP_HORIZON]);
export const WHIP_TOWARD = Object.freeze([4, .5]);

// 白光が引くのと同時にわずかに寄り、そのあとは余韻を持たせる緩いドリー。
export function gateWideCamera(progress) {
  const p = clamp(progress);
  const punch = (1 - clamp(p * RACE_CAMERA_TIMING.wide / .4)) ** 3;
  return { px: 0, py: 2.1, pz: lerp(28, 25, p), lx: 0, ly: 2.2,
    lz: RACE_LAYOUT.gateZ, fov: 50 + 5 * punch, roll: 0 };
}
// ゲート全景で空の白が引いていく（1→0）
export function gateWideLight(progress) {
  const t = clamp(progress * RACE_CAMERA_TIMING.wide / RACE_CAMERA_TIMING.reveal);
  return 1 - (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
}

// 参考160–220: 1番から10番までをほぼ等速で横移動し、各房の装飾を読ませる。
export function gatePassCamera(progress) {
  const x = lerp((5.5 - 1) * 1.45 + 1.55, (5.5 - 10) * 1.45 + .85, clamp(progress));
  return { px: x, py: 1.45, pz: -.1, lx: x - 1.6, ly: 2.1, lz: -4.6, fov: 50, roll: .035 };
}
export function gateFlashAmount(progress, gateNumber) {
  const shot = gatePassCamera(progress);
  const gateFrontZ = RACE_LAYOUT.gateZ + .5;
  const depth = (gateFrontZ - shot.pz) / (shot.lz - shot.pz);
  const centerX = shot.px + (shot.lx - shot.px) * depth;
  const gateX = (5.5 - gateNumber) * 1.45;
  return Math.max(0, 1 - Math.abs(centerX - gateX) / .34) ** 2;
}

export const RACE_SEQUENCE_DURATION = RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course
  + RACE_CAMERA_TIMING.flash + RACE_CAMERA_TIMING.hold + RACE_CAMERA_TIMING.wide;
// 0112 からの秒数 → カメラ・光・カット名（モデル確認ページとテスト用）
//   whiteout: 画面全体の白 / skyWhite: 空だけの白
export function sampleRaceSequence(seconds) {
  const time = Math.max(0, seconds);
  if (time < SWEEP_END - 1e-9) {
    const shot = time < CROWD_END - 1e-9 ? '観客席' : time < COURSE_END - 1e-9 ? '旋回・加速'
      : time < COURSE_END + RACE_CAMERA_TIMING.flash - 1e-9 ? '白光' : 'カット切替';
    return { ...sweepCamera(time), whiteout: entryWhite(time), skyWhite: skyWhite(time), shot };
  }
  const progress = Math.min(1, (time - SWEEP_END) / RACE_CAMERA_TIMING.wide);
  return { ...gateWideCamera(progress), whiteout: 0, skyWhite: gateWideLight(progress), shot: 'ゲート全景' };
}
