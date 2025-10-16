// js/main.js
import { initEditor } from './editor.js';

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('card-container');
  const card = document.getElementById('card');

  // オーバーレイ（表/裏）
  const wrapFront = document.querySelector('.address-side .card-wrapper');
  const wrapBack  = document.querySelector('.greeting-side .card-wrapper');
  const getActiveWrapper = () =>
    card.classList.contains('flipped') ? wrapBack : wrapFront;

  // ====== 共通ユーティリティ ======
  const isEditorOpen = () => document.documentElement.classList.contains('editing-open');

  const toggle = () => {
    if (isEditorOpen()) return; // エディタ表示中は回転させない
    card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', card.classList.contains('flipped') ? 'true' : 'false');
  };

  // ====== 反転操作（クリック/Enter/Space） ======
  container.addEventListener('click', () => {
    if (isEditorOpen()) return; // エディタ中は反転しない
    toggle();
  });

  window.addEventListener('keydown', (e) => {
    if (isEditorOpen()) return; // エディタ中はカード制御しない（改行等のため）
    const scrollers = ['Space', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      toggle();
    } else if (scrollers.includes(e.code)) {
      e.preventDefault(); // スクロール抑止
    }
  });

  // ====== グローバルスクロール抑止（エディタ中は解除） ======
  const preventScroll = (ev) => { if (!isEditorOpen()) ev.preventDefault(); };
  window.addEventListener('wheel',        preventScroll, { passive: false });
  window.addEventListener('touchmove',    preventScroll, { passive: false });
  window.addEventListener('gesturestart', preventScroll, { passive: false });

  // ====== パララックス＋ジャイロ＋ガチャ降下 ======
  const ROT_X_MAX = 30;   // 上下最大回転（deg）
  const ROT_Y_MAX = 30;   // 左右最大回転（deg）
  const STIFF = 100;      // ばね係数
  const DAMP  = 14;       // 減衰
  const GLOSS_BASE = 0.10;
  const GLOSS_GAIN = 0.10;

  // ジャイロ感度
  const GYRO_GAIN = 1.45;
  const BETA_RANGE  = 35;
  const GAMMA_RANGE = 35;
  const LPF = 0.32;
  const GYRO_WEIGHT = 0.92;

  // マウス/タッチによる目標角
  let targetRX_ptr = 0, targetRY_ptr = 0;
  // ジャイロによる目標角
  let targetRX_gyro = 0, targetRY_gyro = 0;

  let hasGyro = false;
  let gyroEnabled = false;
  let triedEnableGyro = false;
  let mx = 50, my = 50; // グロスのハイライト

  // ====== ガチャ降下（バウンド） ======
  let dropping = true;
  let yVH = -120;      // --dropY と同じ単位（vh）
  let vY = 0;
  const GRAV = 400, REST = 0.2, STOP_V = 10;

  // Z回転（演出）
  let rz = 0, vrz = 0;
  const Kz = 80, Cz = 14;

  // インパクトの一瞬の光
  let glossImpact = 0;
  const IMP_DECAY = 5.5;

  // ====== TCGオーバーレイ：比率制御（ポインタ or 傾き） ======
  let pointerInside = false;                 // カード上にポインタがあるか
  let lastPointerTs = 0;                     // 直近ポインタ時刻
  let ratioX_ptr = 0.5, ratioY_ptr = 0.5;    // 0..1
  const POINTER_HOLD_MS = 500;               // この時間はポインタ優先

  // 直近に適用した値（イプシロン判定用）
  let lastRatioX = 0.5, lastRatioY = 0.5;

  // ====== ジャイロ許可導線 ======
  function showGyroButton() {
    if (document.getElementById('gyro-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'gyro-btn';
    btn.textContent = 'Gyroを有効化';
    Object.assign(btn.style, {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: 9999,
      padding: '10px 14px', borderRadius: '8px', border: '0',
      fontSize: '14px', background: '#b23a1e', color: '#fff',
      boxShadow: '0 6px 16px rgba(0,0,0,.25)', opacity: '0.15', cursor: 'pointer'
    });
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await enableGyro();
      if (gyroEnabled) btn.remove();
    }, { passive: false });
    document.body.appendChild(btn);
  }

  async function enableGyro() {
    try {
      if (window.DeviceOrientationEvent &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { showGyroButton(); return; }
      }
      startGyroListen();
      gyroEnabled = true;
    } catch {
      showGyroButton();
    }
  }

  const tryEnableOnFirstInteraction = () => {
    if (triedEnableGyro) return;
    triedEnableGyro = true;
    enableGyro();
  };
  container.addEventListener('touchstart', tryEnableOnFirstInteraction, { passive: true });
  container.addEventListener('mousedown',  tryEnableOnFirstInteraction);

  if (window.DeviceOrientationEvent &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    showGyroButton();
  }

  function startGyroListen() {
    if (!window.DeviceOrientationEvent) return;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;

      const beta  = clamp(e.beta,  -BETA_RANGE,  BETA_RANGE);
      const gamma = clamp(e.gamma, -GAMMA_RANGE, GAMMA_RANGE);

      let rx = -(beta  / BETA_RANGE)  * ROT_X_MAX * GYRO_GAIN;
      let ry =  (gamma / GAMMA_RANGE) * ROT_Y_MAX * GYRO_GAIN;

      rx = clamp(rx, -ROT_X_MAX * 1.2, ROT_X_MAX * 1.2);
      ry = clamp(ry, -ROT_Y_MAX * 1.2, ROT_Y_MAX * 1.2);

      targetRX_gyro = targetRX_gyro + (rx - targetRX_gyro) * LPF;
      targetRY_gyro = targetRY_gyro + (ry - targetRY_gyro) * LPF;

      hasGyro = true;
    }, { passive: true });
  }

  // ====== ポインタ操作（比率と傾きの両方を更新） ======
  function onPoint(ev) {
    const r = container.getBoundingClientRect();
    const cx = ('touches' in ev ? ev.touches[0].clientX : ev.clientX) - r.left;
    const cy = ('touches' in ev ? ev.touches[0].clientY : ev.clientY) - r.top;

    // 注視点（0..1）
    ratioX_ptr = Math.min(1, Math.max(0, cx / r.width));
    ratioY_ptr = Math.min(1, Math.max(0, cy / r.height));
    lastPointerTs = performance.now();

    // 既存の傾き目標
    const nx = ratioX_ptr * 2 - 1;
    const ny = ratioY_ptr * 2 - 1;
    targetRY_ptr = nx * ROT_Y_MAX;
    targetRX_ptr = -ny * ROT_X_MAX;

    // グロスのハイライト
    mx = Math.round(ratioX_ptr * 100);
    my = Math.round(ratioY_ptr * 100);
  }

  // 「カードの内側にいるときだけ」ポインタ情報を採用し、.is-hover を制御
  const setHover = (on) => {
    pointerInside = on;
    const active = getActiveWrapper();
    const inactive = active === wrapFront ? wrapBack : wrapFront;
    if (active)   active.classList.toggle('is-hover', on);
    if (inactive) inactive.classList.remove('is-hover'); // 裏側は常に外す
  };

  container.addEventListener('mouseenter', () => setHover(true));
  container.addEventListener('mouseleave', () => setHover(false));
  container.addEventListener('mousemove',  (e) => { if (pointerInside) onPoint(e); }, { passive: true });
  // タッチ端末
  container.addEventListener('touchstart', (e) => { setHover(true); onPoint(e); }, { passive: true });
  container.addEventListener('touchmove',  (e) => { if (pointerInside) onPoint(e); }, { passive: true });
  container.addEventListener('touchend',   () => setHover(false));
  container.addEventListener('touchcancel',() => setHover(false));

  const pressOn  = () => card.classList.add('is-pressing');
  const pressOff = () => card.classList.remove('is-pressing');
  container.addEventListener('mousedown', pressOn);
  window.addEventListener('mouseup',     pressOff);
  container.addEventListener('touchstart', pressOn, { passive: true });
  window.addEventListener('touchend',      pressOff);

  // ====== アニメーションループ ======
  let curRX = 0, curRY = 0;
  let vRX = 0, vRY = 0;
  let prev = performance.now();

  function raf() {
    const now = performance.now();
    let dt = (now - prev) / 1000;
    prev = now;
    dt = Math.min(dt, 1/30);

    // --- ガチャ降下 ---
    if (dropping) {
      vY += GRAV * dt;
      yVH += vY * dt;

      if (yVH >= 0) {
        yVH = 0;
        vY = -vY * REST;
        glossImpact = 0.22;
        vrz += (Math.random() * 10 - 5);
        if (Math.abs(vY) < STOP_V) {
          dropping = false;
          yVH = 0; vY = 0;
        }
      }

      // Z回転（減衰復帰）
      const az = (-Kz * rz - Cz * vrz);
      vrz += az * dt;
      rz  += vrz * dt;
      glossImpact = Math.max(0, glossImpact - IMP_DECAY * dt);
    } else {
      if (Math.abs(rz) > 0.001 || Math.abs(vrz) > 0.001) {
        const az = (-Kz * rz - Cz * vrz);
        vrz += az * dt;
        rz  += vrz * dt;
      } else {
        rz = 0; vrz = 0;
      }
      glossImpact = Math.max(0, glossImpact - IMP_DECAY * dt);
    }

    // --- 入力合成（ジャイロ優先） ---
    const useGyro = gyroEnabled && hasGyro;
    const tgtRX = useGyro ? (targetRX_gyro * GYRO_WEIGHT + targetRX_ptr * (1 - GYRO_WEIGHT))
                          : targetRX_ptr;
    const tgtRY = useGyro ? (targetRY_gyro * GYRO_WEIGHT + targetRY_ptr * (1 - GYRO_WEIGHT))
                          : targetRY_ptr;

    // スプリング
    const axX = (tgtRX - curRX) * STIFF - vRX * DAMP;
    vRX += axX * dt; curRX += vRX * dt;
    const axY = (tgtRY - curRY) * STIFF - vRY * DAMP;
    vRY += axY * dt; curRY += vRY * dt;

    // CSS変数更新（グロス）
    card.style.setProperty('--dropY', `${yVH}vh`);
    card.style.setProperty('--rz', `${rz.toFixed(3)}deg`);
    card.style.setProperty('--rx', `${curRX.toFixed(3)}deg`);
    card.style.setProperty('--ry', `${curRY.toFixed(3)}deg`);
    card.style.setProperty('--mx', `${mx}%`);
    card.style.setProperty('--my', `${my}%`);
    card.style.setProperty('--glossImpact', glossImpact.toFixed(3));

    // ====== オーバーレイ注視点（--ratio-x/y） ======
    // ポインタ直近 or 内側 → ポインタ比率、他は傾きから生成
    let useRatioX, useRatioY;
    if (pointerInside || (now - lastPointerTs <= POINTER_HOLD_MS)) {
      useRatioX = ratioX_ptr;
      useRatioY = ratioY_ptr;
    } else {
      const rxNorm = (curRX / (ROT_X_MAX || 1));  // -1..1
      const ryNorm = (curRY / (ROT_Y_MAX || 1));  // -1..1
      useRatioX = Math.min(1, Math.max(0, (ryNorm + 1) / 2));   // 左→0 / 右→1
      useRatioY = Math.min(1, Math.max(0, (-rxNorm + 1) / 2));  // 上で0に近づくよう反転
    }

    // スムージング＆イプシロン更新（微小差はスタイルを書き換えない）
    const SMOOTH = 0.35;
    const EPS = 0.002;

    const nextX = lastRatioX + (useRatioX - lastRatioX) * SMOOTH;
    const nextY = lastRatioY + (useRatioY - lastRatioY) * SMOOTH;

    const active = getActiveWrapper();
    if (active) {
      if (Math.abs(nextX - lastRatioX) > EPS) {
        active.style.setProperty('--ratio-x', nextX.toFixed(4));
        lastRatioX = nextX;
      }
      if (Math.abs(nextY - lastRatioY) > EPS) {
        active.style.setProperty('--ratio-y', nextY.toFixed(4));
        lastRatioY = nextY;
      }
    }

    // 裏側は常に hover を外す（可視切替時のチラつき防止）
    const inactive = active === wrapFront ? wrapBack : wrapFront;
    if (inactive && inactive.classList.contains('is-hover')) {
      inactive.classList.remove('is-hover');
    }

    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // ====== エディタ機能を初期化 ======
  initEditor();
});
