import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crowdCamera, courseCamera, flashCamera, gateWideCamera, gateFlashAmount, REFERENCE_FRAMES, RACE_CAMERA_TIMING,
  GATE_PASS_TIMING, RACE_LAYOUT, sampleRaceSequence, RACE_SEQUENCE_DURATION,
  sweepCamera, entryWhite, skyWhite, whipAmount, zoomAmount, SWEEP_HORIZON,
} from '../js/gacha/race-layout.js';

// 走路(+Z)から観客席(+X)側へ測った向き。観客席に正対で90°、走路に正対で0°
const yawOf = (pose) => Math.atan2(pose.lx - pose.px, pose.lz - pose.pz);
const DEG = Math.PI / 180;

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

test('観客席では高さと観客席までの距離を固定し、正面から右へ横移動して、終わり際に右へ振り向きはじめる', () => {
  // 参考0113–0123: 庇が水平のまま左へ流れ（=正対のまま右へ横移動）、0120あたりから傾きはじめる
  const start = crowdCamera(0), end = crowdCamera(1);
  assert.ok(Math.abs(yawOf(start) - 90 * DEG) < 1e-9, '観客席に正対して始まる');
  assert.ok(start.fov < 30, '望遠で客席を画面いっぱいに捉える');
  for (let i = 0; i <= 100; i++) {
    const pose = crowdCamera(i / 100);
    assert.equal(pose.py, start.py, '高さを保つ');
    assert.equal(pose.px, start.px, '観客席までの距離を保つ');
    if (i === 0) continue;
    const prior = crowdCamera((i - 1) / 100);
    assert.ok(pose.pz > prior.pz, '最後まで右(+Z)への横移動が続く');
    assert.ok(yawOf(pose) <= yawOf(prior) + 1e-12, '左へは振らない');
  }
  assert.ok(Math.abs(yawOf(crowdCamera(.5)) - 90 * DEG) < 1e-9, '前半は正対を保つ');
  assert.ok(yawOf(end) < 75 * DEG && yawOf(end) > 30 * DEG, '終わり際には右へ振り向きはじめている');
  const speed = (crowdCamera(.5).pz - crowdCamera(.4).pz) / (.1 * RACE_CAMERA_TIMING.crowd);
  assert.ok(speed > 10, '客席が流れて見える速さで横移動する');
  assert.ok(courseCamera(.5).pz > end.pz, '振り向いた後も進み続ける');
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
  assert.equal(crowdCamera(.5).px, crowdCamera(0).px);
});

test('振り向きは0124–0126で最も速く、0129までに走路へ正対する', () => {
  const at = (frame) => (frame - REFERENCE_FRAMES.crowd) / 10;
  let peak = { seconds: 0, amount: 0 };
  for (let seconds = 0; seconds <= 2.6; seconds += .005) {
    const amount = whipAmount(seconds);
    assert.ok(amount >= 0 && amount <= 1 + 1e-9);
    if (amount > peak.amount) peak = { seconds, amount };
  }
  assert.ok(peak.amount > .99);
  assert.ok(peak.seconds >= at(124) && peak.seconds <= at(126), `最速は ${peak.seconds.toFixed(2)}秒`);
  assert.ok(yawOf(sweepCamera(at(120))) > 80 * DEG, '0120まではほぼ正対');
  assert.ok(yawOf(sweepCamera(at(126))) < 30 * DEG, '0126には走路側を向いている');
  assert.ok(Math.abs(yawOf(sweepCamera(at(129)))) < 2 * DEG, '0129で走路に正対');
  assert.equal(whipAmount(at(118)), 0, '正対している間は横ブラーなし');
  assert.equal(whipAmount(at(132)), 0, '走路を見通す間も横ブラーなし');
  // 振り向きながら引いて、走路の目線まで降りる
  const end = courseCamera(1);
  assert.ok(end.fov > crowdCamera(0).fov + 20, '望遠から広角へ引く');
  assert.ok(end.py < crowdCamera(0).py - 2, '走路の目線へ降りる');
  assert.ok(end.px > crowdCamera(0).px, '観客席側へ寄り、左に観客席を大きく入れる');
});

test('振り向きを終えてから走路を緩やかに進み、白光へ向けて加速する。全景は低速で見せる', () => {
  for (const t of [.6, .8, 1]) {
    const pose = courseCamera(t);
    assert.ok(Math.abs(pose.lx - pose.px) < 1e-8, 'コースに正対');
    assert.equal(pose.roll, 0, '水平を維持');
  }
  const velocity = (camera, t, duration) => (camera(t + .001).pz - camera(t).pz) / (.001 * duration);
  const truck = velocity(crowdCamera, .3, RACE_CAMERA_TIMING.crowd);
  const hold = velocity(courseCamera, .75, RACE_CAMERA_TIMING.course);
  const rush = velocity(flashCamera, .9, RACE_CAMERA_TIMING.flash);
  assert.ok(hold > 0 && hold < 4, '走路を見通す間は緩やかに前進（参考0129–0134）');
  assert.ok(truck > hold * 3, '観客席の横移動のほうがずっと速い');
  assert.ok(rush > hold * 4, '白光へ向けて加速（参考0135–0137）');
  assert.equal(zoomAmount(RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course * .7), 0, '加速の前は放射ブラーなし');
  assert.ok(zoomAmount(RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course + RACE_CAMERA_TIMING.flash) > .99);
  const wideSpeed = (gateWideCamera(0).pz - gateWideCamera(1).pz) / RACE_CAMERA_TIMING.wide;
  assert.ok(wideSpeed < 2, '全景で余韻を取る');
});

test('扉からの白は画面全体が均一に引き、ゲート前の白光は空だけを覆う', () => {
  assert.equal(entryWhite(0), 1);
  assert.equal(entryWhite(RACE_CAMERA_TIMING.entryReveal), 0);
  for (let s = .01; s <= 2.6; s += .01) assert.ok(entryWhite(s) <= entryWhite(s - .01), '白は戻らない');
  assert.equal(skyWhite(RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course - .1), 0, '走路を見通す間は白くしない');
});

test('カットは空が完全に白い間に行い、芝は見せたままつなぐ。全景が見えてから次へ進む', () => {
  const cut = RACE_CAMERA_TIMING.crowd + RACE_CAMERA_TIMING.course + RACE_CAMERA_TIMING.flash;
  for (const time of [cut, cut + RACE_CAMERA_TIMING.hold / 2, cut + RACE_CAMERA_TIMING.hold]) {
    assert.equal(sampleRaceSequence(time).skyWhite, 1, '空は完全に白い');
    assert.equal(sampleRaceSequence(time).whiteout, 0, '画面全体は白くしない（芝を残す。参考0135–0137）');
  }
  const revealEnd = cut + RACE_CAMERA_TIMING.hold + RACE_CAMERA_TIMING.reveal;
  assert.ok(sampleRaceSequence(revealEnd + .0001).skyWhite < .0001);
  assert.ok(RACE_SEQUENCE_DURATION - revealEnd > 1, '白光が引いた後に全景を見る時間');
  // 白の境目は、走路の地平線とゲート全景の芝の上端の両方に重なる（カットをまたいで芝がつながる）
  const screenY = (pose, worldY, distance) => {
    const pitch = Math.atan2(pose.ly - pose.py, Math.hypot(pose.lx - pose.px, pose.lz - pose.pz));
    const below = Math.atan2(pose.py - worldY, distance) + pitch;
    return .5 - .5 * Math.tan(below) / Math.tan(pose.fov * DEG / 2);
  };
  const course = flashCamera(1), wide = gateWideCamera(0);
  assert.ok(Math.abs(screenY(course, 0, 1e6) - SWEEP_HORIZON) < .02, '走路の地平線');
  assert.ok(Math.abs(screenY(wide, 0, wide.pz - RACE_LAYOUT.gateZ) - SWEEP_HORIZON) < .03, 'ゲートの足元');
});

test('10fpsで抽出した参考フレームの被写体と白光の時点に合う', () => {
  // frame_0112を起点に、116/120は観客席、128/132は走路、136は白、140はゲート。
  const at = (frame) => sampleRaceSequence((frame - 112) / 10);
  assert.equal(at(112).whiteout, 1);
  assert.equal(at(116).shot, '観客席');
  assert.equal(at(120).shot, '観客席');
  assert.equal(at(128).shot, '旋回・加速');
  assert.equal(at(132).shot, '旋回・加速');
  assert.equal(at(136).skyWhite, 1);
  assert.equal(at(140).shot, 'ゲート全景');
  assert.ok(at(140).skyWhite < .2, 'ゲートを認識できる');
  assert.equal(at(118).whiteout, 0, '0118には扉の白が引き切っている');
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
