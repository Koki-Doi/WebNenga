// 年賀状ガチャのフェーズ定義（ウマ娘ガチャのパロディ / 主役は年賀ハガキ）
// タイムラインは 年賀状2027/gacha-demo の原作準拠実装を単発ガチャ向けに短縮したもの
import { state, GACHA } from './gacha-state.js';
import {
  W, setEnv, resetFx, setStartLamp, setGateCenterFlash, setRaceDim,
  setGateRevealed, setGatesRevealed, ensureHagakiBack,
  showHagaki, setHagakiSilhouette, resetHagakiPose,
} from './gacha-world.js';
import { UI } from './gacha-ui.js';
import { corridorChase, CORRIDOR_TIMING } from './corridor-camera.js';
import {
  sweepCamera, entryWhite, skyWhite, whipAmount, zoomAmount, SWEEP_HORIZON, SWEEP_VANISH, WHIP_TOWARD,
  gateWideCamera, gatePassCamera, gateFlashAmount, gateWideLight, RACE_CAMERA_TIMING, GATE_PASS_TIMING,
} from './race-layout.js';

const cs = () => W.camState;
// ゲート表示番号は左から 10→1
const GATE_N_X = (n) => (5.5 - n) * 1.45;
const SSR_X = GATE_N_X(GACHA.ssrGate);

function setCam(px, py, pz, lx, ly, lz, fov = 50, roll = 0) {
  Object.assign(cs(), { px, py, pz, lx, ly, lz, fov, roll });
}
// ハガキのはためき（frame フック内で毎フレーム呼ぶ）
// ※ ヨー回転は「振り向き」に見えるため入れない。紙らしい微揺れのみ
function flutter(t, k = 1) {
  const p = W.hagakiPivot;
  if (!p) return;
  p.rotation.z = Math.sin(t * 3.8) * .09 * k;
  p.rotation.x = Math.sin(t * 3.1 + .7) * .07 * k;
  p.rotation.y = Math.sin(t * 2.2) * .04 * k;
  p.position.y = Math.sin(t * 4.6) * .04 * k;
}

export function makePhases() {
  const phases = [];
  const P = (name, enter) => phases.push({ name, enter });

  // ---- 0. 扇子カットイン「激熱ッ！」（廊下を背景に、3Dの紙扇+手を掲げる） ----
  P('fan', async (tk) => {
    resetFx();
    setEnv('corridor');
    state.bloom = 0;
    showHagaki(false);
    setCam(0, 1.6, 2.4, 0, 2.7, -13, 48);
    const f = W.fan3d, fi = W.fan3dInner;
    f.visible = true;
    // 最終位置（視線中心の高さ）でカメラへ正対させてから、開始位置=画面下へ
    f.position.set(.05, 1.42, 1.02);
    f.lookAt(0, 1.6, 2.4);
    f.position.y = .5;
    fi.rotation.set(0, 0, -.42);
    await tk.tw(f.position, { y: 1.42, duration: .33, ease: 'back.out(1.4)' });
    if (tk.cancelled) return;
    // 見得切り: 起こしてから小刻みに扇ぐ。決めの瞬間だけ画面を小さく揺らす
    state.shake = .012;
    tk.tw(state, { shake: 0, duration: .3 });
    tk.tw(fi.rotation, { z: -.07, duration: .22, ease: 'power2.out' });
    await tk.tw(fi.rotation, { x: .06, duration: .12, yoyo: true, repeat: 2, ease: 'sine.inOut' });
    if (tk.cancelled) return;
    await tk.wait(.16);
    if (tk.cancelled) return;
    // 下へ振り抜けて退場
    await tk.tw(f.position, { y: .25, x: -.2, duration: .18, ease: 'power2.in' });
    f.visible = false;
  });

  // ---- 1. 廊下: 年賀ハガキが扉へ遠ざかり、カメラは手前から見送る ----
  P('dash', async (tk) => {
    resetFx();
    setEnv('corridor');
    state.bloom = .2;
    showHagaki(true);
    // 視線(ly)とほぼ同じ高さに置き、フレーム下端で切れないようにする
    W.hagaki.position.set(corridorChase(0).cardX, 1.62, corridorChase(0).cardZ);
    W.hagaki.rotation.set(0, 0, 0);
    // 絨毯に落ちる影と、後ろへこぼれるきらめきで「飛んでいる」ことを見せる
    state.cardShadow = .5;
    state.trail = 30;
    const pr = { progress: 0 };
    state.frame = (dt, t) => {
      const shot = corridorChase(pr.progress);
      Object.assign(cs(), shot.camera);
      // 走って追う手持ちの揺れ。扉へ近づくほど収めて、開扉の構図を安定させる
      const sway = 1 - pr.progress * .7;
      cs().py += Math.sin(t * 11.5) * .026 * sway;
      cs().roll = Math.sin(t * 5.75) * .011 * sway;
      W.hagaki.position.x = shot.cardX;
      W.hagaki.position.z = shot.cardZ;
      state.radial = .012 + .028 * pr.progress * pr.progress;
      flutter(t, 1);
    };
    state.frame(0, 0);
    await tk.tw(pr, { progress: 1, duration: CORRIDOR_TIMING.chase, ease: 'none' });
  });

  // ---- 2. 扉: 合わせ目が発光 → 扉が開いて光が溢れ、ハガキが飛び込む ----
  P('doorOpen', async (tk) => {
    resetFx();
    setEnv('corridor');
    showHagaki(true);
    state.cardShadow = .45;
    state.trail = 34;
    state.whiteAt = [.5, .54];   // 白光は扉の合わせ目から広がる
    W.hagaki.position.set(corridorChase(1).cardX, 1.62, -11.4);
    // 年賀状は扉の軸上に着き、カメラは追走の速度を保って寄る。
    Object.assign(cs(), corridorChase(1).camera);
    state.frame = (dt, t) => { flutter(t, .55); };
    // 合わせ目の光が強まる（予兆）
    tk.tw(W.doorShoe.material, { opacity: .5, duration: CORRIDOR_TIMING.doorApproach, ease: 'power2.in' });
    tk.tw(state, { bloom: .38, duration: CORRIDOR_TIMING.doorApproach });
    tk.tw(W.hagaki.position, { y: 2.2, duration: CORRIDOR_TIMING.doorApproach, ease: 'power1.in' });
    tk.tw(cs(), { pz: -7.5, ly: 3.55, duration: CORRIDOR_TIMING.doorApproach, ease: 'none' });
    // 105枚目に開き始め、110枚目まで0.5秒かけて開き切る。
    tk.tw(W.doorL.rotation, { y: -1.05, duration: CORRIDOR_TIMING.doorSwing,
      delay: CORRIDOR_TIMING.doorSwingDelay, ease: 'power2.inOut' });
    tk.tw(W.doorR.rotation, { y: 1.05, duration: CORRIDOR_TIMING.doorSwing,
      delay: CORRIDOR_TIMING.doorSwingDelay, ease: 'power2.inOut' });
    await tk.wait(CORRIDOR_TIMING.doorApproach);
    if (tk.cancelled) return;
    // 扉が開く！（手前へ観音開き）
    const fx = W.doorFx;
    tk.tw(W.doorShoe.material, { opacity: 0, duration: .14, delay: .06 });
    tk.tw(W.doorInner.material, { opacity: .8, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    fx.slit.material.opacity = 1;
    tk.tw(fx.slit.scale, { x: 2.0, y: 1.12, duration: CORRIDOR_TIMING.doorOpen, ease: 'power3.in' });
    tk.tw(fx.glow.material, { opacity: .6, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    tk.tw(fx.glow.scale, { x: 4.0, y: 4.0, z: 4.0, duration: CORRIDOR_TIMING.doorOpen, ease: 'power3.in' });
    // 合わせ目から放射状の光条が噴き出し、扉の面も光を受けて白く飛ぶ（参考0106）
    tk.tw(fx.rays.material, { opacity: .9, duration: .1 });
    tk.tw(fx.rays.scale, { x: 14, y: 14, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.out' });
    tk.tw(fx.rays.rotation, { z: .3, duration: CORRIDOR_TIMING.doorOpen + CORRIDOR_TIMING.whiteHold, ease: 'none' });
    for (const mat of W.doorMats) {
      tk.tw(mat.color, { r: 2.0, g: 1.5, b: 1.4, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    }
    tk.tw(fx.ring.material, { opacity: .55, duration: .16, delay: .04 });
    tk.tw(fx.ring.scale, { x: 7.5, y: 7.5, z: 7.5, duration: .16, ease: 'power2.in', delay: .04 });
    tk.tw(state, { bloom: .6, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    tk.tw(state, { shake: .014, duration: .15 });
    // ハガキは光へ吸い込まれる（手前開きの扉が十分開いてから隙間を抜ける）
    tk.tw(W.hagaki.position, { z: -12.4, y: 2.45, duration: .28, delay: .12, ease: 'power2.in' });
    tk.tw(W.hagaki.scale, { x: .75, y: .75, z: .75, duration: .28, delay: .12, ease: 'power2.in' });
    tk.tw(cs(), { pz: -8.4, ly: 3.6, duration: CORRIDOR_TIMING.doorOpen, ease: 'none' });
    tk.tw(state, { whiteout: 1, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    await tk.wait(CORRIDOR_TIMING.doorOpen);
    if (tk.cancelled) return;
    state.whiteout = 1;
    await tk.wait(CORRIDOR_TIMING.whiteHold);
  });

  // ---- 3–5. 観客席 → 振り向き → 走路 → 白光（参考 0113–0137）----
  // カメラ・光・ブラーは race-layout.js の「0112 からの秒数」の関数で決まる。3つのフェーズは同じ
  // ひと続きの動きを時間で区切っているだけなので、設定はこの関数にまとめる
  const CROWD_END = RACE_CAMERA_TIMING.crowd;
  const COURSE_END = CROWD_END + RACE_CAMERA_TIMING.course;
  const CUT = COURSE_END + RACE_CAMERA_TIMING.flash + RACE_CAMERA_TIMING.hold;
  function sweepShot(seconds) {
    const cam = sweepCamera(seconds);
    Object.assign(cs(), cam);
    state.whiteFlat = entryWhite(seconds);
    state.skyWhite = skyWhite(seconds);
    state.horizonAt = SWEEP_HORIZON;
    // 振り向きは横へ流れるブラー、白光は消失点へ突っ込むブラー（時間が重ならないので中心を切り替える）
    const whip = whipAmount(seconds), zoom = zoomAmount(seconds);
    state.blurAt = whip > .001 ? WHIP_TOWARD : SWEEP_VANISH;
    state.radial = whip > .001 ? .034 * whip : .012 + .1 * zoom;
    state.after = .12 + .3 * whip;
    state.bloom = .62 + .1 * zoom;
    // 望遠で寄っている間もペンライトの見かけの大きさを保つ（そのままだと巨大な光球になる）
    const scale = Math.tan(cam.fov * Math.PI / 360) / Math.tan(54 * Math.PI / 360);
    for (const lights of W.penlights) lights.pts.material.size = lights.baseSize * scale;
  }
  function sweepSetup() {
    resetFx();
    setEnv('race');
    showHagaki(false);
    // 途中で明るさが変わらないよう、3フェーズとも同じ照明にする
    W.amb.intensity = .82; W.amb.color.set(0xe7f2ff);
    W.key.intensity = 1.08;
    for (const p of W.penlights) p.set(true);
    W.confetti.set(true);
  }
  async function sweepRun(tk, from, to) {
    const clock = { seconds: from };
    state.frame = () => sweepShot(clock.seconds);
    state.frame();
    await tk.tw(clock, { seconds: to, duration: to - from, ease: 'none' });
    if (!tk.cancelled) sweepShot(to);   // トゥイーン完了と描画の順序に依らず、終点の画を確定させる
  }

  // 観客席を正面から捉え、右へ速く横移動する
  P('crowd', async (tk) => {
    sweepSetup();
    W.confetti.place({ x: 13, y: 8, z: 38 }, { x: 7, y: 6, z: 26 });
    await sweepRun(tk, 0, CROWD_END);
  });

  // 右へ振り向いて走路を見通す（フェーズ名は従来の 'sky' のまま）
  P('sky', async (tk) => {
    sweepSetup();
    // 紙吹雪の置き直しは、振り向きのブラーが最も強い瞬間に重なる
    W.confetti.place({ x: 2, y: 8, z: 62 }, { x: 20, y: 6, z: 34 });
    await sweepRun(tk, CROWD_END, COURSE_END);
  });

  // 空が白く飛ぶ。芝は見せたまま前へ突っ込み、その芝の連続でゲート全景へ切り替える
  P('whiteflash', async (tk) => {
    sweepSetup();
    await sweepRun(tk, COURSE_END, CUT);
  });

  // ---- 6. スタートゲート全景（逆光・もや・レンズフレア / 参考0139–0156） ----
  P('gateWide', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    for (const p of W.penlights) p.set(true);
    // 全景ではまだ正体を見せない。全房とも鉄色で、色が付くのは横パンで光った瞬間
    setGatesRevealed(false);
    state.bloom = .5;
    state.flare = 1;
    W.gateHaze.visible = true;
    W.confetti.place({ x: 0, y: 8, z: 14 }, { x: 16, y: 6, z: 22 });
    W.confetti.set(true);
    // 9:16 では横画角が狭い: 全ゲート幅14.8が押し込み終端でも収まる距離を保つ
    const pr = { progress: 0 };
    Object.assign(cs(), gateWideCamera(0));
    // 直前のカットから芝がつながって見えるよう、空の白と消失点へのブラーを引き継いで始める。
    // 白が引くとき、地平線（ゲートの足元）に沿って横一文字の光が残る（参考0138）
    state.skyWhite = 1;
    state.horizonAt = SWEEP_HORIZON;
    state.blurAt = SWEEP_VANISH;
    state.radial = .1;
    tk.tw(state, { radial: 0, duration: .5, ease: 'power2.out' });
    state.frame = (dt, t) => {
      Object.assign(cs(), gateWideCamera(pr.progress));
      state.skyWhite = gateWideLight(pr.progress);
    };
    state.frame(0, 0);
    await tk.tw(pr, { progress: 1, duration: RACE_CAMERA_TIMING.wide, ease: 'none' });
  });

  // ---- 7. ゲート横舐めパン（右の1番=金 → 左の10番=虹。房が中央へ来るたび光の粒があふれる） ----
  P('gatePass', async (tk) => {
    resetFx();
    setSil(false);
    setEnv('race');
    showHagaki(false);
    W.raceRails.visible = false; // 柵は走路全景に残し、ゲートの寄りカットからだけ外す。
    for (const p of W.penlights) p.set(true);
    // 冒頭は全房とも鉄色。房が中央へ来て光の粒があふれた瞬間に、金・虹の正体が現れる
    setGatesRevealed(false);
    const ssrGate = W.gateObjs.find((o) => o.isSSR);
    state.bloom = .4;
    W.confetti.place({ x: 0, y: 7, z: -2 }, { x: 16, y: 5, z: 6 });
    W.confetti.set(true);
    W.sparkles.set(true);
    const pr = { progress: 0 };
    const flashed = new Set();
    // 横パンは1番の正面から始まる。カット直後から光っていると「鉄色→金」の変化が見えないので、
    // 1番だけは時間で光らせる（まず鉄色を見せ、少し置いて光の粒があふれ、その中で金に変わる）
    const smooth = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
    const firstPulse = (s) => smooth((s - .12) / .16) * (1 - smooth((s - .5) / .3));
    let elapsed = 0;
    const amountOf = (n) => (n === 1 ? firstPulse(elapsed) : gateFlashAmount(pr.progress, n));
    state.frame = (dt, t) => {
      elapsed += dt;
      // 扉+番号プレートが1房まるごと入る距離で横パン（格子のドアップにしない）
      const shot = gatePassCamera(pr.progress);
      Object.assign(cs(), shot);
      setGateCenterFlash(pr.progress, t, amountOf);
      for (const go of W.gateObjs) {
        if (go.glow) go.glow.material.opacity = go.isSSR
          ? .44 + Math.sin(t * 5) * .08
          : .28 + Math.sin(t * 5 + go.x * 2) * .08;
        if (!flashed.has(go.n) && amountOf(go.n) > .5) {
          flashed.add(go.n);
          setGateRevealed(go, true);   // 光の粒が扉を覆っている間に色を切り替える
        }
      }
      // 虹の房の光柱と艶も、正体が現れてから
      const ssrShown = ssrGate.revealed ? 1 : 0;
      if (W.ssrPillar) W.ssrPillar.material.opacity = ssrShown * (.08 + Math.sin(t * 3) * .04);
      if (W.ssrSheen) W.ssrSheen.material.opacity = ssrShown * (.1 + Math.sin(t * 2.6) * .05);
      state.bloom = .4 + .14 * gateFlashAmount(pr.progress, GACHA.ssrGate);
    };
    state.frame(0, 0);
    await tk.wait(GATE_PASS_TIMING.settle);
    if (tk.cancelled) return;
    await tk.tw(pr, { progress: 1, duration: GATE_PASS_TIMING.pan, ease: 'none' });
  });

  // ---- 8. スタートランプ（消灯 → 赤点灯 / 参考0226–0235: 見上げの寄り） ----
  P('lamp', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    W.raceRails.visible = false;
    for (const p of W.penlights) p.set(true);
    state.bloom = .45;
    const L = W.lampPos;
    // 低い位置から見上げ、背景を空と雲にする。盤の下に白い切妻屋根が入る距離。
    // 太陽(-Z右上)が画角へ入ると盤面が逆光で潰れるので、右手前から左上を見上げる
    setCam(L.x + .85, L.y - 1.45, L.z + 2.9, L.x - .1, L.y + .12, L.z - .4, 40, .03);
    tk.tw(cs(), { pz: L.z + 2.7, duration: .6, ease: 'none' });    // 点灯を待つ間のにじり寄り
    await tk.wait(.6);
    if (tk.cancelled) return;
    setStartLamp(true);
    state.bloom = .85;
    await Promise.all([
      tk.tw(cs(), { fov: 36, duration: .12, ease: 'power3.out' }),
      tk.tw(state, { shake: .012, duration: .1 }),
    ]);
    tk.tw(state, { shake: 0, duration: .4 });
    tk.tw(state, { bloom: .7, duration: .6 });
    await tk.wait(.78);
  });

  // ---- 9. 虹ゲートの中のシルエット（参考0238–0242: 周囲を落として扉だけを光らせる） ----
  P('goldGate', async (tk) => {
    resetFx({ lampLit: true });
    setEnv('race');
    showHagaki(true);
    for (const p of W.penlights) p.set(true);
    const go = W.gateObjs.find((o) => o.isSSR);
    // ゲート房の内側（格子扉 z-4.5 の奥）に立たせる。出走前なので回転はさせない。
    // 上の格子窓と下アーチの格子窓の両方から影が読める高さ
    W.hagaki.position.set(SSR_X, 1.5, -5.0);
    W.hagaki.rotation.set(0, 0, 0);
    // 実物のハガキを影にするので、房に置いた待機用の影絵は外す
    go.shadow.visible = false;
    // 暗転クローズアップでは足元ミスト・端のウイング柵・ライト無視で白く光る屋根裏が
    // 変な影/まだら/白帯に見えるため隠す（resetFx が戻す）
    W.gateMist.visible = false;
    W.gateWings.visible = false;
    W.standRoofUnder.visible = false;
    // 色は linear 空間: 0.05 でも sRGB では 26% グレーに見えるため大きく絞る
    setHagakiSilhouette(true, .008);
    W.key.intensity = 0;
    W.amb.intensity = .035;
    // 無照明の空・雲・芝も落とし、虹の扉と逆光だけを残す
    setRaceDim(.34);
    state.bloom = .34;
    setCam(SSR_X, .95, .6, SSR_X, 1.55, -4.5, 46);
    state.frame = (dt, t) => {
      const p = .6 + Math.sin(t * 5.2) * .1;
      if (go.glow) { go.glow.material.opacity = p; go.glow.scale.setScalar(4 + Math.sin(t * 5.2) * .25); }
      go.shadowGlow.material.opacity = .8 + Math.sin(t * 5.2 + 1) * .1;
      // 影の真後ろを白く飛ばし、格子越しに黒い輪郭を読ませる
      W.ssrBacklight.material.opacity = .82 + Math.sin(t * 5.2) * .12;
      if (W.ssrSheen) W.ssrSheen.material.opacity = .05 + Math.sin(t * 3.4) * .03;
      // 静かに佇む影（呼吸程度の傾きのみ）
      W.hagakiPivot.rotation.z = Math.sin(t * 2.2) * .03;
    };
    // 縦画面は水平画角が狭い（垂直spanの9/16）ため、扉2枚(幅1.2)が
    // 収まる距離+広めのfovで止める（近づきすぎると左右が見切れる）
    await Promise.all([
      tk.tw(cs(), { pz: -.4, ly: 1.5, fov: 42, duration: .6, ease: 'power2.inOut' }),
      tk.tw(state, { bloom: .46, duration: .6 }),
    ]);
  });

  // ---- 10. ゲートが開いて発走！（ハガキが疾走） ----
  P('run', async (tk) => {
    resetFx({ lampLit: true });
    setEnv('race');
    showHagaki(true);
    // 発走する実カードと重ならないよう、待機用の影は開扉直前に消す。
    for (const o of W.gateObjs) {
      if (o.shadow) o.shadow.visible = false;
      if (o.shadowGlow) o.shadowGlow.visible = false;
    }
    for (const p of W.penlights) p.set(true);
    // ゲート房の内側から発走する（扉が開くのと同時に飛び出す）
    W.hagaki.position.set(SSR_X, 1.25, -5.0);
    const go = W.gateObjs.find((o) => o.isSSR);
    const ssrIndex = W.gateObjs.indexOf(go);
    // ゲート扉の開閉は90°まで（実物と同じ直角ストップ）
    for (const o of W.gateObjs) {
      const d = o === go ? 0 : .05;
      tk.tw(o.doors[0].rotation, { y: -Math.PI / 2, duration: .28, ease: 'power3.out', delay: d });
      tk.tw(o.doors[1].rotation, { y: Math.PI / 2, duration: .28, ease: 'power3.out', delay: d });
    }
    // 開扉の瞬間、虹の房から光の粒が弾ける
    const pop = { v: 1 };
    state.burst = (i) => (i === ssrIndex ? pop.v : 0);
    tk.tw(pop, { v: 0, duration: .5, ease: 'power2.out' });
    UI.flash(.1, .35);
    // 白いハガキは残像が蓄積しやすいので露出は控えめに
    state.after = .55;
    state.radial = .05;
    state.bloom = .42;
    // 芝に落ちる影・きらめきの尾・消失点へ流れるスピード線で速度を見せる
    state.cardShadow = .5;
    state.trail = 70;
    tk.tw(state, { streak: 1, duration: .5, ease: 'power2.in' });
    // 沿道を流れる紙吹雪（手前を高速で通過して速度感を出す / カメラ軸は外してレンズ直撃を避ける）
    W.confetti.place({ x: SSR_X - 1.5, y: 8, z: 15 }, { x: 5.5, y: 6, z: 30 });
    W.confetti.set(true);
    // 加速に合わせて広角化+引き+放射ブラー強化（寄りで詰めず、流れる背景で疾走感を出す）
    const spd = { fov: 50, back: 3.0, rad: .045 };
    tk.tw(spd, { fov: 64, back: 4.0, rad: .085, duration: 1.1, ease: 'power2.in' });
    state.frame = (dt, t) => {
      const z = W.hagaki.position.z;
      // 振り向きに見えるヨー回転はせず、疾走の煽り揺れのみ
      W.hagakiPivot.rotation.z = Math.sin(t * 7) * .12;
      W.hagakiPivot.rotation.x = Math.sin(t * 9 + .5) * .08;
      // 出走直後のローアングル追走ワンカットで最後まで通す
      // （似たアングルの切り替えを挟むと同じカットが2回に見えるため）
      setCam(
        SSR_X + 1.3 + Math.sin(t * 31) * .04, .55 + Math.sin(t * 41) * .03, z + spd.back,
        SSR_X - .3, 1.15, z - 1.2, spd.fov
      );
      state.radial = spd.rad;
      state.bloom = .4;
    };
    await tk.tw(W.hagaki.position, { z: 25, duration: 1.1, ease: 'power2.in' });
    if (tk.cancelled) return;
    await UI.flash(.14, .6);
  });

  // ---- 11. セリフ（パステル画面） ----
  P('speech', async (tk) => {
    resetFx();
    setEnv('none');
    showHagaki(false);
    UI.showSpeech();
    // 挨拶面の撮影(html2canvas)は主スレッドを数百ms使う。3Dの動きが無いこの画面で、
    // セリフの登場アニメが走り出してから始める（確定画面はこの完了を待つ）
    tk.wait(.7).then(() => {
      if (tk.cancelled) return;
      UI.prelayout('gc-reveal-ui');   // 確定画面の文字組みも、止まっているこの間に済ませる
      ensureHagakiBack();
    });
    for (const line of GACHA.speechLines) {
      if (tk.cancelled) break;
      await UI.animateSpeech(line, tk);
      if (tk.cancelled) break;
      const how = await Promise.race([tk.tap().then(() => 'tap'), tk.wait(3.0).then(() => 'auto')]);
      if (tk.cancelled) break;
      if (how === 'tap') state.speechTaps++; else state.speechAuto++;
    }
    if (tk.cancelled) return;
    UI.hideSpeech();
  });

  // ---- 13. SSR確定: 年賀状（裏面）がカラーで登場 ----
  P('reveal', async (tk) => {
    resetFx();
    setEnv('reveal');
    // 最終結果は実カードの色を優先し、演出用の彩度・暖色・ビネット補正を外す。
    W.renderer.toneMappingExposure = 1;
    W.gradePass.uniforms.grade.value = 0;
    W.revealBgPastel.visible = false;
    W.revealBgSky.visible = true;
    // 挨拶面の画像ができるまではカードを出さない（SKIP直後など、まだ撮れていない場合がある）。
    // 予備の手描きを一瞬見せてから差し替わると、レイアウトが跳ねて見えるため
    showHagaki(false);
    state.bloom = .04;
    setCam(0, 1.3, 3.4, 0, 1.2, 0, 38);
    await Promise.race([ensureHagakiBack(), tk.wait(4)]);
    if (tk.cancelled) return;
    showHagaki(true);
    setHagakiSilhouette(false);
    // 裏面（挨拶面）をカメラへ向ける
    W.hagaki.position.set(0, 1.32, 0);
    W.hagaki.rotation.set(0, Math.PI, 0);
    // 白地の年賀状が主役なので露出は絞る
    state.bloom = .04;
    W.revealSpark.set(true);
    W.revealSun.material.opacity = .18;
    W.revealSunCross.material.opacity = .1;
    // ハガキ全体（高さ1.48）が名前帯の上に収まる距離で止める。
    // 視線をやや下(1.2)に置いてカードを画面上寄りに配置
    setCam(0, 1.3, 3.4, 0, 1.2, 0, 38);
    UI.showRevealLabels(tk);
    // 登場: 小さく傾いた状態から弾むように収まり、背後で光輪が広がる（振り向きに見えるヨー回転はしない）
    W.hagaki.scale.setScalar(.5);
    W.hagakiPivot.rotation.z = -.2;
    tk.tw(W.hagaki.scale, { x: 1, y: 1, z: 1, duration: .5, ease: 'back.out(1.8)' });
    tk.tw(W.hagakiPivot.rotation, { z: 0, duration: .6, ease: 'back.out(2.2)' });
    W.revealRing.material.opacity = .85;
    tk.tw(W.revealRing.scale, { x: 8, y: 8, z: 8, duration: .65, ease: 'power2.out' });
    tk.tw(W.revealRing.material, { opacity: 0, duration: .65, ease: 'power2.in' });
    tk.tw(W.revealRays.material, { opacity: .42, duration: .6, ease: 'power2.out' });
    // 最終カードは静止させ、細線テクスチャの時間方向エイリアシングを防ぐ。
    // 動かすのは背後の後光だけ
    state.frame = (dt, t) => { W.revealRays.rotation.z = t * .07; };
    tk.tw(cs(), { pz: 3.0, duration: 3.0, ease: 'power1.out' });
    // タップで実物の年賀状へ（長めの保険タイムアウト付き）
    const exit = await Promise.race([tk.tap().then(() => 'tap'), tk.wait(30).then(() => 'timeout')]);
    if (tk.cancelled) return;
    state.revealExit = exit;
    await UI.flash(.16, .65, .1);
    UI.hideRevealLabels();
  });

  return phases;
}

// goldGate で使う簡易エイリアス（未定義参照防止）
function setSil(v) { setHagakiSilhouette(v); }
