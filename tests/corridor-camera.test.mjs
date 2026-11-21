import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorChase, CORRIDOR_REFERENCE_FRAMES, CORRIDOR_TIMING } from '../js/gacha/corridor-camera.js';

test('年賀状は廊下の全区間でカメラより十分先にいる', () => {
  let minimum = Infinity;
  for (let i = 0; i <= 1000; i++) {
    const { cardZ, camera } = corridorChase(i / 1000);
    minimum = Math.min(minimum, camera.pz - cardZ);
    assert.ok(Object.values(camera).every(Number.isFinite));
  }
  assert.ok(minimum >= 4.5 - 1e-9, `最小前後距離 ${minimum}`);
  assert.ok(-8.4 - (-12.4) >= 4, '開扉中も年賀状を追い越さない');
});

test('年賀状は左で待機せず、0.1秒ごとの参考時点に沿って扉の真正面へ進む', () => {
  assert.equal(CORRIDOR_TIMING.chase, (CORRIDOR_REFERENCE_FRAMES.door - CORRIDOR_REFERENCE_FRAMES.entry) / 10);
  assert.equal(CORRIDOR_TIMING.doorApproach + CORRIDOR_TIMING.doorOpen + CORRIDOR_TIMING.whiteHold, .8);
  assert.equal(CORRIDOR_TIMING.doorSwing, .5, '扉は0.5秒かけて開き切る');
  assert.ok(CORRIDOR_TIMING.doorSwingDelay < CORRIDOR_TIMING.doorApproach, '白光より前に扉が動き始める');
  assert.ok(CORRIDOR_TIMING.doorSwing > CORRIDOR_TIMING.doorOpen, '白光の立ち上がりより長く扉を開く');
  assert.ok(Math.abs(CORRIDOR_TIMING.doorSwingDelay + CORRIDOR_TIMING.doorSwing
    - CORRIDOR_TIMING.doorApproach - CORRIDOR_TIMING.doorOpen) < 1e-9,
  '110枚目で開き切る');
  const start = corridorChase(0), end = corridorChase(1);
  assert.equal(start.camera.pz, 5.7);
  assert.ok(Math.abs(end.camera.pz + 6.5) < 1e-9);
  assert.ok(Math.abs(end.cardZ + 11.4) < 1e-9);
  assert.ok(start.cardX < 0 && end.cardX === 0, '扉の中央へ移る');
  assert.ok(corridorChase(.05).cardX > start.cardX, '最初の0.1秒から左の待機位置を離れる');
  assert.ok(corridorChase(.05).cardZ < start.cardZ, '手前でも停止しない');
  assert.equal(corridorChase(.4).cardX, 0, '90枚目には中央へ入る');
  assert.ok(Math.abs(corridorChase(.84).cardZ + 11.4) < 1e-9, '100枚目に扉へ着く');
  for (let i = 1; i <= 24; i++) {
    assert.ok(corridorChase(i / 24).camera.pz < corridorChase((i - 1) / 24).camera.pz,
      `${80 + i}枚目までカメラは止まらない`);
  }
  const h = 1e-5;
  const exitSpeed = (corridorChase(1 - h).camera.pz - end.camera.pz) / (h * CORRIDOR_TIMING.chase);
  const doorSpeed = (-6.5 - (-7.5)) / CORRIDOR_TIMING.doorApproach;
  assert.ok(Math.abs(exitSpeed - doorSpeed) < .2, '扉寄りのカメラ速度へ滑らかにつながる');
});
