import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameStats } from '../js/gacha/frame-stats.js';

test('FPS計測: 平均と最も重い1秒間を要約し、タブ切替の長い間隔は除外する', () => {
  const stats = createFrameStats();
  assert.deepEqual(stats.summary(), {});
  for (let i = 0; i < 60; i++) stats.add(1 / 60);   // 1秒目: 60fps
  for (let i = 0; i < 20; i++) stats.add(1 / 20);   // 2秒目: 20fps
  stats.add(5);                                      // 非表示からの復帰は数えない
  stats.add(0); stats.add(NaN);
  const { avg_fps, min_fps } = stats.summary();
  assert.equal(avg_fps, 40);
  assert.equal(min_fps, 20);
  stats.reset();
  assert.deepEqual(stats.summary(), {});
});

test('FPS計測: 1秒未満の再生では最低FPSを平均で代用する', () => {
  const stats = createFrameStats();
  for (let i = 0; i < 15; i++) stats.add(1 / 30);
  assert.deepEqual(stats.summary(), { avg_fps: 30, min_fps: 30 });
});
