import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/card-effects.js', import.meta.url), 'utf8')
  .replace('export function initCardEffects', 'function initCardEffects');

function setup({ userAgent = 'Mozilla/5.0 (Android)', platform = 'Linux', maxTouchPoints = 5,
  orientation = {} } = {}) {
  let now = 0, nextId = 0, reads = 0, writes = 0, queries = 0;
  const frames = new Map();
  function eventTarget() {
    const handlers = new Map();
    return {
      addEventListener(name, fn) {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(fn);
      },
      emit(name, event = {}) { return Promise.all((handlers.get(name) || []).map(fn => fn(event))); },
      listenerCount(name) { return (handlers.get(name) || []).length; },
    };
  }
  const values = new Map();
  const style = { setProperty(key, value) { writes++; values.set(key, value); } };
  const container = {
    ...eventTarget(),
    getBoundingClientRect() { reads++; return { left: 0, top: 0, width: 200, height: 300 }; },
  };
  const card = {
    style, classList: { add() {}, remove() {} },
    querySelectorAll() { queries++; return [{ style }, { style }]; },
  };
  const elements = new Map();
  const document = { ...eventTarget(), hidden: false,
    getElementById: id => elements.get(id),
    body: { appendChild: el => elements.set(el.id, el) },
    createElement: () => ({ ...eventTarget(), classList: { add() {} },
      remove() { elements.delete(this.id); } }),
  };
  const window = { ...eventTarget(), navigator: { userAgent, platform, maxTouchPoints },
    DeviceOrientationEvent: orientation };
  const effects = runInNewContext(`${source}\ninitCardEffects({ container, card });`, {
    container, card, document, window, performance: { now: () => now },
    Math: Object.assign(Object.create(Math), { random: () => .8 }),
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      const queued = [...frames.values()];
      frames.clear();
      for (const fn of queued) fn(now);
    }
  }
  function settle() {
    let count = 0;
    while (frames.size && count++ < 1200) step();
    assert.equal(frames.size, 0, 'animation must stop after settling');
    return count;
  }
  return { container, document, window, values, frames, step, settle, effects,
    counts: () => ({ reads, writes, queries }) };
}

test('落下・傾き・光沢が収束したら描画を停止し、次の入力で再開する', () => {
  const t = setup();
  t.settle();
  assert.equal(t.values.get('--dropY'), '0vh');
  assert.equal(t.values.get('--rz'), '0.000deg');
  const idle = t.counts();
  t.step(600);
  assert.deepEqual(t.counts(), idle, 'idle frames must not access DOM');
  t.container.emit('mousemove', { clientX: 200, clientY: 0 });
  assert.equal(t.frames.size, 1);
  t.settle();
  assert.equal(t.values.get('--rx'), '30.000deg');
  assert.equal(t.values.get('--ry'), '30.000deg');
  t.container.emit('mouseleave');
  t.settle();
  assert.equal(t.values.get('--rx'), '0.000deg');
  assert.equal(t.values.get('--shineX'), '50%');
  assert.equal(t.counts().queries, 1);
});

test('PCでは権限APIがあってもボタン・許可要求・センサー監視を作らない', async () => {
  for (const device of [
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 10 },
    { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 },
  ]) {
    let requests = 0;
    const t = setup({ ...device, orientation: { requestPermission: async () => { requests++; throw Error(); } } });
    await t.container.emit('mousedown');
    await t.container.emit('touchstart');
    await t.effects.enableGyro();
    assert.equal(t.document.getElementById('gyro-btn'), undefined);
    assert.equal(requests, 0);
    assert.equal(t.window.listenerCount('deviceorientation'), 0);
  }
});

test('iPhone・デスクトップUAのiPadではボタンを表示し、有効化後に消す', async () => {
  for (const device of [
    { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone' },
    { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel' },
  ]) {
    let requests = 0;
    const t = setup({ ...device, orientation: { requestPermission: async () => { requests++; return 'granted'; } } });
    assert.ok(t.document.getElementById('gyro-btn'));
    await t.effects.enableGyro();
    await t.effects.enableGyro();
    assert.equal(t.document.getElementById('gyro-btn'), undefined);
    assert.equal(requests, 1);
    assert.equal(t.window.listenerCount('deviceorientation'), 1);
  }
});

test('モバイルの拒否・例外後はボタンで再試行でき、同時要求は重複しない', async () => {
  for (const failure of ['denied', 'error']) {
    let requests = 0;
    const t = setup({ orientation: { requestPermission: async () => {
      if (++requests > 1) return 'granted';
      if (failure === 'error') throw Error('permission unavailable');
      return 'denied';
    } } });
    await Promise.all([t.effects.enableGyro(), t.effects.enableGyro()]);
    assert.equal(requests, 1);
    assert.equal(t.window.listenerCount('deviceorientation'), 0);
    await t.document.getElementById('gyro-btn').emit('click', { stopPropagation() {} });
    assert.equal(t.document.getElementById('gyro-btn'), undefined);
    assert.equal(t.window.listenerCount('deviceorientation'), 1);
  }
});

test('許可ダイアログのある端末ではジャイロ許可の結果を計測窓口へ送る', async () => {
  for (const [answer, expected] of [['granted', 'granted'], ['denied', 'denied'], [null, 'error']]) {
    const t = setup({ userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', orientation: { requestPermission: async () => {
      if (!answer) throw Error('unavailable');
      return answer;
    } } });
    const tracked = [];
    t.window.nengaTrackPage = (name, params) => tracked.push([name, params.result]);
    await t.effects.enableGyro();
    assert.deepEqual(tracked, [['gyro_permission', expected]]);
  }
  // 許可が不要な端末（Android）では送らない
  const android = setup({ orientation: {} });
  const tracked = [];
  android.window.nengaTrackPage = (name) => tracked.push(name);
  await android.effects.enableGyro();
  assert.deepEqual(tracked, []);
});

test('センサーAPIのない端末では有効化しない', async () => {
  const t = setup({ orientation: null });
  await t.effects.enableGyro();
  assert.equal(t.document.getElementById('gyro-btn'), undefined);
  assert.equal(t.window.listenerCount('deviceorientation'), 0);
});

test('連続するポインタ入力の採寸は1フレームに1回、最後の座標を使う', () => {
  const t = setup();
  t.settle();
  for (let i = 0; i <= 200; i++) t.container.emit('mousemove', { clientX: i, clientY: 0 });
  assert.equal(t.counts().reads, 0);
  assert.equal(t.frames.size, 1);
  t.step();
  assert.equal(t.counts().reads, 1);
  t.settle();
  assert.equal(t.values.get('--ry'), '30.000deg');
  t.container.emit('touchmove', { touches: [{ clientX: 0, clientY: 300 }] });
  t.container.emit('touchcancel');
  t.settle();
  assert.equal(t.values.get('--ry'), '0.000deg');
  assert.equal(t.counts().reads, 1, 'cancelled input must not be applied');
});

test('非表示中は停止し、復帰後の入力・ジャイロで再開できる', async () => {
  const t = setup();
  t.step(10);
  t.document.hidden = true;
  t.document.emit('visibilitychange');
  const paused = t.counts();
  t.container.emit('mousemove', { clientX: 200, clientY: 0 });
  t.step(600);
  assert.equal(t.frames.size, 0);
  assert.deepEqual(t.counts(), paused);
  t.document.hidden = false;
  t.document.emit('visibilitychange');
  t.settle();
  assert.equal(t.values.get('--ry'), '30.000deg');
  t.container.emit('mouseleave');
  t.settle();
  t.container.emit('mousedown');
  t.window.emit('deviceorientation', { beta: 20, gamma: 20 });
  assert.equal(t.frames.size, 1);
  t.settle();
  assert.ok(parseFloat(t.values.get('--ry')) > 0);
});
