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
const hermite = (from, to, fromSpeed, toSpeed, seconds, duration) => {
  const t = clamp(seconds / duration), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * from + (t3 - 2 * t2 + t) * fromSpeed * duration
    + (-2 * t3 + 3 * t2) * to + (t3 - t2) * toSpeed * duration;
};
const acceleration = 24;
const courseDistance = (seconds) => .5 * acceleration * seconds * seconds;

export function crowdCamera(progress) {
  const t = clamp(progress), z = 35, px = lerp(11, 5, t), py = 4.5;
  // 高さと奥行きを固定し、画面右への横移動と右旋回を同時に等速で続ける。
  return { px, py, pz: z,
    lx: px + lerp(18, 4, t), ly: py + 1.25, lz: z + 12,
    fov: 52, roll: 0 };
}

export function courseCamera(progress) {
  const t = clamp(progress), start = crowdCamera(1);
  if (t === 0) return start;
  // 観客席カットの横移動と右旋回の速度を引き継ぎ、走路への向きで減速する。
  const crowdStart = crowdCamera(0);
  const dx = start.lx - start.px, dz = start.lz - start.pz;
  const seconds = t * RACE_CAMERA_TIMING.course, turnDuration = RACE_CAMERA_TIMING.course * .42;
  const xSpeed = (start.px - crowdStart.px) / RACE_CAMERA_TIMING.crowd;
  const lookXSpeed = (dx - (crowdStart.lx - crowdStart.px)) / RACE_CAMERA_TIMING.crowd;
  const startDistance = Math.hypot(dx, dz);
  const yaw = hermite(Math.atan2(dx, dz), 0,
    dz * lookXSpeed / (dx * dx + dz * dz), 0, seconds, turnDuration);
  const distance = hermite(startDistance, 70,
    dx * lookXSpeed / startDistance, 0, seconds, turnDuration);
  const px = hermite(start.px, 3.5, xSpeed, 0, seconds, turnDuration);
  const py = hermite(start.py, 1.65, 0, 0, seconds, turnDuration);
  const pz = start.pz + courseDistance(seconds);
  return { px, py, pz,
    lx: px + Math.sin(yaw) * distance,
    ly: py + hermite(start.ly - start.py, 4.2, 0, 0, seconds, turnDuration),
    lz: pz + Math.cos(yaw) * distance,
    fov: lerp(52, 58, smooth((t - .4) / .6)), roll: 0 };
}

export function flashCamera(progress) {
  const end = courseCamera(1);
  const speed = acceleration * RACE_CAMERA_TIMING.course;
  return { ...end, pz: end.pz + speed * RACE_CAMERA_TIMING.flash * clamp(progress),
    lz: end.lz + speed * RACE_CAMERA_TIMING.flash * clamp(progress) };
}

// 光で完全に覆った瞬間だけカット。全景は余韻を持たせる緩いドリー。
export function gateWideCamera(progress) {
  return { px: 0, py: 2.1, pz: lerp(28, 25, clamp(progress)), lx: 0, ly: 2.2,
    lz: RACE_LAYOUT.gateZ, fov: 50, roll: 0 };
}

export function courseLight(progress) {
  return .08 * smooth((clamp(progress) - .84) / .16);
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
export function courseWhip(progress) {
  const t = clamp(progress) / .42;
  return t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2;
}
export function flashLight(progress) {
  return lerp(.08, 1, smooth(clamp(progress) / .42));
}

export function gateWideLight(progress) {
  const t = clamp(progress * RACE_CAMERA_TIMING.wide / RACE_CAMERA_TIMING.reveal);
  return 1 - (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
}
export const RACE_SEQUENCE_DURATION = RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course
  + RACE_CAMERA_TIMING.flash + RACE_CAMERA_TIMING.hold + RACE_CAMERA_TIMING.wide;
export function sampleRaceSequence(seconds) {
  let time = Math.max(0, seconds);
  for (const [name, duration, camera, light] of [
    ['観客席', RACE_CAMERA_TIMING.crowd, crowdCamera,
      (p) => 1 - smooth(p * RACE_CAMERA_TIMING.crowd / RACE_CAMERA_TIMING.entryReveal)],
    ['旋回・加速', RACE_CAMERA_TIMING.course, courseCamera, courseLight],
    ['白光', RACE_CAMERA_TIMING.flash, flashCamera, flashLight],
    ['カット切替', RACE_CAMERA_TIMING.hold, () => flashCamera(1), () => 1],
    ['ゲート全景', RACE_CAMERA_TIMING.wide, gateWideCamera, gateWideLight],
  ]) {
    if (time < duration - 1e-9) return { ...camera(time / duration), whiteout: light(time / duration), shot: name };
    time = Math.max(0, time - duration);
  }
  return { ...gateWideCamera(1), whiteout: 0, shot: 'ゲート全景' };
}
