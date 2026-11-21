// js/card-effects.js
// Handles parallax tilt, shine, drop animation, and optional gyro control for the card.

const ROT_X_MAX = 30;
const ROT_Y_MAX = 30;
const STIFF = 100;
const DAMP = 14;
const GLOSS_BASE = 0.10;
const GLOSS_GAIN = 0.10;

const GYRO_GAIN = 1.45;
const BETA_RANGE = 35;
const GAMMA_RANGE = 35;
const LPF = 0.32;
const GYRO_WEIGHT = 0.92;

const GRAV = 400;
const REST = 0.2;
const STOP_V = 10;
const Kz = 80;
const Cz = 14;
const IMP_DECAY = 5.5;

export function initCardEffects({ container, card }) {
  if (!container || !card) return;

  let targetRX_ptr = 0;
  let targetRY_ptr = 0;
  let targetRX_gyro = 0;
  let targetRY_gyro = 0;

  let hasGyro = false;
  let gyroEnabled = false;
  let triedEnableGyro = false;
  let enablingGyro = false;
  // Desktop browsers can expose this API without having an orientation sensor.
  // Include iPadOS with a desktop UA, but exclude touch-enabled Windows PCs.
  const nav = window.navigator;
  const isTouchDevice = (nav?.maxTouchPoints || 0) > 0;
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(nav?.userAgent || '')
    || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints || 0) > 1);
  const canUseGyro = isTouchDevice && isMobileDevice && !!window.DeviceOrientationEvent;

  let mx = 50;
  let my = 50;
  let shineX = 0.5;
  let shineY = 0.5;

  let dropping = true;
  let yVH = -120;
  let vY = 0;
  let rz = 0;
  let vrz = 0;
  let glossImpact = 0;
  const backgrounds = card.querySelectorAll('.bg');
  let pendingPoint = null;
  let frameId = null;
  let prev = performance.now();

  // Run only while moving; input wakes the spring after it settles.
  function wake() {
    if (frameId !== null || document.hidden) return;
    prev = performance.now();
    frameId = requestAnimationFrame(raf);
  }

  const showGyroButton = () => {
    if (!canUseGyro || gyroEnabled) return;
    if (document.getElementById('gyro-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'gyro-btn';
    btn.type = 'button';
    btn.textContent = 'Gyroを有効化';
    btn.classList.add('floating-cta', 'floating-cta--right');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await enableGyro();
      if (gyroEnabled) btn.remove();
    }, { passive: false });
    document.body.appendChild(btn);
  };

  async function enableGyro() {
    if (!canUseGyro || gyroEnabled || enablingGyro) return;
    enablingGyro = true;
    // 許可ダイアログのある端末（iOS）だけ、許可の結果を計測する（card-analytics が用意する窓口経由）
    const needsPermission = typeof window.DeviceOrientationEvent.requestPermission === 'function';
    const report = (result) => { if (needsPermission) window.nengaTrackPage?.('gyro_permission', { result }); };
    try {
      if (needsPermission) {
        const res = await window.DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') {
          report('denied');
          showGyroButton();
          return;
        }
      }
      startGyroListen();
      gyroEnabled = true;
      report('granted');
      document.getElementById('gyro-btn')?.remove();
    } catch {
      report('error');
      showGyroButton();
    } finally {
      enablingGyro = false;
    }
  }

  const startGyroListen = () => {
    window.addEventListener('deviceorientation', (ev) => {
      if (ev.beta == null || ev.gamma == null) return;

      const beta = Math.max(-BETA_RANGE, Math.min(BETA_RANGE, ev.beta));
      const gamma = Math.max(-GAMMA_RANGE, Math.min(GAMMA_RANGE, ev.gamma));
      const rx = (beta / BETA_RANGE) * ROT_X_MAX * GYRO_GAIN;
      const ry = (gamma / GAMMA_RANGE) * ROT_Y_MAX * GYRO_GAIN;
      targetRX_gyro = targetRX_gyro * (1 - LPF) + rx * LPF;
      targetRY_gyro = targetRY_gyro * (1 - LPF) + ry * LPF;
      hasGyro = true;
      wake();
    }, { passive: true });
  };

  const tryEnableOnFirstInteraction = () => {
    if (triedEnableGyro) return;
    triedEnableGyro = true;
    enableGyro();
  };

  if (canUseGyro) {
    container.addEventListener('touchstart', tryEnableOnFirstInteraction, { passive: true });
    container.addEventListener('mousedown', tryEnableOnFirstInteraction);
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') showGyroButton();
  }

  const onPoint = (ev) => {
    const point = 'touches' in ev ? ev.touches[0] : ev;
    if (!point) return;
    pendingPoint = { clientX: point.clientX, clientY: point.clientY };
    wake();
  };

  const applyPoint = () => {
    const point = pendingPoint;
    pendingPoint = null;
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cx = point.clientX - r.left;
    const cy = point.clientY - r.top;
    shineX = Math.min(1, Math.max(0, cx / r.width));
    shineY = Math.min(1, Math.max(0, cy / r.height));
    const nx = shineX * 2 - 1;
    const ny = shineY * 2 - 1;
    targetRY_ptr = nx * ROT_Y_MAX;
    targetRX_ptr = -ny * ROT_X_MAX;
    mx = Math.round(shineX * 100);
    my = Math.round(shineY * 100);
  };

  const resetTilt = () => {
    pendingPoint = null;
    targetRX_ptr = 0;
    targetRY_ptr = 0;
    wake();
  };

  const pressOn = () => card.classList.add('is-pressing');
  const pressOff = () => card.classList.remove('is-pressing');

  container.addEventListener('mousemove', onPoint, { passive: true });
  container.addEventListener('touchmove', onPoint, { passive: true });
  container.addEventListener('mouseleave', resetTilt);
  container.addEventListener('touchend', resetTilt);
  container.addEventListener('touchcancel', resetTilt);
  container.addEventListener('mousedown', pressOn);
  window.addEventListener('mouseup', pressOff);
  container.addEventListener('touchstart', pressOn, { passive: true });
  window.addEventListener('touchend', pressOff);
  window.addEventListener('touchcancel', pressOff);

  let curRX = 0;
  let curRY = 0;
  let vRX = 0;
  let vRY = 0;
  const raf = () => {
    frameId = null;
    if (document.hidden) return;
    if (pendingPoint) applyPoint();
    const now = performance.now();
    let dt = (now - prev) / 1000;
    prev = now;
    dt = Math.min(dt, 1 / 30);

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
          yVH = 0;
          vY = 0;
        }
      }
      const az = (-Kz * rz - Cz * vrz);
      vrz += az * dt;
      rz += vrz * dt;
      glossImpact = Math.max(0, glossImpact - IMP_DECAY * dt);
    } else {
      if (Math.abs(rz) > 0.001 || Math.abs(vrz) > 0.001) {
        const az = (-Kz * rz - Cz * vrz);
        vrz += az * dt;
        rz += vrz * dt;
      } else {
        rz = 0;
        vrz = 0;
      }
      glossImpact = Math.max(0, glossImpact - IMP_DECAY * dt);
    }

    const useGyro = gyroEnabled && hasGyro;
    const tgtRX = useGyro
      ? (targetRX_gyro * GYRO_WEIGHT + targetRX_ptr * (1 - GYRO_WEIGHT))
      : targetRX_ptr;
    const tgtRY = useGyro
      ? (targetRY_gyro * GYRO_WEIGHT + targetRY_ptr * (1 - GYRO_WEIGHT))
      : targetRY_ptr;

    const axX = (tgtRX - curRX) * STIFF - vRX * DAMP;
    vRX += axX * dt;
    curRX += vRX * dt;
    const axY = (tgtRY - curRY) * STIFF - vRY * DAMP;
    vRY += axY * dt;
    curRY += vRY * dt;

    const tiltSettled = Math.abs(tgtRX - curRX) < .001 && Math.abs(vRX) < .001
      && Math.abs(tgtRY - curRY) < .001 && Math.abs(vRY) < .001;
    if (tiltSettled) {
      curRX = tgtRX; curRY = tgtRY;
      vRX = 0; vRY = 0;
    }

    card.style.setProperty('--dropY', `${yVH}vh`);
    card.style.setProperty('--rz', `${rz.toFixed(3)}deg`);
    card.style.setProperty('--rx', `${curRX.toFixed(3)}deg`);
    card.style.setProperty('--ry', `${curRY.toFixed(3)}deg`);
    card.style.setProperty('--mx', `${mx}%`);
    card.style.setProperty('--my', `${my}%`);
    card.style.setProperty('--glossImpact', glossImpact.toFixed(3));

    const speed = Math.hypot(vRX, vRY);
    const boost = Math.min(speed * 0.06, GLOSS_GAIN);
    card.style.setProperty('--gloss', (GLOSS_BASE + boost).toFixed(3));

    const autoX = (curRY / ROT_Y_MAX + 1) / 2;
    const autoY = (-curRX / ROT_X_MAX + 1) / 2;
    if (!Number.isFinite(shineX) || !Number.isFinite(shineY)) {
      shineX = 0.5;
      shineY = 0.5;
    } else {
      const Wp = 0.8;
      shineX = shineX * Wp + autoX * (1 - Wp);
      shineY = shineY * Wp + autoY * (1 - Wp);
    }

    const shineSettled = Math.abs(shineX - autoX) < .0001 && Math.abs(shineY - autoY) < .0001;
    if (shineSettled) { shineX = autoX; shineY = autoY; }

    backgrounds.forEach((bg) => {
      bg.style.setProperty('--shineX', Math.round(shineX * 100) + '%');
      bg.style.setProperty('--shineY', Math.round(shineY * 100) + '%');
    });

    if (dropping || !tiltSettled || !shineSettled || rz !== 0 || vrz !== 0 || glossImpact > 0) {
      frameId = requestAnimationFrame(raf);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    } else {
      wake();
    }
  });
  wake();

  return {
    enableGyro
  };
}
