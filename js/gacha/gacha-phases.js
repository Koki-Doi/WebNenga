// 年賀状ガチャのフェーズ定義（ウマ娘ガチャのパロディ / 主役は年賀ハガキ）
// タイムラインは 年賀状2027/gacha-demo の原作準拠実装を単発ガチャ向けに短縮したもの
import { state, GACHA } from './gacha-state.js';
import {
  W, setEnv, resetFx, setStartLamp, setGateCenterFlash,
  showHagaki, setHagakiSilhouette, resetHagakiPose,
} from './gacha-world.js';
import { UI, SFX } from './gacha-ui.js';
import { corridorChase, CORRIDOR_TIMING } from './corridor-camera.js';
import { crowdCamera, courseCamera, flashCamera, gateWideCamera, gatePassCamera, gateFlashAmount, courseLight, courseWhip, flashLight, gateWideLight, RACE_CAMERA_TIMING, GATE_PASS_TIMING } from './race-layout.js';

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
    SFX.whoosh(.4);
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
    // 見得切り: 起こしてから小刻みに扇ぐ
    SFX.thud(); SFX.sparkle(.05);
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
    state.bloom = .18;
    showHagaki(true);
    // 視線(ly)とほぼ同じ高さに置き、フレーム下端で切れないようにする
    W.hagaki.position.set(corridorChase(0).cardX, 1.62, corridorChase(0).cardZ);
    W.hagaki.rotation.set(0, 0, 0);
    SFX.whoosh(.8);
    SFX.sparkle(.4, 1100);
    const pr = { progress: 0 };
    state.frame = (dt, t) => {
      const shot = corridorChase(pr.progress);
      Object.assign(cs(), shot.camera);
      W.hagaki.position.x = shot.cardX;
      W.hagaki.position.z = shot.cardZ;
      state.radial = .012 + .028 * pr.progress * pr.progress;
      flutter(t, 1);
    };
    state.frame();
    await tk.tw(pr, { progress: 1, duration: CORRIDOR_TIMING.chase, ease: 'none' });
  });

  // ---- 2. 扉: 合わせ目が発光 → 扉が開いて光が溢れ、ハガキが飛び込む ----
  P('doorOpen', async (tk) => {
    resetFx();
    setEnv('corridor');
    showHagaki(true);
    W.hagaki.position.set(corridorChase(1).cardX, 1.62, -11.4);
    // 年賀状は扉の軸上に着き、カメラは追走の速度を保って寄る。
    Object.assign(cs(), corridorChase(1).camera);
    state.frame = (dt, t) => { flutter(t, .55); };
    // 合わせ目の光が強まる（予兆）
    SFX.swell(.8);
    tk.tw(W.doorShoe.material, { opacity: .5, duration: CORRIDOR_TIMING.doorApproach, ease: 'power2.in' });
    tk.tw(state, { bloom: .38, duration: CORRIDOR_TIMING.doorApproach });
    tk.tw(W.hagaki.position, { y: 2.25, duration: CORRIDOR_TIMING.doorApproach, ease: 'power1.in' });
    tk.tw(cs(), { pz: -7.5, ly: 3.7, duration: CORRIDOR_TIMING.doorApproach, ease: 'none' });
    // 105枚目に開き始め、110枚目まで0.5秒かけて開き切る。
    tk.tw(W.doorL.rotation, { y: -1.05, duration: CORRIDOR_TIMING.doorSwing,
      delay: CORRIDOR_TIMING.doorSwingDelay, ease: 'power2.inOut' });
    tk.tw(W.doorR.rotation, { y: 1.05, duration: CORRIDOR_TIMING.doorSwing,
      delay: CORRIDOR_TIMING.doorSwingDelay, ease: 'power2.inOut' });
    await tk.wait(CORRIDOR_TIMING.doorApproach);
    if (tk.cancelled) return;
    // 扉が開く！（手前へ観音開き）
    const fx = W.doorFx;
    SFX.clang();
    SFX.whoosh(1.4, .1);
    tk.tw(W.doorShoe.material, { opacity: 0, duration: .14, delay: .06 });
    tk.tw(W.doorInner.material, { opacity: .8, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    fx.slit.material.opacity = 1;
    tk.tw(fx.slit.scale, { x: 2.0, y: 1.12, duration: CORRIDOR_TIMING.doorOpen, ease: 'power3.in' });
    tk.tw(fx.glow.material, { opacity: .6, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    tk.tw(fx.glow.scale, { x: 4.0, y: 4.0, z: 4.0, duration: CORRIDOR_TIMING.doorOpen, ease: 'power3.in' });
    tk.tw(fx.ring.material, { opacity: .55, duration: .16, delay: .04 });
    tk.tw(fx.ring.scale, { x: 7.5, y: 7.5, z: 7.5, duration: .16, ease: 'power2.in', delay: .04 });
    tk.tw(state, { bloom: .52, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    tk.tw(state, { shake: .014, duration: .15 });
    // ハガキは光へ吸い込まれる（手前開きの扉が十分開いてから隙間を抜ける）
    tk.tw(W.hagaki.position, { z: -12.4, y: 2.55, duration: .28, delay: .12, ease: 'power2.in' });
    tk.tw(W.hagaki.scale, { x: .75, y: .75, z: .75, duration: .28, delay: .12, ease: 'power2.in' });
    tk.tw(cs(), { pz: -8.4, ly: 3.75, duration: CORRIDOR_TIMING.doorOpen, ease: 'none' });
    tk.tw(state, { whiteout: 1, duration: CORRIDOR_TIMING.doorOpen, ease: 'power2.in' });
    await tk.wait(CORRIDOR_TIMING.doorOpen);
    if (tk.cancelled) return;
    SFX.sparkle(0, 1900);
    state.whiteout = 1;
    await tk.wait(CORRIDOR_TIMING.whiteHold);
  });

  // ---- 3. コース左側の観客席に沿って移動 ----
  P('crowd', async (tk) => {
    resetFx();
    state.whiteout = 1;
    tk.tw(state, { whiteout: 0, duration: RACE_CAMERA_TIMING.entryReveal, ease: 'power1.inOut' });
    setEnv('race');
    showHagaki(false);
    W.amb.intensity = .82; W.amb.color.set(0xe7f2ff);
    W.key.intensity = 1.08;
    for (const p of W.penlights) p.set(true);
    W.confetti.place({ x: 13, y: 8, z: 35 }, { x: 7, y: 6, z: 24 });
    W.confetti.set(true);
    state.after = .12;
    state.radial = .008;
    state.bloom = .68;
    SFX.whoosh(1.4);
    SFX.sparkle(.3, 1100);
    const pr = { progress: 0 };
    state.frame = () => {
      Object.assign(cs(), crowdCamera(pr.progress));
    };
    state.frame();
    await tk.tw(pr, { progress: 1, duration: RACE_CAMERA_TIMING.crowd, ease: 'none' });
  });

  // ---- 4. 芝生レベルへ降りてゲートと反対方向の走路を見通す ----
  P('sky', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    W.confetti.place({ x: 2, y: 8, z: 55 }, { x: 20, y: 6, z: 30 });
    W.confetti.set(true);
    W.sparkles.set(true);
    state.bloom = .5;
    state.after = .18;
    state.radial = .008;
    SFX.whoosh(.8);
    SFX.sparkle(.6, 900);
    for (const p of W.penlights) p.set(true);   // 観客席のペンライトは点けたまま
    const pr = { progress: 0 };
    state.frame = () => {
      Object.assign(cs(), courseCamera(pr.progress));
      state.whiteout = courseLight(pr.progress);
      const whip = courseWhip(pr.progress);
      state.radial = .008 + .085 * whip + .03 * pr.progress * pr.progress;
      state.after = .12 + .16 * whip;
    };
    state.frame();
    await Promise.all([
      tk.tw(pr, { progress: 1, duration: RACE_CAMERA_TIMING.course, ease: 'none' }),
      tk.tw(state, { bloom: .65, duration: RACE_CAMERA_TIMING.course, ease: 'power3.in' }),
    ]);
  });

  // ---- 5. 白いフラッシュ遷移 ----
  P('whiteflash', async (tk) => {
    SFX.ding();
    const pr = { progress: 0 };
    state.frame = () => {
      Object.assign(cs(), flashCamera(pr.progress));
      state.whiteout = flashLight(pr.progress);
    };
    state.frame();
    await tk.tw(pr, { progress: 1, duration: RACE_CAMERA_TIMING.flash, ease: 'none' });
    // GSAP完了と描画RAFの順序に依存せず、白いフレームを確実に挟む。
    state.frame();
    await tk.wait(RACE_CAMERA_TIMING.hold);
  });

  // ---- 6. スタートゲート全景 ----
  P('gateWide', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    for (const p of W.penlights) p.set(true);
    state.bloom = .42;
    W.confetti.place({ x: 0, y: 8, z: 14 }, { x: 16, y: 6, z: 22 });
    W.confetti.set(true);
    W.sparkles.set(true);
    // 9:16 では横画角が狭い: 全ゲート幅14.8が押し込み終端でも収まる距離を保つ
    const pr = { progress: 0 };
    Object.assign(cs(), gateWideCamera(0));
    state.whiteout = 1;
    SFX.fanfare(.1);
    state.frame = (dt, t) => {
      Object.assign(cs(), gateWideCamera(pr.progress));
      state.whiteout = gateWideLight(pr.progress);
      for (const go of W.gateObjs) {
        if (go.glow) go.glow.material.opacity = go.isSSR
          ? .42 + Math.sin(t * 4) * .07
          : .28 + Math.sin(t * 4 + go.x) * .08;
      }
    };
    await tk.tw(pr, { progress: 1, duration: RACE_CAMERA_TIMING.wide, ease: 'none' });
  });

  // ---- 7. ゲート横舐めパン（右の1番=金 → 左の10番=虹で金バースト） ----
  P('gatePass', async (tk) => {
    resetFx();
    setSil(false);
    setEnv('race');
    showHagaki(false);
    W.raceRails.visible = false; // 柵は走路全景に残し、ゲートの寄りカットからだけ外す。
    for (const p of W.penlights) p.set(true);
    state.bloom = .34;
    W.confetti.place({ x: 0, y: 7, z: -2 }, { x: 16, y: 5, z: 6 });
    W.confetti.set(true);
    W.sparkles.set(true);
    const pr = { progress: 0 };
    const flashed = new Set();
    state.frame = (dt, t) => {
      // 扉+番号プレートが1房まるごと入る距離で横パン（格子のドアップにしない）
      const shot = gatePassCamera(pr.progress);
      Object.assign(cs(), shot);
      setGateCenterFlash(pr.progress, t);
      for (const go of W.gateObjs) {
        if (go.glow) go.glow.material.opacity = go.isSSR
          ? .44 + Math.sin(t * 5) * .08
          : .28 + Math.sin(t * 5 + go.x * 2) * .08;
        if (!flashed.has(go.n) && gateFlashAmount(pr.progress, go.n) > .5) {
          flashed.add(go.n);
          SFX.sparkle(0, go.isSR ? 1500 : 1200);
          if (go.isSR) SFX.ding(.02);
          if (go.isSSR) SFX.swell(.7);
        }
      }
      if (W.ssrPillar) W.ssrPillar.material.opacity = .08 + Math.sin(t * 3) * .04;
      if (W.ssrSheen) W.ssrSheen.material.opacity = .1 + Math.sin(t * 2.6) * .05;
      state.bloom = .34 + .11 * gateFlashAmount(pr.progress, GACHA.ssrGate);
    };
    SFX.sparkle(.1, 1200);
    state.frame(0, 0);
    await tk.wait(GATE_PASS_TIMING.settle);
    if (tk.cancelled) return;
    await tk.tw(pr, { progress: 1, duration: GATE_PASS_TIMING.pan, ease: 'none' });
  });

  // ---- 8. スタートランプ（消灯 → 赤点灯） ----
  P('lamp', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    W.raceRails.visible = false;
    for (const p of W.penlights) p.set(true);
    state.bloom = .45;
    const L = W.lampPos;
    // ランプ盤(0.78角)が支柱・トラスごと収まる距離（縦画面は横が狭いので広めに）
    setCam(L.x - 1.15, L.y - .7, L.z + 3.3, L.x, L.y, L.z - .6, 40);
    SFX.tone(70, .5, 'sine', .35);
    await tk.wait(.6);
    if (tk.cancelled) return;
    setStartLamp(true);
    state.bloom = .75;
    SFX.clang();
    SFX.ding(.04);
    await Promise.all([
      tk.tw(cs(), { fov: 36, duration: .12, ease: 'power3.out' }),
      tk.tw(state, { shake: .012, duration: .1 }),
    ]);
    tk.tw(state, { shake: 0, duration: .4 });
    tk.tw(state, { bloom: .65, duration: .6 });
    await tk.wait(.78);
  });

  // ---- 9. 虹ゲートの中のシルエット ----
  P('goldGate', async (tk) => {
    resetFx({ lampLit: true });
    setEnv('race');
    showHagaki(true);
    for (const p of W.penlights) p.set(true);
    // ゲート房の内側（格子扉 z-4.5 の奥）に立たせる。出走前なので回転はさせない
    W.hagaki.position.set(SSR_X, 1.3, -5.0);
    W.hagaki.rotation.set(0, 0, 0);
    // 暗転クローズアップでは足元ミスト・端のウイング柵・ライト無視で白く光る屋根裏が
    // 変な影/まだら/白帯に見えるため隠す（resetFx が戻す）
    W.gateMist.visible = false;
    W.gateWings.visible = false;
    W.standRoofUnder.visible = false;
    // 色は linear 空間: 0.05 でも sRGB では 26% グレーに見えるため大きく絞る
    setHagakiSilhouette(true, .008);
    W.key.intensity = 0;
    W.amb.intensity = .035;
    state.bloom = .3;
    setCam(SSR_X, 1.15, .5, SSR_X, 1.5, -4.5, 46);
    SFX.swell(.7);
    const go = W.gateObjs.find((o) => o.isSSR);
    if (go.shadowGlow) go.shadowGlow.material.opacity = .18;
    state.frame = (dt, t) => {
      const p = .36 + Math.sin(t * 5.2) * .07;
      if (go.glow) { go.glow.material.opacity = p; go.glow.scale.setScalar(4 + Math.sin(t * 5.2) * .25); }
      if (W.ssrSheen) W.ssrSheen.material.opacity = .1 + Math.sin(t * 3.4) * .06;
      // 静かに佇む影（呼吸程度の傾きのみ）
      W.hagakiPivot.rotation.z = Math.sin(t * 2.2) * .03;
    };
    // 縦画面は水平画角が狭い（垂直spanの9/16）ため、幅1.0のハガキが
    // 収まる距離+広めのfovで止める（近づきすぎると左右が見切れる）
    await Promise.all([
      tk.tw(cs(), { pz: -.55, ly: 1.38, fov: 42, duration: .6, ease: 'power2.inOut' }),
      tk.tw(state, { bloom: .42, duration: .6 }),
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
    SFX.clang();
    SFX.thud(.05);
    // ゲート扉の開閉は90°まで（実物と同じ直角ストップ）
    for (const o of W.gateObjs) {
      const d = o === go ? 0 : .05;
      tk.tw(o.doors[0].rotation, { y: -Math.PI / 2, duration: .28, ease: 'power3.out', delay: d });
      tk.tw(o.doors[1].rotation, { y: Math.PI / 2, duration: .28, ease: 'power3.out', delay: d });
    }
    UI.flash(.1, .35);
    // 白いハガキは残像が蓄積しやすいので露出は控えめに
    state.after = .55;
    state.radial = .05;
    state.bloom = .42;
    SFX.gallop();
    SFX.whoosh(1.2, .2);
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
    SFX.whoosh(.5);
    await UI.flash(.14, .6);
  });

  // ---- 11. セリフ（パステル画面） ----
  P('speech', async (tk) => {
    resetFx();
    setEnv('none');
    showHagaki(false);
    UI.showSpeech();
    for (const line of GACHA.speechLines) {
      if (tk.cancelled) break;
      SFX.sparkle(.05, 1400);
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
    SFX.fanfare();
    UI.showRevealLabels(tk);
    // 最終カードは静止させ、細線テクスチャの時間方向エイリアシングを防ぐ。
    state.frame = null;
    tk.tw(cs(), { pz: 3.0, duration: 3.0, ease: 'power1.out' });
    // タップで実物の年賀状へ（長めの保険タイムアウト付き）
    const exit = await Promise.race([tk.tap().then(() => 'tap'), tk.wait(30).then(() => 'timeout')]);
    if (tk.cancelled) return;
    state.revealExit = exit;
    SFX.ding();
    await UI.flash(.16, .65, .1);
    UI.hideRevealLabels();
  });

  return phases;
}

// goldGate で使う簡易エイリアス（未定義参照防止）
function setSil(v) { setHagakiSilhouette(v); }
