// js/main.js
import { initEditor } from './editor.js';

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('card-container');
  const card = document.getElementById('card');

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
  const preventScroll = (ev) => {
    if (isEditorOpen()) return;
    ev.preventDefault();
  };
  window.addEventListener('wheel', preventScroll, { passive: false });
  window.addEventListener('touchmove', preventScroll, { passive: false });
  window.addEventListener('gesturestart', preventScroll, { passive: false });

  // ====== パララックス＋ジャイロ＋ガチャ降下 ======
  const ROT_X_MAX = 30, ROT_Y_MAX = 30;
  const STIFF = 100, DAMP = 14;
  const GLOSS_BASE = 0.10, GLOSS_GAIN = 0.10;

  // ジャイロ感度
  const GYRO_GAIN = 1.45;
  const BETA_RANGE  = 35;
  const GAMMA_RANGE = 35;
  const LPF = 0.32;
  const GYRO_WEIGHT = 0.92;

  // 目標角
  let targetRX_ptr = 0, targetRY_ptr = 0; // ポインタ
  let targetRX_gyro = 0, targetRY_gyro = 0; // ジャイロ

  let hasGyro = false;
  let gyroEnabled = false;
  let triedEnableGyro = false;

  // グロス/shine制御
  let mx = 50, my = 50; // ％（旧：グロス用）
  let shineX = 0.5, shineY = 0.5; // 0..1

  // ガチャ降下
  let dropping = true;
  let yVH = -120, vY = 0;
  const GRAV = 400, REST = 0.2, STOP_V = 10;

  // Z演出
  let rz = 0, vrz = 0;
  const Kz = 80, Cz = 14;

  let glossImpact = 0;
  const IMP_DECAY = 5.5;

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
      boxShadow: '0 6px 16px rgba(0,0,0,.25)', cursor: 'pointer'
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
        if (res !== 'granted') {
          showGyroButton();
          return;
        }
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
  container.addEventListener('mousedown', tryEnableOnFirstInteraction);
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

  // ====== ポインタ操作（shine と傾き） ======
  function onPoint(ev) {
    const r = container.getBoundingClientRect();
    const cx = ('touches' in ev ? ev.touches[0].clientX : ev.clientX) - r.left;
    const cy = ('touches' in ev ? ev.touches[0].clientY : ev.clientY) - r.top;

    // shine 0..1
    shineX = Math.min(1, Math.max(0, cx / r.width));
    shineY = Math.min(1, Math.max(0, cy / r.height));

    // 傾き目標
    const nx = shineX * 2 - 1;
    const ny = shineY * 2 - 1;
    targetRY_ptr = nx * ROT_Y_MAX;
    targetRX_ptr = -ny * ROT_X_MAX;

    // 既存グロス用
    mx = Math.round(shineX * 100);
    my = Math.round(shineY * 100);
  }
  container.addEventListener('mousemove', onPoint, { passive: true });
  container.addEventListener('touchmove', onPoint, { passive: true });

  function resetTilt() { targetRX_ptr = 0; targetRY_ptr = 0; }
  container.addEventListener('mouseleave', resetTilt);
  container.addEventListener('touchend', resetTilt);

  const pressOn  = () => card.classList.add('is-pressing');
  const pressOff = () => card.classList.remove('is-pressing');
  container.addEventListener('mousedown', pressOn);
  window.addEventListener('mouseup', pressOff);
  container.addEventListener('touchstart', pressOn, { passive: true });
  window.addEventListener('touchend', pressOff);

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
      const az = (-Kz * rz - Cz * vrz);
      vrz += az * dt; rz  += vrz * dt;
      glossImpact = Math.max(0, glossImpact - IMP_DECAY * dt);
    } else {
      if (Math.abs(rz) > 0.001 || Math.abs(vrz) > 0.001) {
        const az = (-Kz * rz - Cz * vrz);
        vrz += az * dt; rz  += vrz * dt;
      } else { rz = 0; vrz = 0; }
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

    // CSS変数更新（カード全体）
    card.style.setProperty('--dropY', `${yVH}vh`);
    card.style.setProperty('--rz', `${rz.toFixed(3)}deg`);
    card.style.setProperty('--rx', `${curRX.toFixed(3)}deg`);
    card.style.setProperty('--ry', `${curRY.toFixed(3)}deg`);
    card.style.setProperty('--mx', `${mx}%`);
    card.style.setProperty('--my', `${my}%`);
    card.style.setProperty('--glossImpact', glossImpact.toFixed(3));

    // グロスの自動ブースト
    const speed = Math.hypot(vRX, vRY);
    const boost = Math.min(speed * 0.06, GLOSS_GAIN);
    card.style.setProperty('--gloss', (GLOSS_BASE + boost).toFixed(3));

    // === 背景ホログラムのハイライト：shineX/shineY を更新 ===
    // ポインタ未移動のときは傾きから生成（ゆるく追従）
    if (!Number.isFinite(shineX) || !Number.isFinite(shineY)) {
      shineX = 0.5; shineY = 0.5;
    } else {
      const rxNorm = (curRX / (ROT_X_MAX || 1));  // -1..1
      const ryNorm = (curRY / (ROT_Y_MAX || 1));  // -1..1
      const autoX = (ryNorm + 1) / 2;             // 0..1
      const autoY = (-rxNorm + 1) / 2;            // 0..1
      // マウス優先：8割ポインタ、2割自動（好みで調整）
      const Wp = 0.8;
      shineX = shineX * Wp + autoX * (1 - Wp);
      shineY = shineY * Wp + autoY * (1 - Wp);
    }
    // 両面の .bg が参照（:before/:after の中心が動く）
    document.querySelectorAll('.bg').forEach(bg => {
      bg.style.setProperty('--shineX', Math.round(shineX * 100) + '%');
      bg.style.setProperty('--shineY', Math.round(shineY * 100) + '%');
    });

    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // ====== エディタ機能を初期化 ======
  initEditor();
});
