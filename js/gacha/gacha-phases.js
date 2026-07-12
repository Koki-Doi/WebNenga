// 年賀状ガチャのフェーズ定義（ウマ娘ガチャのパロディ / 主役は年賀ハガキ）
// タイムラインは 年賀状2027/gacha-demo の原作準拠実装を単発ガチャ向けに短縮したもの
import { gsap } from 'gsap';
import { state, GACHA } from './gacha-state.js';
import {
  W, setEnv, resetFx,
  showHagaki, setHagakiSilhouette, resetHagakiPose,
} from './gacha-world.js';
import { UI, SFX } from './gacha-ui.js';

const cs = () => W.camState;
// ゲート表示番号は左から 10→1
const GATE_N_X = (n) => (5.5 - n) * 1.45;
const SSR_X = GATE_N_X(GACHA.ssrGate);
const SR_XS = GACHA.srGates.map(GATE_N_X);

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
    showHagaki(false);
    SFX.whoosh(.4);
    setCam(0, 1.6, 2.4, 0, 2.7, -7, 48);
    const f = W.fan3d, fi = W.fan3dInner;
    f.visible = true;
    // 最終位置（視線中心の高さ）でカメラへ正対させてから、開始位置=画面下へ
    f.position.set(.05, 1.42, 1.02);
    f.lookAt(0, 1.6, 2.4);
    f.position.y = .5;
    fi.rotation.set(0, 0, -.42);
    await tk.tw(f.position, { y: 1.42, duration: .42, ease: 'back.out(1.4)' });
    if (tk.cancelled) return;
    // 見得切り: 起こしてから小刻みに扇ぐ
    SFX.thud(); SFX.sparkle(.05);
    tk.tw(fi.rotation, { z: -.07, duration: .38, ease: 'power2.out' });
    await tk.tw(fi.rotation, { x: .06, duration: .15, yoyo: true, repeat: 3, ease: 'sine.inOut' });
    if (tk.cancelled) return;
    await tk.wait(.5);
    if (tk.cancelled) return;
    // 下へ振り抜けて退場
    await tk.tw(f.position, { y: .25, x: -.2, duration: .22, ease: 'power2.in' });
    f.visible = false;
  });

  // ---- 1. 廊下: 年賀ハガキが馬蹄の扉へ舞い飛ぶ ----
  P('dash', async (tk) => {
    resetFx();
    setEnv('corridor');
    showHagaki(true);
    // 視線(ly)とほぼ同じ高さに置き、フレーム下端で切れないようにする
    W.hagaki.position.set(0, 1.62, 1.2);
    W.hagaki.rotation.set(0, 0, 0);
    SFX.whoosh(1.2);
    SFX.sparkle(.4, 1100);
    state.frame = (dt, t) => { flutter(t, 1); };
    setCam(.55, 1.9, 4.4, 0, 1.66, -7, 48);
    await Promise.all([
      tk.tw(W.hagaki.position, { z: -5.4, duration: 2.0, ease: 'power1.in' }),
      tk.tw(cs(), { px: .3, pz: 1.6, py: 1.95, duration: 2.0, ease: 'power1.inOut' }),
    ]);
  });

  // ---- 2. 扉: 馬蹄が発光 → 扉が開いて光が溢れ、ハガキが飛び込む ----
  P('doorOpen', async (tk) => {
    resetFx();
    setEnv('corridor');
    showHagaki(true);
    W.hagaki.position.set(0, 1.75, -5.4);
    setCam(0, 1.6, -2.6, 0, 2.35, -7, 50);
    state.frame = (dt, t) => { flutter(t, .55); };
    // 馬蹄リングが発光（予兆）
    SFX.swell(1.4);
    tk.tw(W.doorShoe.material, { opacity: .95, duration: .75, ease: 'power2.in' });
    tk.tw(state, { bloom: .6, duration: .75 });
    await tk.wait(.75);
    if (tk.cancelled) return;
    // 扉が開く！
    const fx = W.doorFx;
    SFX.clang();
    SFX.whoosh(1.4, .1);
    tk.tw(W.doorL.rotation, { y: 1.05, duration: 1.45, ease: 'power2.in' });
    tk.tw(W.doorR.rotation, { y: -1.05, duration: 1.45, ease: 'power2.in' });
    tk.tw(W.doorShoe.material, { opacity: 0, duration: .7, delay: .35 });
    tk.tw(W.doorInner.material, { opacity: .8, duration: 1.05, ease: 'power2.in' });
    fx.slit.material.opacity = 1;
    tk.tw(fx.slit.scale, { x: 2.0, y: 1.12, duration: 1.45, ease: 'power3.in' });
    tk.tw(fx.glow.material, { opacity: .6, duration: 1.2, ease: 'power2.in' });
    tk.tw(fx.glow.scale, { x: 4.0, y: 4.0, z: 4.0, duration: 1.45, ease: 'power3.in' });
    tk.tw(fx.ring.material, { opacity: .55, duration: .7, delay: .55 });
    tk.tw(fx.ring.scale, { x: 7.5, y: 7.5, z: 7.5, duration: .9, ease: 'power2.in', delay: .55 });
    tk.tw(state, { bloom: .72, duration: 1.35, ease: 'power2.in' });
    tk.tw(state, { shake: .014, duration: 1.2 });
    // ハガキは光へ吸い込まれる
    tk.tw(W.hagaki.position, { z: -6.8, y: 1.9, duration: 1.3, ease: 'power2.in' });
    tk.tw(W.hagaki.scale, { x: .82, y: .82, z: .82, duration: 1.3, ease: 'power2.in' });
    tk.tw(cs(), { pz: -3.3, ly: 2.6, duration: 1.3, ease: 'power1.in' });
    await tk.wait(1.2);
    if (tk.cancelled) return;
    SFX.sparkle(0, 1900);
    await UI.flash(.18, .6, .35);
  });

  // ---- 3. 観客席の真上をペンライトと紙吹雪と共に飛ぶ ----
  P('crowd', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    W.gatesG.visible = false;
    W.amb.intensity = .6; W.amb.color.set(0xb8c8e0);
    W.key.intensity = .85;
    for (const p of W.penlights) p.set(true);
    W.confetti.place({ x: 0, y: 10, z: -31 }, { x: 30, y: 4, z: 8 });
    W.confetti.set(true);
    state.after = .65;
    state.radial = .02;
    state.bloom = .68;
    SFX.whoosh(1.4);
    SFX.sparkle(.3, 1100);
    const pr = { x: -30 };
    state.frame = () => {
      setCam(pr.x, 6.7, -30.2, pr.x + 9, 5.4, -36.5, 58, .02);
    };
    await tk.tw(pr, { x: 26, duration: 1.6, ease: 'power1.inOut' });
  });

  // ---- 4. 芝生レベルへ降りてゲートへ接近（白く飛ぶ） ----
  P('sky', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    W.confetti.place({ x: 0, y: 6, z: 6 }, { x: 16, y: 7, z: 12 });
    W.confetti.set(true);
    W.sparkles.set(true);
    state.bloom = .5;
    state.after = .5;
    SFX.whoosh(1.2);
    SFX.sparkle(.6, 900);
    for (const p of W.penlights) p.set(true);   // 観客席のペンライトは点けたまま
    setCam(-22, 4.4, -10, 25, 1.9, -15, 54);
    await Promise.all([
      tk.tw(cs(), { px: 0, py: 1.8, pz: 12.5, duration: 1.9, ease: 'power1.inOut' }),
      tk.tw(cs(), { lx: 0, ly: 2.3, lz: -5, duration: 1.9, ease: 'power1.inOut' }),
      tk.tw(state, { bloom: 1.15, duration: 1.9, ease: 'power3.in' }),
    ]);
  });

  // ---- 5. 白いフラッシュ遷移 ----
  P('whiteflash', async (tk) => {
    SFX.ding();
    await UI.flash(.22, .7);
  });

  // ---- 6. スタートゲート全景 ----
  P('gateWide', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    for (const p of W.penlights) p.set(true);
    state.bloom = .55;
    W.confetti.place({ x: 0, y: 6, z: 6 }, { x: 16, y: 7, z: 12 });
    W.confetti.set(true);
    W.sparkles.set(true);
    setCam(0, 3.5, 25, 0, 1.9, -5, 50);
    SFX.fanfare(.1);
    state.frame = (dt, t) => {
      for (const go of W.gateObjs) {
        if (go.glow) go.glow.material.opacity = go.isSSR ? .3 + Math.sin(t * 4) * .1 : .6 + Math.sin(t * 4 + go.x) * .3;
      }
    };
    await tk.tw(cs(), { pz: 20, py: 2.85, duration: 1.7, ease: 'power1.inOut' });
  });

  // ---- 7. ゲート横舐めパン（右の1番=金 → 左の10番=虹で金バースト） ----
  P('gatePass', async (tk) => {
    resetFx();
    setSil(false);
    setEnv('race');
    showHagaki(false);
    for (const p of W.penlights) p.set(true);
    state.bloom = .42;
    W.confetti.place({ x: 0, y: 6, z: 6 }, { x: 16, y: 7, z: 12 });
    W.confetti.set(true);
    W.sparkles.set(true);
    const pr = { x: GATE_N_X(1) + 1.5 };
    const srDone = SR_XS.map(() => false);
    let ssrDone = false;
    state.frame = (dt, t) => {
      setCam(pr.x, 1.25, -1.3, pr.x - 1.6, 1.95, -4.6, 46, .035);
      for (const go of W.gateObjs) {
        if (go.glow) go.glow.material.opacity = go.isSSR ? .3 + Math.sin(t * 5) * .1 : .65 + Math.sin(t * 5 + go.x * 2) * .3;
      }
      if (W.ssrPillar) W.ssrPillar.material.opacity = .08 + Math.sin(t * 3) * .04;
      if (W.ssrSheen) W.ssrSheen.material.opacity = .1 + Math.sin(t * 2.6) * .05;
      SR_XS.forEach((sx, i) => {
        if (!srDone[i] && pr.x < sx + 1.55) { srDone[i] = true; SFX.sparkle(0, 1500); SFX.ding(.02); }
      });
      if (!ssrDone && pr.x < SSR_X + 1.7) {
        ssrDone = true;
        SFX.swell(.9); SFX.sparkle(.3, 700);
        state.bloom = .52;
        if (W.ssrBurst) {
          W.ssrBurst.material.opacity = .65;
          gsap.to(W.ssrBurst.scale, { x: 5.5, y: 5.5, z: 5.5, duration: .8, ease: 'power2.out' });
          gsap.to(W.ssrBurst.material, { opacity: 0, duration: .7, delay: .2 });
        }
      }
    };
    SFX.sparkle(.1, 1200);
    await tk.wait(.3);
    if (tk.cancelled) return;
    await tk.tw(pr, { x: SSR_X + 1.55, duration: 3.1, ease: 'power1.inOut' });
  });

  // ---- 8. スタートランプ（消灯 → 赤点灯） ----
  P('lamp', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(false);
    for (const p of W.penlights) p.set(true);
    state.bloom = .45;
    const L = W.lampPos;
    setCam(L.x - .85, L.y - .6, L.z + 2.4, L.x, L.y, L.z - .6, 36);
    SFX.tone(70, .5, 'sine', .35);
    await tk.wait(.6);
    if (tk.cancelled) return;
    W.lampMat.color.setRGB(2.6, 1.5, 1.25);
    W.lampGlow.material.opacity = .9;
    W.lampGlow.scale.setScalar(1.4);
    state.bloom = .75;
    SFX.clang();
    SFX.ding(.04);
    await Promise.all([
      tk.tw(cs(), { fov: 32, duration: .12, ease: 'power3.out' }),
      tk.tw(state, { shake: .012, duration: .1 }),
    ]);
    tk.tw(state, { shake: 0, duration: .4 });
    tk.tw(state, { bloom: .65, duration: .6 });
    await tk.wait(.5);
  });

  // ---- 9. 虹ゲートの中のシルエット ----
  P('goldGate', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(true);
    for (const p of W.penlights) p.set(true);
    // ゲート房の内側（格子扉 z-4.5 の奥）に立たせる。出走前なので回転はさせない
    W.hagaki.position.set(SSR_X, 1.3, -5.0);
    W.hagaki.rotation.set(0, 0, 0);
    // 色は linear 空間: 0.05 でも sRGB では 26% グレーに見えるため大きく絞る
    setHagakiSilhouette(true, .008);
    W.key.intensity = 0;
    W.amb.intensity = .035;
    state.bloom = .38;
    setCam(SSR_X, 1.1, -.1, SSR_X, 1.3, -4.5, 44);
    SFX.swell(1.6);
    const go = W.gateObjs.find((o) => o.isSSR);
    state.frame = (dt, t) => {
      const p = .36 + Math.sin(t * 5.2) * .12;
      if (go.glow) { go.glow.material.opacity = p; go.glow.scale.setScalar(3.4 + Math.sin(t * 5.2) * .4); }
      if (W.ssrSheen) W.ssrSheen.material.opacity = .1 + Math.sin(t * 3.4) * .06;
      // 静かに佇む影（呼吸程度の傾きのみ）
      W.hagakiPivot.rotation.z = Math.sin(t * 2.2) * .03;
    };
    // 縦画面は水平画角が狭い（垂直spanの9/16）ため、幅1.0のハガキが
    // 収まる距離+広めのfovで止める（近づきすぎると左右が見切れる）
    await Promise.all([
      tk.tw(cs(), { pz: -1.0, fov: 42, duration: 1.4, ease: 'power2.inOut' }),
      tk.tw(state, { bloom: .5, duration: 1.4 }),
    ]);
  });

  // ---- 10. ゲートが開いて発走！（ハガキが疾走） ----
  P('run', async (tk) => {
    resetFx();
    setEnv('race');
    showHagaki(true);
    for (const p of W.penlights) p.set(true);
    // ゲート房の内側から発走する（扉が開くのと同時に飛び出す）
    W.hagaki.position.set(SSR_X, 1.25, -5.0);
    const go = W.gateObjs.find((o) => o.isSSR);
    SFX.clang();
    SFX.thud(.05);
    for (const o of W.gateObjs) {
      const d = o === go ? 0 : .05;
      tk.tw(o.doors[0].rotation, { y: -2.4, duration: .28, ease: 'power3.out', delay: d });
      tk.tw(o.doors[1].rotation, { y: 2.4, duration: .28, ease: 'power3.out', delay: d });
    }
    UI.flash(.1, .35);
    // 白いハガキは残像が蓄積しやすいので露出は控えめに
    state.after = .55;
    state.radial = .05;
    state.bloom = .42;
    SFX.gallop();
    SFX.whoosh(1.2, .2);
    state.frame = (dt, t) => {
      const z = W.hagaki.position.z;
      // 振り向きに見えるヨー回転はせず、疾走の煽り揺れのみ
      W.hagakiPivot.rotation.z = Math.sin(t * 7) * .12;
      W.hagakiPivot.rotation.x = Math.sin(t * 9 + .5) * .08;
      // 出走直後のローアングル追走ワンカットで最後まで通す
      // （似たアングルの切り替えを挟むと同じカットが2回に見えるため）
      setCam(
        SSR_X + 1.1 + Math.sin(t * 31) * .03, .65 + Math.sin(t * 41) * .02, z + 2.6,
        SSR_X - .15, 1.05, z - .5, 48
      );
      state.radial = .04;
      state.bloom = .4;
    };
    await tk.tw(W.hagaki.position, { z: 13, duration: 1.9, ease: 'power2.in' });
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
      await UI.typeSpeech(line, tk);
      if (tk.cancelled) break;
      await Promise.race([tk.tap(), tk.wait(1.3)]);
    }
    if (tk.cancelled) return;
    UI.hideSpeech();
  });

  // ---- 13. SSR確定: 年賀状（裏面）がカラーで登場 ----
  P('reveal', async (tk) => {
    resetFx();
    setEnv('reveal');
    W.revealBgPastel.visible = false;
    W.revealBgSky.visible = true;
    showHagaki(true);
    setHagakiSilhouette(false);
    // 裏面（挨拶面）をカメラへ向ける
    W.hagaki.position.set(0, 1.32, 0);
    W.hagaki.rotation.set(0, Math.PI, 0);
    // 白地の年賀状が主役なので露出は絞る
    state.bloom = .33;
    W.revealSpark.set(true);
    W.revealSun.material.opacity = .42;
    W.revealSunCross.material.opacity = .26;
    // ハガキ全体（高さ1.48）が名前帯の上に収まる距離で止める。
    // 視線をやや下(1.2)に置いてカードを画面上寄りに配置
    setCam(0, 1.3, 3.15, 0, 1.2, 0, 38);
    SFX.fanfare();
    UI.showRevealLabels(tk);
    state.frame = (dt, t) => {
      W.hagaki.position.y = 1.32 + Math.sin(t * 1.4) * .02;
      W.hagakiPivot.rotation.z = Math.sin(t * .9) * .02;
      W.hagakiPivot.rotation.y = Math.sin(t * 1.1) * .05;
    };
    tk.tw(cs(), { pz: 2.8, duration: 3.0, ease: 'power1.out' });
    // タップで実物の年賀状へ（長めの保険タイムアウト付き）
    await Promise.race([tk.tap(), tk.wait(30)]);
    if (tk.cancelled) return;
    SFX.ding();
    await UI.flash(.16, .65, .1);
    UI.hideRevealLabels();
  });

  return phases;
}

// goldGate で使う簡易エイリアス（未定義参照防止）
function setSil(v) { setHagakiSilhouette(v); }
