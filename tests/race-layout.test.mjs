import test from 'node:test';
import assert from 'node:assert/strict';
import { crowdCamera, courseCamera, flashCamera, gateWideCamera, gateFlashAmount, REFERENCE_FRAMES, RACE_CAMERA_TIMING, GATE_PASS_TIMING, RACE_LAYOUT, sampleRaceSequence, RACE_SEQUENCE_DURATION } from '../js/gacha/race-layout.js';

test('観客席カットの終点とコースカットの始点が完全に連続する', () => {
  assert.deepEqual(courseCamera(0), crowdCamera(1));
});

test('コースへ移るカメラは地上を保ち、観客席を横切らない', () => {
  for (const sample of [crowdCamera, courseCamera, flashCamera, gateWideCamera]) {
    for (let i = 0; i <= 100; i++) {
      const pose = sample(i / 100);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.py > 1 && pose.py < 6);
      assert.ok(pose.px < 12, '観客席はX=14より外側、カメラはその手前');
      assert.ok(pose.pz > RACE_LAYOUT.gateZ + 25, 'ゲートを貫通しない');
    }
  }
  const end = courseCamera(1);
  assert.ok(end.lz > end.pz + 60, '旋回後はゲートと反対の走路を見通す');
  assert.ok(Math.abs(end.px) < RACE_LAYOUT.railX, '終点はコース幅内');
});

test('白光までは固定されたゲートが常にカメラの背後にある', () => {
  for (const camera of [crowdCamera, courseCamera, flashCamera]) {
    for (let i = 0; i <= 100; i++) {
      const pose = camera(i / 100);
      const directionX = pose.lx - pose.px, directionZ = pose.lz - pose.pz;
      const gateX = -pose.px, gateZ = RACE_LAYOUT.gateZ - pose.pz;
      assert.ok(directionX * gateX + directionZ * gateZ < 0, '白光前にゲートが画面へ入らない');
    }
  }
});

test('観客席では高さと奥行きを固定し、右へ横移動しながら右へ旋回する', () => {
  const start = crowdCamera(0), end = crowdCamera(1);
  assert.equal(start.pz, end.pz);
  assert.equal(start.lz, end.lz);
  assert.ok(end.px < start.px);
  assert.ok(Math.atan2(end.lx - end.px, end.lz - end.pz)
    < Math.atan2(start.lx - start.px, start.lz - start.pz));
  for (let i = 0; i <= 100; i++) {
    const pose = crowdCamera(i / 100);
    assert.equal(pose.py, start.py);
    assert.equal(pose.ly, start.ly);
    assert.equal(pose.pz, start.pz);
    assert.equal(pose.lz, start.lz);
    if (i === 0) continue;
    const prior = crowdCamera((i - 1) / 100);
    assert.ok(pose.px < prior.px, '最後まで右への移動が続く');
    assert.ok(Math.atan2(pose.lx - pose.px, pose.lz - pose.pz)
      < Math.atan2(prior.lx - prior.px, prior.lz - prior.pz), '右への旋回が続く');
  }
  assert.equal(courseCamera(0).pz, start.pz);
  assert.ok(courseCamera(.5).pz > start.pz);
});

test('白光までの接続点で位置・向き・実時間の速度が連続する', () => {
  const phases = [[crowdCamera, RACE_CAMERA_TIMING.crowd], [courseCamera, RACE_CAMERA_TIMING.course],
    [flashCamera, RACE_CAMERA_TIMING.flash]];
  const dt = .00001;
  for (let i = 1; i < phases.length; i++) {
    const [before, beforeDuration] = phases[i - 1], [after, afterDuration] = phases[i];
    assert.deepEqual(before(1), after(0));
    for (const key of Object.keys(before(1))) {
      const v1 = (before(1)[key] - before(1 - dt / beforeDuration)[key]) / dt;
      const v2 = (after(dt / afterDuration)[key] - after(0)[key]) / dt;
      assert.ok(Math.abs(v1 - v2) < .01, `${key}: ${v1} → ${v2}`);
    }
  }
  assert.equal(crowdCamera(.5).pz, crowdCamera(0).pz);
});

test('旋回を先に終え、前進は加速し、全景は低速で見せる', () => {
  for (const t of [.6, .8, 1]) {
    const pose = courseCamera(t);
    assert.ok(Math.abs(pose.lx - pose.px) < 1e-8, 'コースに正対');
    assert.equal(pose.roll, 0, '水平を維持');
  }
  const velocity = (t) => (courseCamera(t + .001).pz - courseCamera(t).pz) / (.001 * RACE_CAMERA_TIMING.course);
  assert.ok(velocity(.8) > velocity(.2) * 2, '直進時に加速');
  const wideSpeed = (gateWideCamera(0).pz - gateWideCamera(1).pz) / RACE_CAMERA_TIMING.wide;
  assert.ok(wideSpeed < 2, '全景で余韻を取る');
});
test('カットは完全な白光の間に行い、全景が見えてから次へ進む', () => {
  const cut = RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course + RACE_CAMERA_TIMING.flash;
  for (const time of [cut, cut + RACE_CAMERA_TIMING.hold / 2, cut + RACE_CAMERA_TIMING.hold]) {
    assert.equal(sampleRaceSequence(time).whiteout, 1);
  }
  const revealEnd = cut + RACE_CAMERA_TIMING.hold + RACE_CAMERA_TIMING.reveal;
  assert.ok(sampleRaceSequence(revealEnd + .0001).whiteout < .0001);
  assert.ok(RACE_SEQUENCE_DURATION - revealEnd > 1, '白光が引いた後に全景を見る時間');
});

test('10fpsで抽出した参考フレームの被写体と白光の時点に合う', () => {
  // frame_0112を起点に、116/120は観客席、128/132は走路、136は白、140はゲート。
  const at = (frame) => sampleRaceSequence((frame - 112) / 10);
  assert.equal(at(112).whiteout, 1);
  assert.equal(at(116).shot, '観客席');
  assert.equal(at(120).shot, '観客席');
  assert.equal(at(128).shot, '旋回・加速');
  assert.equal(at(132).shot, '旋回・加速');
  assert.equal(at(136).whiteout, 1);
  assert.equal(at(140).shot, 'ゲート全景');
  assert.ok(at(140).whiteout < .2, 'ゲートを認識できる');
  assert.equal(at(124).shot, '旋回・加速');
  assert.equal(at(135).shot, '白光');
  assert.equal(at(138).shot, 'ゲート全景');
  assert.equal(RACE_SEQUENCE_DURATION, (REFERENCE_FRAMES.gatePan - REFERENCE_FRAMES.crowd) / 10);
  assert.equal(GATE_PASS_TIMING.settle + GATE_PASS_TIMING.pan,
    (REFERENCE_FRAMES.lamp - REFERENCE_FRAMES.gatePan) / 10);
});

test('各ゲートは中央を通るときだけ短く発光する', () => {
  const peaks = [];
  for (let gate = 1; gate <= 10; gate++) {
    let best = { progress: 0, amount: 0 };
    for (let step = 0; step <= 10000; step++) {
      const progress = step / 10000, amount = gateFlashAmount(progress, gate);
      if (amount > best.amount) best = { progress, amount };
    }
    assert.ok(best.amount > .9, `${gate}番ゲートが十分明るい`);
    assert.ok(gateFlashAmount(Math.min(1, best.progress + .05), gate) < .05,
      `${gate}番ゲートの光が後の房へ持ち越されない`);
    peaks.push(best.progress);
  }
  for (let i = 1; i < peaks.length; i++) {
    assert.ok(peaks[i] > peaks[i - 1], '1番から10番の順番で光る');
  }
  assert.ok(peaks[9] < 1, '最後のゲートもランプへのカット前に光る');
});
