// 年賀状ガチャ・ブート
// 「タップして裏面を見る」の初回タップを横取りして、ウマ娘パロディのガチャ演出を挟み、
// 排出結果（SSR確定）として年賀状の裏面を届けるジョーク演出。
// 演出エンジンは 年賀状2027/gacha-demo を移植（js/gacha/ 以下）。
import { parseHash, decodeData } from '../utils.js';
import { trackCard } from '../card-analytics.js';

let started = false;      // このロードで一度でも再生したか
let engine = null;        // 遅延初期化されるエンジン一式
let enginePromise = null;

const qs = new URLSearchParams(location.search);
const DEBUG_PHASE = qs.get('gphase');

function getCardData() {
  const parsed = parseHash(location.hash);
  if (!parsed) return null;
  const obj = decodeData(parsed.data);
  if (!obj) return null;
  if (obj.g === 0) return null;               // 将来のオプトアウト用
  return obj;
}

// ---------- オーバーレイ DOM ----------
function buildOverlay() {
  const root = document.createElement('div');
  root.id = 'gacha-overlay';
  root.innerHTML = `
    <div id="gc-stage">
      <canvas id="gc-three"></canvas>
      <div id="gc-ui">
        <div id="gc-speech" class="gc-ov">
          <div id="gc-speech-stars"></div>
          <div id="gc-speech-box"><p id="gc-speech-text"></p></div>
          <div class="gc-tap-hint">TAP ▼</div>
        </div>
        <div id="gc-reveal-ui" class="gc-ov">
          <div class="gc-rv-new">NEW!</div>
          <div class="gc-rv-bottom">
            <div class="gc-rv-items">
              <span class="gc-omake">おまけ</span>
              <i class="gc-qi-shoe"></i><b>×2027</b>
            </div>
            <div class="gc-rv-band">
              <div class="gc-rv-epithet">［2027年 年賀状］</div>
              <div class="gc-rv-name">差出人</div>
            </div>
            <div class="gc-rv-stars"><span>★</span><span>★</span><span>★</span></div>
          </div>
          <div class="gc-tap-hint">TAP ▼</div>
        </div>
        <div id="gc-flash" class="gc-ov"></div>
        <div id="gc-hud">
          <button id="gc-mute" title="サウンド">🔊</button>
          <button id="gc-skip">SKIP ▶▶</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

// ---------- エンジン初期化（three/gsap を遅延ロード） ----------
async function initEngine(cardData) {
  const [{ gsap }, world, phasesMod, uiMod] = await Promise.all([
    import('gsap'),
    import('./gacha-world.js'),
    import('./gacha-phases.js'),
    import('./gacha-ui.js'),
  ]);
  const { state, GACHA } = await import('./gacha-state.js');
  Object.assign(GACHA.card, cardData || {});

  const overlay = buildOverlay();
  const stageEl = overlay.querySelector('#gc-stage');
  const { W } = world;
  world.initWorld(overlay.querySelector('#gc-three'));
  // フォント先読み（扇面の筆文字テクスチャ用に Yuji Boku を確実に）
  try { await document.fonts.load('700 40px "Noto Sans JP"', '謹賀新年'); } catch (e) { }
  await Promise.all([
    world.buildHagaki(GACHA.card),
    world.buildFan3D(),
  ]);

  // ---- キャンセルトークン / ランナー（gacha-demo main.js と同型） ----
  const PHASES = phasesMod.makePhases();
  let token = null;
  const phaseIndex = (name) => PHASES.findIndex((p) => p.name === name);
  function mkToken() {
    const tk = {
      cancelled: false,
      _tweens: new Set(),
      _cleanups: new Set(),
      cancel() {
        if (tk.cancelled) return;
        tk.cancelled = true;
        for (const t of tk._tweens) t.kill();
        tk._tweens.clear();
        for (const f of tk._cleanups) f();
        tk._cleanups.clear();
      },
      tw(target, vars) {
        return new Promise((res) => {
          if (tk.cancelled) return res();
          const t = gsap.to(target, {
            ...vars,
            onComplete: () => { tk._tweens.delete(t); vars.onComplete?.(); res(); },
            onInterrupt: () => res(),
          });
          tk._tweens.add(t);
        });
      },
      wait(s) { return tk.tw({ v: 0 }, { v: 1, duration: s }); },
      tap() {
        return new Promise((res) => {
          if (tk.cancelled) return res();
          const h = () => { cleanup(); res(); };
          const cleanup = () => { stageEl.removeEventListener('pointerdown', h); tk._cleanups.delete(cleanup); };
          tk._cleanups.add(cleanup);
          stageEl.addEventListener('pointerdown', h);
        });
      },
    };
    return tk;
  }
  let doneResolver = null;
  async function runFrom(idx) {
    token?.cancel();
    const tk = (token = mkToken());
    for (let i = idx; i < PHASES.length; i++) {
      if (tk.cancelled) return;
      state.phase = PHASES[i].name;
      try {
        await PHASES[i].enter(tk);
      } catch (e) {
        if (tk.cancelled) return;
        console.error(`[gacha:${PHASES[i].name}]`, e);
      }
    }
    if (!tk.cancelled) doneResolver?.();
  }
  function jumpTo(name) {
    const i = phaseIndex(name);
    if (i < 0) return;
    uiMod.UI.hideAllOverlays();
    gsap.killTweensOf('#gc-flash');
    document.getElementById('gc-flash').classList.remove('show');
    runFrom(i);
  }

  // ---- メインループ ----
  let running = false;
  let manualMode = false;
  let gsapT = 0;
  let simT = 0;
  let lastT = 0;
  function frame(dt) {
    simT += dt;
    const t = simT;
    if (manualMode) gsap.updateRoot(gsapT += dt);
    state.frame?.(dt, t);
    W.confetti?.update(dt, t);
    W.sparkles?.update(dt, t);
    W.revealSpark?.update(dt, t);
    for (const p of W.penlights ?? []) p.update(dt, t);
    world.applyCamera(t);
    world.updateWorldFx();
    W.composer?.render();
  }
  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (manualMode) return;
    const dt = Math.min((now - lastT) / 1000 || 0, .05);
    lastT = now;
    frame(dt);
  }
  function startLoop() {
    if (running) return;
    running = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function stopLoop() { running = false; }

  // ---- HUD ----
  overlay.querySelector('#gc-skip').addEventListener('click', (e) => {
    e.stopPropagation();
    trackCard('gacha_skip', { phase: state.phase });
    uiMod.SFX.whoosh(.25);
    jumpTo('reveal');
  });
  overlay.querySelector('#gc-mute').addEventListener('click', (e) => {
    e.stopPropagation();
    state.muted = !state.muted;
    uiMod.SFX.setMuted(state.muted);
    e.currentTarget.textContent = state.muted ? '🔇' : '🔊';
  });

  return {
    overlay, state, W, jumpTo, runFrom, frame, world, ui: uiMod,
    setManual(v) {
      if (v && !manualMode) {
        manualMode = true;
        gsap.ticker.remove(gsap.updateRoot);
        gsap.ticker.lagSmoothing(0);
        gsapT = gsap.ticker.time || 0;
      }
      return manualMode;
    },
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); return `t=${simT.toFixed(2)} phase=${state.phase}`; },
    async play() {
      const t0 = performance.now();
      trackCard('gacha_start');
      overlay.classList.add('show');
      startLoop();
      uiMod.SFX.init();
      uiMod.SFX.ctx.resume?.();
      uiMod.SFX.ding();
      uiMod.SFX.bgmStart();
      const done = new Promise((res) => { doneResolver = res; });
      // 実カードDOMをそのままテクスチャ化（扇子カットの裏で並行して完了する。
      // ハガキ初登場は dash なので待たずに開演してよい）
      world.refreshHagakiTextures().catch((e) => console.warn('[gacha] face capture failed', e));
      // タップ直後は虹バースト等を挟まず、即「激熱ッ！」へ
      runFrom(DEBUG_PHASE ? Math.max(0, PHASES.findIndex((p) => p.name === DEBUG_PHASE)) : 0);
      await done;
      trackCard('gacha_complete', { duration_sec: Math.round((performance.now() - t0) / 1000) });
      uiMod.SFX.bgmStop();
      await new Promise((res) => {
        overlay.style.transition = 'opacity .45s ease';
        overlay.style.opacity = '0';
        setTimeout(res, 470);
      });
      overlay.classList.remove('show');
      overlay.style.opacity = '';
      overlay.style.transition = '';
      stopLoop();
    },
  };
}

function ensureEngine(cardData) {
  if (!enginePromise) {
    enginePromise = initEngine(cardData).then((e) => (engine = e)).catch((err) => {
      console.error('gacha init failed', err);
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

// ---------- トリガー配線 ----------
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('card-container');
  const card = document.getElementById('card');
  if (!container || !card) return;

  const cardData = getCardData();
  const isEditorOpen = () => document.documentElement.classList.contains('editing-open');

  // 共有リンク経由の閲覧時だけ、演出を裏で先読みしておく（タップ即開演のため）
  if (cardData && !qs.has('nogacha')) {
    const warmup = () => { ensureEngine(cardData).catch(() => { }); };
    if ('requestIdleCallback' in window) requestIdleCallback(warmup, { timeout: 4000 });
    else setTimeout(warmup, 1200);
  }

  const flipToBack = () => {
    card.classList.add('flipped', 'tap-hint-dismissed');
    card.setAttribute('aria-pressed', 'true');
  };

  const intercept = async (e) => {
    if (started) return;                        // 2回目以降は通常のフリップ
    if (isEditorOpen()) return;                 // 編集中は邪魔しない
    if (card.classList.contains('flipped')) return;
    const data = getCardData();
    if (!data || qs.has('nogacha')) return;     // 共有リンク以外は通常動作
    // ここからジョーク: フリップさせずにガチャへ
    e.stopImmediatePropagation();
    e.preventDefault();
    started = true;
    container.removeEventListener('click', intercept, true);
    try {
      const eng = await ensureEngine(data);
      window.__gacha = eng;                     // デバッグ/検証用フック
      await eng.play();
    } catch (err) {
      console.error('gacha failed, falling back to flip', err);
    }
    flipToBack();
  };
  container.addEventListener('click', intercept, true);

  // デバッグ: ?gphase=名前 で即開演
  if (DEBUG_PHASE && cardData) {
    ensureEngine(cardData).then((eng) => {
      window.__gacha = eng;
      started = true;
      eng.play().then(flipToBack);
    }).catch(() => { });
  }
});
