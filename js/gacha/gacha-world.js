// Three.js ワールド構築: レンダラ / ポスト / 廊下 / 競馬場+ゲート / 確定背景 / 年賀ハガキ3D
// （年賀状2027/gacha-demo の world.js を WebNenga 向けに移植。VRMの代わりに年賀ハガキを主役にする）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { state, GACHA } from './gacha-state.js';
import { sharedGeometry, fanSectorGeometry, rodBetween, instancedRods, batchStaticMeshes } from './model-geometry.js';
import { RACE_LAYOUT, gateFlashAmount } from './race-layout.js';
import { buildFanHand } from './fan-hand.js';
import { buildStandAudience } from './stand-audience.js';
import {
  GATE_LEAF, paintGateLeaf, paintGatePlate, paintCrestScroll, paintGateEmblem,
  paintSky, paintCloud, paintTurf, paintRays,
} from './race-art.js';
import { GateBursts, SpeedStreaks, SparkTrail } from './gacha-fx.js';

export const W = {};
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- canvas テクスチャ ----------
function ct(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = opts.anisotropy ?? 4;
  // 透過の縁が黒ずまないよう、切り抜き用は乗算済みアルファで持つ（cutout マテリアルと対）
  if (opts.premultiply) tx.premultiplyAlpha = true;
  if (opts.repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(...opts.repeat); }
  return tx;
}
function radialGrad(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  return gr;
}

const TEX = {};
let TOON_GRADIENT = null;
function buildTextures() {
  TEX.carpet = ct(512, 1024, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#8b2830'); base.addColorStop(.5, '#b74442'); base.addColorStop(1, '#8b2830');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = `rgba(255,203,144,${rand(.015, .06)})`;
      g.fillRect(rand(0, w), rand(0, h), 1, 3);
    }
    g.strokeStyle = '#d2a35e';
    for (const [x, lineWidth] of [[17, 8], [32, 3], [53, 2]]) {
      g.lineWidth = lineWidth;
      for (const side of [x, w - x]) { g.beginPath(); g.moveTo(side, 0); g.lineTo(side, h); g.stroke(); }
    }
    const leaf = (x, y, angle, size) => {
      g.save(); g.translate(x, y); g.rotate(angle);
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(-size * .55, -size * .42, -size * .3, -size * .8, 0, -size);
      g.bezierCurveTo(size * .3, -size * .7, size * .4, -size * .22, 0, 0);
      g.fill(); g.restore();
    };
    for (let cy = 128; cy < h; cy += 256) {
      g.save(); g.translate(w / 2, cy);
      g.fillStyle = '#d49c4b'; g.strokeStyle = '#d49c4b'; g.lineWidth = 3;
      // 左右に広がる蔓と、小葉を連ねた花輪。
      for (const side of [-1, 1]) {
        g.save(); g.scale(side, 1);
        g.beginPath(); g.moveTo(0, -106);
        g.bezierCurveTo(164, -99, 218, -22, 140, 53);
        g.bezierCurveTo(113, 86, 139, 110, 185, 104); g.stroke();
        for (let i = 0; i < 16; i++) {
          const angle = -.95 + i / 15 * 2.6;
          const x = 145 + Math.cos(angle) * 42, y = Math.sin(angle) * 88;
          leaf(x, y, angle + .7, 22);
          leaf(x - 17, y - 4, angle - 1.1, 18);
        }
        g.restore();
      }
      // 中央の小さなロゼットと上下のパルメット。
      g.fillStyle = '#e0af64';
      for (let i = 0; i < 12; i++) leaf(0, 0, i / 12 * TAU, 36);
      for (const side of [-1, 1]) {
        g.save(); g.scale(1, side);
        for (let i = -3; i <= 3; i++) leaf(0, -67, i * .19, 35 - Math.abs(i) * 3);
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
      g.restore();
    }
  }, { repeat: [1, 3.5] });

  TEX.marbleFloor = ct(512, 512, (g, w, h) => {
    const mg = g.createLinearGradient(0, 0, w, 0);
    mg.addColorStop(0, '#6e4b3b');
    mg.addColorStop(.12, '#b58b69');
    mg.addColorStop(.5, '#d5b58b');
    mg.addColorStop(.88, '#b58b69');
    mg.addColorStop(1, '#6e4b3b');
    g.fillStyle = mg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,236,196,.28)'; g.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(-20, y);
      g.bezierCurveTo(w * .3, y + rand(-22, 22), w * .65, y + rand(-26, 26), w + 20, y + rand(-18, 18));
      g.stroke();
    }
    g.fillStyle = '#8e552f'; g.fillRect(64, 0, 10, h); g.fillRect(w - 74, 0, 10, h);
    g.fillStyle = '#e0b661'; g.fillRect(79, 0, 4, h); g.fillRect(w - 83, 0, 4, h);
  }, { repeat: [1, 5] });

  TEX.wall = ct(512, 512, (g, w, h) => {
    const panel = g.createLinearGradient(0, 0, 0, h);
    panel.addColorStop(0, '#a06b4f');
    panel.addColorStop(.48, '#86533d');
    panel.addColorStop(1, '#4d2923');
    g.fillStyle = panel; g.fillRect(0, 0, w, h);

    g.fillStyle = radialGrad(g, w / 2, 42, 150, [
      [0, 'rgba(255,196,119,.34)'],
      [.58, 'rgba(222,126,62,.10)'],
      [1, 'rgba(40,10,6,0)'],
    ]);
    g.fillRect(0, 0, w, h * .58);

    const wood = g.createLinearGradient(0, 0, 46, 0);
    wood.addColorStop(0, '#3a1e18'); wood.addColorStop(.48, '#754632'); wood.addColorStop(1, '#321812');
    for (const x of [0, w - 46]) {
      g.fillStyle = wood; g.fillRect(x, 0, 46, h);
      g.fillStyle = '#b77b2d'; g.fillRect(x + (x ? 0 : 38), 0, 7, h);
      g.fillStyle = '#d2a653'; g.fillRect(x - 4, 68, 54, 13);
      g.fillRect(x - 4, h - 86, 54, 12);
    }

    // 原作の壁は、暖かい木地に大きな長方形の額縁が並ぶ。
    g.fillStyle = 'rgba(84,43,32,.38)';
    g.fillRect(70, 122, w - 140, 242);
    g.strokeStyle = '#c89a55'; g.lineWidth = 10; g.strokeRect(65, 115, w - 130, 255);
    g.strokeStyle = 'rgba(255,226,164,.84)'; g.lineWidth = 3; g.strokeRect(81, 131, w - 162, 223);
    g.strokeStyle = 'rgba(111,67,48,.94)'; g.lineWidth = 15; g.strokeRect(103, 153, w - 206, 179);

    g.fillStyle = '#4a2824'; g.fillRect(0, h * .70, w, h * .30);
    g.fillStyle = '#a66f31'; g.fillRect(0, h * .685, w, 12);
    g.fillStyle = '#e0b45d'; g.fillRect(0, h * .715, w, 6);
    g.fillStyle = 'rgba(255,226,157,.42)'; g.fillRect(0, h * .91, w, 3);
  }, { repeat: [10, 1] });

  // 格天井: 1タイルが灯り1列ぶん(2.8m)。暖色の間接光がにじむ明るい鏡板にする（参考0082–0104）
  TEX.ceiling = ct(512, 256, (g, w, h) => {
    g.fillStyle = '#3d2018'; g.fillRect(0, 0, w, h);
    const coffer = g.createLinearGradient(0, 0, w, 0);
    coffer.addColorStop(0, '#4f2b1f'); coffer.addColorStop(.5, '#74432c'); coffer.addColorStop(1, '#4f2b1f');
    g.fillStyle = coffer; g.fillRect(34, 14, w - 68, h - 28);
    g.strokeStyle = '#a97a3a'; g.lineWidth = 5; g.strokeRect(34, 14, w - 68, h - 28);
    g.strokeStyle = 'rgba(255,225,160,.32)'; g.lineWidth = 2; g.strokeRect(46, 26, w - 92, h - 52);
    // 埋込灯: 白い芯 + 大きな橙のにじみ
    for (const x of [118, 256, 394]) {
      g.fillStyle = radialGrad(g, x, h / 2, 74, [
        [0, 'rgba(255,240,200,.95)'], [.13, 'rgba(255,208,130,.82)'],
        [.42, 'rgba(240,150,80,.24)'], [1, 'rgba(230,130,70,0)'],
      ]);
      g.fillRect(x - 74, 0, 148, h);
    }
  }, { repeat: [1, 26 / 2.8] });
  TEX.ceiling.offset.y = .7143;   // 3Dの埋込灯(z=1.2-2.8k)がタイル中央に来る位相

  // movie/frames 0095–0106: 赤茶の木製扉。合わせ目側に細い鏡板、吊元側に広い鏡板。
  // 鏡板の落とし込みは陰影で描き込む（右扉。左扉は左右反転して描く）
  const doorWood = (mirror) => ct(512, 1024, (g, w, h) => {
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#863631'); base.addColorStop(.3, '#74302c'); base.addColorStop(1, '#521f20');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) {
      g.strokeStyle = `rgba(34,10,8,${rand(.02, .07)})`;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, h * .3, x - 3, h * .7, x, h); g.stroke();
    }
    for (const [x0, x1] of [[.165, .335], [.47, .885]]) {
      const px = x0 * w, pw = (x1 - x0) * w, py = h * .05, ph = h * .905;
      // 外周の面取り（上と左が明、下と右が暗）
      g.fillStyle = 'rgba(190,104,88,.75)'; g.fillRect(px - 9, py - 9, pw + 18, 9); g.fillRect(px - 9, py - 9, 9, ph + 18);
      g.fillStyle = 'rgba(42,12,12,.6)'; g.fillRect(px - 9, py + ph, pw + 18, 9); g.fillRect(px + pw, py - 9, 9, ph + 18);
      const inset = g.createLinearGradient(0, py, 0, py + ph);
      inset.addColorStop(0, '#632725'); inset.addColorStop(.5, '#5a2222'); inset.addColorStop(1, '#42181a');
      g.fillStyle = inset; g.fillRect(px, py, pw, ph);
      // 落とし込みの内側: 上と左に影、下と右に反射
      const top = g.createLinearGradient(0, py, 0, py + 34);
      top.addColorStop(0, 'rgba(22,6,8,.6)'); top.addColorStop(1, 'rgba(22,6,8,0)');
      g.fillStyle = top; g.fillRect(px, py, pw, 34);
      const left = g.createLinearGradient(px, 0, px + 22, 0);
      left.addColorStop(0, 'rgba(22,6,8,.5)'); left.addColorStop(1, 'rgba(22,6,8,0)');
      g.fillStyle = left; g.fillRect(px, py, 22, ph);
      g.fillStyle = 'rgba(206,120,100,.55)'; g.fillRect(px + pw - 5, py + 6, 5, ph - 6); g.fillRect(px + 6, py + ph - 5, pw - 6, 5);
    }
    // 上からのダウンライトが当たる明るみ
    const lit = g.createLinearGradient(0, 0, 0, h * .34);
    lit.addColorStop(0, 'rgba(255,170,120,.22)'); lit.addColorStop(1, 'rgba(255,170,120,0)');
    g.fillStyle = lit; g.fillRect(0, 0, w, h * .34);
  });
  TEX.doorPanelR = doorWood(false); TEX.doorPanelL = doorWood(true);
  TEX.doorGlow = ct(256, 512, (g, w, h) => {
    const glow = g.createLinearGradient(0, 0, w, 0);
    glow.addColorStop(0, 'rgba(255,215,139,0)');
    glow.addColorStop(.48, 'rgba(255,215,139,0)');
    glow.addColorStop(.5, 'rgba(255,247,218,.95)');
    glow.addColorStop(.52, 'rgba(255,215,139,0)');
    glow.addColorStop(1, 'rgba(255,215,139,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
  });

  // ゲート扉（参考0240）。右扉1枚を描き、左扉は同じ絵をUV反転で使う。
  const gateLeaf = (kind) => ct(GATE_LEAF.width, GATE_LEAF.height, (g) => paintGateLeaf(g, kind),
    { premultiply: true, anisotropy: 8 });
  TEX.gateLeaf = { silver: gateLeaf('silver'), gold: gateLeaf('gold'), rainbow: gateLeaf('rainbow') };

  // 番号プレート: 全ゲート共通の黄色地 + 縦長の濃茶数字（参考0196）
  TEX.plateOf = (num) => ct(192, 208, (g, w, h) => paintGatePlate(g, w, h, num));
  // ゲート頂部の鋳鉄スクロールと中央エンブレム
  TEX.crest = ct(512, 320, (g, w, h) => paintCrestScroll(g, w, h), { premultiply: true });
  TEX.emblem = ct(512, 384, (g, w, h) => paintGateEmblem(g, w, h), { premultiply: true });

  // ピンクのアーチ看板（白文字 + 金縁 + スカラップ縁 / 原作t17-18は白系の筆記体）
  // 看板メッシュの実寸 10.4:0.66 と同じ比率で描き、英文の縦横比を保つ。
  TEX.banner = ct(4096, 260, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ff9dac');
    grd.addColorStop(.42, '#f17288');
    grd.addColorStop(1, '#d94665');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // 湾曲メッシュ側で弓形を作るため、ここでは厚みのある額縁だけを描く。
    g.strokeStyle = '#174c38'; g.lineWidth = h * .12;
    g.strokeRect(h * .06, h * .06, w - h * .12, h * .88);
    g.strokeStyle = '#30714c'; g.lineWidth = h * .07;
    g.strokeRect(h * .105, h * .105, w - h * .21, h * .79);
    g.strokeStyle = '#c6ac64'; g.lineWidth = h * .016;
    g.strokeRect(h * .145, h * .145, w - h * .29, h * .71);
    const gloss = g.createLinearGradient(0, 0, 0, h * .62);
    gloss.addColorStop(0, 'rgba(255,255,255,.42)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gloss;
    g.fillRect(h * .17, h * .16, w - h * .34, h * .4);
    // 原作表記を、潰れにくい細身のローマン体で中央に収める。
    const motto = 'A Long Shot Star';
    let mottoSize = Math.round(h * .74);
    do {
      g.font = `italic 700 ${mottoSize}px "Times New Roman", Georgia, serif`;
      mottoSize -= 2;
    } while (g.measureText(motto).width > w - h * 1.8 && mottoSize > h * .62);
    g.strokeStyle = '#9e6524'; g.lineWidth = h * .025;
    g.shadowColor = 'rgba(90,36,26,.6)'; g.shadowBlur = h * .03; g.shadowOffsetY = h * .016;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText(motto, w / 2, h / 2 + h * .025);
    g.fillStyle = '#fff8ee';
    g.fillText(motto, w / 2, h / 2 + h * .025);
    g.shadowBlur = 0; g.shadowOffsetY = 0;
  });
  // 斜めから寄っても細い英文が潰れないよう、看板だけ高めの異方性にする。
  TEX.banner.anisotropy = 8;

  // スタンドの貴賓席帯（窓）
  TEX.suites = ct(1024, 128, (g, w, h) => {
    g.fillStyle = '#27343c'; g.fillRect(0, 0, w, h);
    for (let x = 14; x < w - 60; x += 74) {
      const lit = Math.random() < .18;
      g.fillStyle = lit ? 'rgba(139,180,178,.65)' : 'rgba(73,119,119,.5)';
      g.fillRect(x, 26, 56, h - 56);
    }
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 12);
  }, { repeat: [8, 1] });

  // 発走灯のLED面: 消灯（暗い小豆色）と点灯（赤地に明るい粒が読める / 参考0226・0232）
  const ledFace = (base, glowIn, glowOut, dot, halo) => ct(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = radialGrad(g, w / 2, h / 2, w * .72, [[0, glowIn], [1, glowOut]]);
    g.fillRect(0, 0, w, h);
    for (let y = 16; y < h; y += 22) for (let x = 16; x < w; x += 22) {
      if (halo) { g.fillStyle = radialGrad(g, x, y, 12, [[0, halo], [1, 'rgba(255,90,70,0)']]); g.fillRect(x - 12, y - 12, 24, 24); }
      g.fillStyle = dot; g.beginPath(); g.arc(x, y, 5.6, 0, TAU); g.fill();
    }
  });
  TEX.led = ledFace('#43202a', 'rgba(120,70,80,.35)', 'rgba(20,6,10,.5)', '#5d3039', null);
  TEX.ledOn = ledFace('#d8141a', 'rgba(255,70,60,.55)', 'rgba(150,0,10,.45)', '#ff9a8c', 'rgba(255,170,150,.75)');

  // SSRゲートの虹色シアー
  TEX.rainbowSheen = ct(256, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w * .4, h);
    const cols = ['#ff9ad0', '#ffd98a', '#b8ff9a', '#8ad8ff', '#c89aff', '#ff9ad0'];
    cols.forEach((c, i) => grd.addColorStop(i / (cols.length - 1), c));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  // ゲート内部に立つカードの影。格子越しでもカード形状が読める太い縁を持たせる。
  const cardShadowTex = (ssr = false) => ct(512, 768, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.shadowBlur = ssr ? 30 : 14;
    g.shadowColor = ssr ? '#d985ff' : 'rgba(140,175,205,.55)';
    g.fillStyle = '#0c0d16';
    g.beginPath(); g.roundRect(42, 34, w - 84, h - 68, 24); g.fill();
    const edge = g.createLinearGradient(42, 34, w - 42, h - 34);
    if (ssr) {
      edge.addColorStop(0, '#ff70c8');
      edge.addColorStop(.25, '#ffe76f');
      edge.addColorStop(.5, '#6ff0c2');
      edge.addColorStop(.75, '#72c8ff');
      edge.addColorStop(1, '#b585ff');
    } else {
      edge.addColorStop(0, '#71869a');
      edge.addColorStop(.5, '#c0cbd4');
      edge.addColorStop(1, '#5c7188');
    }
    g.shadowBlur = ssr ? 22 : 7;
    g.strokeStyle = edge; g.lineWidth = ssr ? 22 : 15;
    g.beginPath(); g.roundRect(42, 34, w - 84, h - 68, 24); g.stroke();
    g.shadowBlur = 0;
    // 切手位置の小さな影と中央の馬蹄刻印で、単なる黒い長方形に見せない。
    g.fillStyle = ssr ? '#3f244f' : '#202935';
    g.beginPath(); g.roundRect(w - 154, 70, 72, 88, 8); g.fill();
    g.strokeStyle = ssr ? '#b984ff' : '#536679'; g.lineWidth = 13; g.lineCap = 'round';
    g.beginPath(); g.arc(w / 2, h * .54, 92, Math.PI * .18, Math.PI * .82, true); g.stroke();
  });
  TEX.cardShadow = cardShadowTex(false);
  TEX.cardShadowSSR = cardShadowTex(true);

  // 芝: 明暗の葉を描き込んだタイル（1タイル17m）。遠景の階調は頂点カラーで足す
  TEX.turf = ct(1024, 1024, paintTurf, { repeat: [40, 40], anisotropy: 8 });

  const drawCrowd = (g, w, h) => {
    // ベースは原作スタンドの赤茶系（参考t13.0の段色）
    g.fillStyle = '#354447'; g.fillRect(0, 0, w, h);
    // 段の陰影（横帯）で客席の列を出す
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = `rgba(28,20,24,${(y / 8) % 2 ? .18 : .06})`;
      g.fillRect(0, y + 5, w, 3);
    }
    // 観客は服(胴)+頭の2トーンで、列に沿わせて描く（ただのノイズにしない）
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w;
      const y = Math.floor(Math.random() * (h / 8)) * 8 + Math.random() * 2.5;
      g.fillStyle = `hsl(${Math.random() * 360}, ${8 + Math.random() * 10}%, ${28 + Math.random() * 12}%)`;
      g.fillRect(x, y + 2, 3, 4);
      g.fillStyle = `hsl(${18 + Math.random() * 20}, ${15 + Math.random() * 10}%, ${35 + Math.random() * 12}%)`;
      g.fillRect(x + .5, y, 2, 2);
    }
    // うっすら白いヘイズ
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, h);
  };
  // スロープ用は縦横の通路ラインを足す（リピートで段ごとの通路に見える）
  TEX.crowdSlope = ct(1024, 256, (g, w, h) => {
    drawCrowd(g, w, h);
    g.fillStyle = 'rgba(72,82,90,.5)';
    for (let x = 96; x < w; x += 256) g.fillRect(x, 0, 10, h);
    g.fillRect(0, h - 14, w, 14);
  }, { repeat: [8, 1] });

  // スタンド腰壁の広告ボード列（架空スポンサー風の色板 + 白抜きダミーロゴ）
  TEX.adboards = ct(1024, 128, (g, w, h) => {
    g.fillStyle = '#f2f5f7'; g.fillRect(0, 0, w, h);
    const cols = ['#2f7fd0', '#e05a8a', '#3aa860', '#e8a23a', '#7058c8', '#d84f3f', '#2f9fb8', '#c8b23a'];
    for (let i = 0; i < 8; i++) {
      const x = i * 128;
      g.fillStyle = cols[i];
      g.fillRect(x + 7, 12, 114, h - 24);
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.fillRect(x + 22, h / 2 - 7, 64, 14);
      g.beginPath(); g.arc(x + 101, h / 2, 9, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, h - 9, w, 9);
  }, { repeat: [14, 1] });

  // 空は縦グラデーションのみ。雲は歪まないよう別のビルボードで置く
  TEX.sky = ct(16, 1024, paintSky);
  TEX.clouds = [3, 11, 29, 47].map((seed) => ct(512, 256, (g, w, h) => paintCloud(g, w, h, seed), { premultiply: true }));
  // 放射状の光条（太陽の光芒 / 扉からあふれる光 / 確定時の後光）
  TEX.rays = ct(512, 512, (g, w, h) => paintRays(g, w, h, 7, 46));
  TEX.raysWide = ct(512, 512, (g, w, h) => paintRays(g, w, h, 23, 26));
  // スピード線（両端が消える細い帯）
  TEX.streak = ct(8, 128, (g, w, h) => {
    const line = g.createLinearGradient(0, 0, 0, h);
    line.addColorStop(0, 'rgba(255,255,255,0)'); line.addColorStop(.35, 'rgba(255,255,255,.9)');
    line.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = line; g.fillRect(0, 0, w, h);
  });
  // ゲート足元を白く飛ばすもや（縦: 上0 → 腰の高さで最大 → 地面で薄く）
  TEX.haze = ct(8, 128, (g, w, h) => {
    const veil = g.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, 'rgba(255,255,255,0)'); veil.addColorStop(.55, 'rgba(255,255,255,.62)');
    veil.addColorStop(.86, 'rgba(255,255,255,.5)'); veil.addColorStop(1, 'rgba(255,255,255,.36)');
    g.fillStyle = veil; g.fillRect(0, 0, w, h);
  });
  TEX.hazeGround = ct(8, 128, (g, w, h) => {
    const veil = g.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, 'rgba(255,255,255,.4)'); veil.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = veil; g.fillRect(0, 0, w, h);
  });
  // 年賀状の接地影
  TEX.blob = ct(128, 128, (g, w, h) => {
    g.fillStyle = radialGrad(g, 64, 64, 62, [[0, 'rgba(0,0,0,.6)'], [.5, 'rgba(0,0,0,.32)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(0, 0, w, h);
  });
  // レンズゴースト（縁が少し明るい円盤）
  TEX.ghost = ct(128, 128, (g, w, h) => {
    g.fillStyle = radialGrad(g, 64, 64, 62, [[0, 'rgba(255,255,255,.22)'], [.78, 'rgba(255,255,255,.3)'],
      [.9, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(0, 0, w, h);
  });

  TEX.pastel = ct(512, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffaeda'); grd.addColorStop(.3, '#dcb5ff');
    grd.addColorStop(.58, '#a9d4ff'); grd.addColorStop(.82, '#aef0c8'); grd.addColorStop(1, '#d8ffd0');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 26 + Math.random() * 90;
      g.fillStyle = radialGrad(g, x, y, r, [[0, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    // 小さな星
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 3;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    // 4芒星のきらめき
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 5 + Math.random() * 12;
      g.beginPath();
      g.moveTo(x, y - r); g.quadraticCurveTo(x + r * .14, y - r * .14, x + r, y);
      g.quadraticCurveTo(x + r * .14, y + r * .14, x, y + r);
      g.quadraticCurveTo(x - r * .14, y + r * .14, x - r, y);
      g.quadraticCurveTo(x - r * .14, y - r * .14, x, y - r);
      g.fill();
    }
    // 馬蹄モチーフ（うっすら）
    g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * 14;
      g.strokeStyle = `rgba(255,255,255,${.2 + Math.random() * .25})`;
      g.beginPath(); g.arc(x, y, r, Math.PI * .65, Math.PI * 2.35); g.stroke();
    }
  });

  // 確定演出（カラー解禁後）の青空 + 光線（参考19/195327）
  TEX.revealSky = ct(512, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#3f9ef0'); grd.addColorStop(.5, '#79c2f8'); grd.addColorStop(1, '#d8efff');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // 上からの光線
    for (let i = 0; i < 7; i++) {
      const cx = w * (.18 + i * .11), sp = 26 + Math.random() * 50;
      const lg = g.createLinearGradient(0, 0, 0, h * .9);
      lg.addColorStop(0, `rgba(255,255,255,${.22 + Math.random() * .12})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(cx - sp * .3, -10); g.lineTo(cx + sp * .3, -10);
      g.lineTo(cx + sp + 40, h * .9); g.lineTo(cx - sp + 40, h * .9); g.closePath(); g.fill();
    }
    // 雲
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * w, y = h * (.5 + Math.random() * .4), r = 24 + Math.random() * 60;
      g.fillStyle = radialGrad(g, x, y, r, [[0, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    // きらめき
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 2.5;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  });

  TEX.bokeh = ct(128, 128, (g, w, h) => {
    g.fillStyle = radialGrad(g, 64, 64, 60, [[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill();
  });

  TEX.ring = ct(256, 256, (g, w, h) => {
    for (let a = 0; a < 360; a += 2) {
      g.strokeStyle = `hsla(${a}, 95%, 68%, .85)`;
      g.lineWidth = 16;
      g.beginPath(); g.arc(128, 128, 96, a * Math.PI / 180, (a + 2.6) * Math.PI / 180); g.stroke();
    }
  });

  TEX.cross = ct(256, 256, (g, w, h) => {
    g.translate(128, 128);
    g.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(0, -120); g.quadraticCurveTo(10, -14, 0, 0); g.quadraticCurveTo(-10, -14, 0, -120); g.fill();
      g.rotate(Math.PI / 2);
    }
    g.fillStyle = radialGrad(g, 0, 0, 46, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.fill();
  });
  // 三段階のセル影。補間を切り、ゲーム内モデルらしい明快な陰影にする。
  TOON_GRADIENT = new THREE.DataTexture(
    new Uint8Array([72, 158, 255]), 3, 1, THREE.RedFormat, THREE.UnsignedByteType
  );
  TOON_GRADIENT.minFilter = THREE.NearestFilter;
  TOON_GRADIENT.magFilter = THREE.NearestFilter;
  TOON_GRADIENT.generateMipmaps = false;
  TOON_GRADIENT.needsUpdate = true;
}

// ---------- マテリアル/メッシュ ヘルパ ----------
function toonMaterial(o = {}) {
  const { roughness, metalness, envMapIntensity, ...toonOpts } = o;
  return new THREE.MeshToonMaterial({ gradientMap: TOON_GRADIENT, ...toonOpts });
}
const M = {
  metal: (o) => new THREE.MeshPhongMaterial({ shininess: 70, specular: 0xb5b0a1, ...o }),
  basic: (o) => new THREE.MeshBasicMaterial(o),
  lamb: (o) => toonMaterial(o),
  std: (o) => toonMaterial(o),
  add: (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...o }),
};
// 乗算済みアルファの切り抜き板（ゲート扉・雲・鋳鉄飾り）。遠景でも格子が滑らかに薄まる。
// 色は tint で乗算できるが、opacity は効かない（アルファを別に落とすと縁が光るため）
function cutout(map, o = {}) {
  return new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, ...o,
  });
}
function flipU(geometry) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  return geometry;
}
function sprite(tex, color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  s.scale.setScalar(scale);
  return s;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(sharedGeometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  return m;
}
function rbox(w, h, d, radius, mat, x = 0, y = 0, z = 0) {
  const safeRadius = Math.min(radius, w * .22, h * .22, d * .45);
  const m = new THREE.Mesh(sharedGeometry(`rounded:${w}:${h}:${d}:${safeRadius}`, () => new RoundedBoxGeometry(w, h, d, 2, safeRadius)), mat);
  m.position.set(x, y, z);
  return m;
}
function cylinder(radius, height, mat, x = 0, y = 0, z = 0, axis = 'y', segments = 16) {
  const m = new THREE.Mesh(sharedGeometry(`cylinder:${radius}:${height}:${segments}`, () => new THREE.CylinderGeometry(radius, radius, height, segments)), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

// ---------- 紙吹雪 ----------
class Confetti {
  constructor(n, center, size) {
    this.n = n; this.center = center; this.size = size;
    const geo = new THREE.PlaneGeometry(.21, .085);
    const mat = M.basic({ side: THREE.DoubleSide, vertexColors: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
    const dummy = new THREE.Object3D();
    // わずかにHDRへ持ち上げ、ブルームで紙片の縁をにじませる
    const palette = [0x7af2ff, 0xff67d4, 0xffea66, 0xedffff, 0x9dffc4, 0xff9ad0];
    const lowY = Math.max(2, center.y - size.y);
    for (let i = 0; i < n; i++) {
      const it = {
        p: new THREE.Vector3(center.x + rand(-size.x, size.x), rand(lowY, center.y + size.y), center.z + rand(-size.z, size.z)),
        vy: rand(.5, 1.6), ph: rand(0, TAU), rs: rand(1, 4), ax: rand(0, TAU), sway: rand(.4, 1.4),
        // 大半は小片、1割強だけ大きな紙片にして遠近の差を強める
        sc: i % 8 === 0 ? rand(1.7, 2.6) : rand(.75, 1.35),
      };
      this.items.push(it);
      dummy.position.copy(it.p); dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(palette[i % palette.length]).multiplyScalar(1.12));
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.dummy = dummy;
    this.active = false;
    this.mesh.visible = false;
  }
  set(v) { this.active = v; this.mesh.visible = v; }
  place(center, size) {
    this.center = center; this.size = size;
    const lowY = Math.max(2, center.y - size.y);
    for (const it of this.items) {
      it.p.set(center.x + rand(-size.x, size.x), rand(lowY, center.y + size.y), center.z + rand(-size.z, size.z));
    }
  }
  update(dt, t) {
    if (!this.active) return;
    const { center, size, dummy } = this;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      it.p.y -= it.vy * dt;
      it.p.x += Math.sin(t * 2 + it.ph) * it.sway * dt;
      if (it.p.y < Math.max(2, center.y - size.y)) {
        it.p.y = center.y + size.y;
        it.p.x = center.x + rand(-size.x, size.x);
        it.p.z = center.z + rand(-size.z, size.z);
      }
      dummy.position.copy(it.p);
      dummy.rotation.set(t * it.rs + it.ph, it.ax + t * it.rs * .7, it.ph);
      // レンズの目の前を横切る紙片は画面を覆う巨大な四角になるため、カメラのごく近くでは縮めて消す
      const near = W.camera ? Math.min(1, Math.max(0, (it.p.distanceTo(W.camera.position) - .9) / 1.6)) : 1;
      dummy.scale.setScalar(it.sc * near);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- 光の粒 ----------
class Sparkles {
  constructor(n, center, size, color = 0xfff2b8, sc = .55) {
    this.n = n; this.center = center; this.size = size;
    const pos = new Float32Array(n * 3);
    this.vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = center.x + rand(-size.x, size.x);
      pos[i * 3 + 1] = center.y + rand(-size.y, size.y);
      pos[i * 3 + 2] = center.z + rand(-size.z, size.z);
      this.vel.push(rand(.2, .9));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: TEX.bokeh, color, size: sc, transparent: true, opacity: .9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
    }));
    this.pts.visible = false;
    this.active = false;
    this.baseSize = sc;
  }
  set(v) { this.active = v; this.pts.visible = v; }
  update(dt, t) {
    if (!this.active) return;
    const a = this.pts.geometry.attributes.position;
    for (let i = 0; i < this.n; i++) {
      let y = a.getY(i) + this.vel[i] * dt;
      if (y > this.center.y + this.size.y) y = this.center.y - this.size.y;
      a.setY(i, y);
    }
    a.needsUpdate = true;
    this.pts.material.opacity = .56 + Math.sin(t * 2.2) * .06;
  }
}

// ---------- 廊下 ----------
function buildCorridor() {
  const g = new THREE.Group();
  // 原作どおり、赤い絨毯の両脇に明るい石床を残す。
  g.add((() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 26), M.lamb({ map: TEX.marbleFloor }));
    m.rotation.x = -Math.PI / 2; m.position.z = -2; return m;
  })());
  g.add((() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.25, 26), M.lamb({ map: TEX.carpet }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, .012, -2); return m;
  })());
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 5.5), M.lamb({ map: TEX.wall }));
    wall.position.set(sx * 4.03, 2.75, -2);
    wall.rotation.y = -sx * Math.PI / 2;
    g.add(wall);
  }
  g.add((() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 26), M.basic({ map: TEX.ceiling })); m.rotation.x = Math.PI / 2; m.position.set(0, 5.52, -2); return m; })());
  const goldMat = M.std({ color: 0xc99545, emissive: 0x160b02, metalness: .68, roughness: .25 });
  const creamMat = M.std({ color: 0xe6c88b, emissive: 0x120a03, metalness: .16, roughness: .42 });
  const woodMat = M.std({ color: 0x593329, emissive: 0x080201, metalness: 0, roughness: .7 });

  // 幅広の木製ピラスター、金の見切り、上下の台座で壁の奥行きを作る。
  for (let z = 2; z >= -12; z -= 2.6) for (const sx of [-1, 1]) {
    g.add(box(.46, 5.5, .42, woodMat, sx * 3.83, 2.75, z));
    g.add(box(.07, 5.25, .47, goldMat, sx * 3.57, 2.66, z));
    g.add(box(.64, .22, .58, creamMat, sx * 3.82, 5.28, z));
    g.add(box(.52, .12, .52, goldMat, sx * 3.82, 5.12, z));
    g.add(box(.62, .2, .58, creamMat, sx * 3.82, .18, z));
  }
  for (const sx of [-1, 1]) {
    g.add(box(.16, .16, 25.8, creamMat, sx * 3.76, 1.48, -2));
    g.add(box(.09, .08, 25.8, goldMat, sx * 3.67, 1.77, -2));
    g.add(box(.15, .14, 25.8, creamMat, sx * 3.75, 4.69, -2));
    g.add(box(.12, .1, 25.8, goldMat, sx * 3.72, 4.91, -2));
  }
  // 天井を一枚板に見せない格天井。横梁と細い金縁を実形状で重ねる。
  g.add(rbox(.2, .14, 25.6, .035, woodMat, -3.55, 5.43, -2));
  g.add(rbox(.2, .14, 25.6, .035, woodMat, 3.55, 5.43, -2));
  for (let z = 1.35; z >= -11.25; z -= 2.8) {
    g.add(rbox(7.55, .16, .19, .035, woodMat, 0, 5.42, z));
    g.add(rbox(7.18, .045, .055, .018, goldMat, 0, 5.325, z));
  }
  const panelFrameMat = M.std({ color: 0xc18b3e, emissive: 0x110802, metalness: .62, roughness: .28 });
  const panelInnerMat = M.std({ color: 0xe2bd78, emissive: 0x100803, metalness: .32, roughness: .34 });
  const panelFaceMat = M.std({ color: 0xb78468, emissive: 0x0c0503, roughness: .66 });
  for (const sx of [-1, 1]) for (const z of [.55, -2.05, -4.65, -7.25, -9.85]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.54, 1.42), panelFaceMat);
    face.position.set(sx * 3.525, 3.24, z);
    face.rotation.y = -sx * Math.PI / 2;
    g.add(face);
    const x = sx * 3.55;
    g.add(box(.1, 1.82, .09, panelFrameMat, x, 3.24, z - .94));
    g.add(box(.1, 1.82, .09, panelFrameMat, x, 3.24, z + .94));
    g.add(box(.1, .09, 1.96, panelFrameMat, x, 2.33, z));
    g.add(box(.1, .09, 1.96, panelFrameMat, x, 4.15, z));
    g.add(box(.07, 1.57, .06, panelInnerMat, sx * 3.51, 3.24, z - .81));
    g.add(box(.07, 1.57, .06, panelInnerMat, sx * 3.51, 3.24, z + .81));
    g.add(box(.07, .06, 1.68, panelInnerMat, sx * 3.51, 2.46, z));
    g.add(box(.07, .06, 1.68, panelInnerMat, sx * 3.51, 4.02, z));
    // 腰壁にも細い額縁を置き、下半分を一枚板に見せない。
    g.add(box(.08, .72, .07, panelFrameMat, x, .86, z - .86));
    g.add(box(.08, .72, .07, panelFrameMat, x, .86, z + .86));
    g.add(box(.08, .07, 1.79, panelFrameMat, x, .5, z));
    g.add(box(.08, .07, 1.79, panelFrameMat, x, 1.22, z));
  }

  // 原作の天井は小さな埋込灯のみ。光球は置かず輪郭を明瞭に保つ。
  const lampRimMat = M.std({ color: 0xf2d79c, emissive: 0x8a6422, emissiveIntensity: .75, metalness: .48, roughness: .24 });
  const lampCoreMat = M.std({ color: 0xfff4cc, emissive: 0xffc866, emissiveIntensity: 2.1, roughness: .2 });
  let lampRow = 0;
  for (let z = 1.2; z >= -11.2; z -= 2.8) for (const x of [-2.15, 0, 2.15]) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(.105, .105, .032, 24),
      lampRimMat
    );
    rim.position.set(x, 5.48, z);
    g.add(rim);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.068, .068, .018, 24), lampCoreMat);
    core.position.set(x, 5.455, z);
    g.add(core);
    if (x === 0 && lampRow % 2 === 0) {
      const light = new THREE.PointLight(0xffc889, .52, 6.5, 2);
      light.position.set(0, 5.05, z);
      g.add(light);
    }
    if (x === 2.15) lampRow++;
  }

  // 参考フレーム0080の壁付けランプ。乳白色のシェードと真鍮の短い腕。
  const shadeMat = M.std({ color: 0xffefd0, emissive: 0xe6b568, emissiveIntensity: .6 });
  for (const sx of [-1, 1]) for (const z of [.5, -4.7, -9.9]) {
    g.add(rbox(.05, .46, .19, .02, goldMat, sx * 3.49, 3.45, z));
    g.add(rodBetween([sx * 3.48, 3.28, z], [sx * 3.13, 3.28, z], .025, goldMat));
    g.add(cylinder(.028, .32, goldMat, sx * 3.13, 3.43, z));
    const shade = new THREE.Mesh(sharedGeometry('sconce-shade', () =>
      new THREE.CylinderGeometry(.13, .23, .34, 8)), shadeMat);
    shade.position.set(sx * 3.13, 3.71, z);
    g.add(shade);
  }

  // ---- 原作比率の、壁いっぱいに広がる巨大両開き扉（参考0095–0106） ----
  const door = new THREE.Group();
  door.position.set(0, 0, -13);
  const doorW = 4.55;
  const doorH = 4.45;
  const leafW = doorW / 2;
  // 取っ手は乳白色の角棒。上下2か所の角ブラケットで扉から浮かせる
  const handleMat = M.metal({ color: 0xf1e6c8, emissive: 0x5a503a, specular: 0xffffff, shininess: 40 });
  W.doorMats = [];
  const mkPanel = (sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * doorW / 2, 0, 0);         // 外側エッジ＝ヒンジ
    // 鏡板の陰影は描き込み済みなので無照明で見せる（開扉時は color を上げて光を受けさせる）
    const mat = M.basic({ map: sx < 0 ? TEX.doorPanelL : TEX.doorPanelR });
    W.doorMats.push(mat);
    const panel = new THREE.Mesh(new RoundedBoxGeometry(leafW, doorH, .18, 3, .03), mat);
    panel.position.set(-sx * leafW / 2, doorH / 2, 0);
    piv.add(panel);
    const hx = -sx * (leafW - .2);                  // 合わせ目寄り
    piv.add(rbox(.085, 1.62, .07, .02, handleMat, hx, 2.02, .27));
    for (const dy of [-1, 1]) piv.add(rbox(.12, .15, .2, .02, handleMat, hx, 2.02 + dy * .58, .17));
    door.add(piv);
    return piv;
  };
  W.doorL = mkPanel(-1);
  W.doorR = mkPanel(1);
  // 扉の左右・上の壁を塞ぐ。開扉時の中央だけを光の通り道として残す。
  const endWall = M.std({ color: 0x784437, emissive: 0x100504, roughness: .78 });
  const sideWidth = (8 - doorW) / 2;
  for (const side of [-1, 1]) {
    g.add(box(sideWidth, 5.5, .16, endWall,
      side * (doorW / 2 + sideWidth / 2), 2.75, -13.2));
  }
  g.add(box(doorW, 5.5 - doorH, .16, endWall,
    0, doorH + (5.5 - doorH) / 2, -13.2));
  // 直線の外枠は濃い木を主体にし、細い金の内縁だけを見せる。
  const frameWood = M.std({ color: 0x4b2923, emissive: 0x070201, roughness: .68 });
  const frameGold = M.std({ color: 0xd6a447, emissive: 0x1f1202, metalness: .72, roughness: .22 });
  const frameCream = M.std({ color: 0xe1c18a, emissive: 0x100803, metalness: .26, roughness: .38 });
  const frameX = doorW / 2 + .2;
  door.add(rbox(.4, 5.18, .4, .055, frameWood, -frameX, 2.59, 0));
  door.add(rbox(.4, 5.18, .4, .055, frameWood, frameX, 2.59, 0));
  door.add(rbox(doorW + .8, .16, .42, .035, frameWood, 0, 5.42, 0));
  // 扉上の壁: 5灯のダウンライトが壁を扇形に舐める（参考0096–0104）
  const headerH = 5.46 - (doorH + .08);
  const headerTexture = ct(1024, 256, (ctx, width, height) => {
    const wall = ctx.createLinearGradient(0, 0, 0, height);
    wall.addColorStop(0, '#8c4b34'); wall.addColorStop(1, '#6b3628');
    ctx.fillStyle = wall; ctx.fillRect(0, 0, width, height);
    for (const x of [-1.82, -.91, 0, .91, 1.82]) {
      ctx.save();
      ctx.translate((x / (doorW + .12) + .5) * width, 6); ctx.scale(1, 2.1);
      ctx.fillStyle = radialGrad(ctx, 0, 0, 112, [[0, '#fff2c6'], [.16, '#ffd08a'],
        [.5, 'rgba(238,140,70,.5)'], [1, 'rgba(160,80,50,0)']]);
      ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI); ctx.fill();
      ctx.restore();
    }
  });
  const header = new THREE.Mesh(new THREE.PlaneGeometry(doorW + .12, headerH), M.basic({ map: headerTexture }));
  header.position.set(0, doorH + .08 + headerH / 2, .03); door.add(header);
  for (const x of [-1.82, -.91, 0, .91, 1.82]) {
    const downlight = new THREE.Mesh(new THREE.CylinderGeometry(.10, .10, .02, 16), lampCoreMat);
    downlight.position.set(x, 5.38, .14); door.add(downlight);
  }
  door.add(box(doorW + .8, .2, .5, frameWood, 0, .1, .06));
  door.add(box(.075, doorH + .06, .38, frameGold, -(doorW / 2 + .04), doorH / 2, .02));
  door.add(box(.075, doorH + .06, .38, frameGold, doorW / 2 + .04, doorH / 2, .02));
  door.add(box(doorW + .12, .075, .38, frameGold, 0, doorH + .04, .02));
  for (const sx of [-1, 1]) {
    door.add(box(.62, .2, .5, frameCream, sx * frameX, doorH + .1, .01));
    door.add(box(.65, .24, .54, frameCream, sx * frameX, .14, .01));
    door.add(box(.46, .08, .45, frameGold, sx * frameX, doorH - .06, .02));
  }
  // 扉の奥の白い光の間（開いた時に見える）
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH + .1), M.add({ color: new THREE.Color(2.6, 2.3, 1.6), opacity: 0 }));
  innerGlow.position.set(0, doorH / 2, -.4);
  door.add(innerGlow);
  W.doorInner = innerGlow;
  g.add(door);
  // 開扉前の合わせ目から漏れる細い光。
  const shoe = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    M.add({ map: TEX.doorGlow, color: 0xffe0a0, opacity: 0, side: THREE.DoubleSide })
  );
  shoe.position.set(0, doorH / 2, -12.88);
  g.add(shoe);
  W.doorShoe = shoe;

  // ---- 扉の発光FX ----
  const fx = new THREE.Group();
  fx.position.set(0, doorH / 2, -12.86);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(.4, doorH), M.add({ color: new THREE.Color(3, 2.4, 1.3), opacity: 0 }));
  fx.add(slit);
  const glow = sprite(TEX.bokeh, 0xffe6a8, .1, 0); fx.add(glow);
  // 合わせ目からあふれる放射状の光条。扉の手前に置き、開いた扉の縁をかすめて見せる
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    M.add({ map: TEX.raysWide, color: new THREE.Color(1.5, 1.2, .95), opacity: 0 }));
  rays.position.z = .45;
  rays.scale.set(.01, .01, 1);
  fx.add(rays);
  const ring = sprite(TEX.ring, 0xffffff, .1, 0); ring.position.z = .05; fx.add(ring);
  const cross = sprite(TEX.cross, 0xfff6d8, .1, 0); cross.position.z = .06; fx.add(cross);
  g.add(fx);
  W.doorFx = { slit, glow, rays, ring, cross };

  batchStaticMeshes(g);
  g.visible = false;
  return g;
}

// ---------- 競馬場 + スタートゲート ----------
function buildRace() {
  const g = new THREE.Group();
  // 空
  const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 16), M.basic({ map: TEX.sky, side: THREE.BackSide, fog: false }));
  g.add(sky);
  W.skyMat = sky.material;
  // 雲（アニメ調の積雲）。主要カットの画角へ入る方位に手置きする。
  // 方位は -Z（コースから見たゲートの奥）を0°とし、+X側が正。
  const clouds = new THREE.Group();
  const cloudGeo = new THREE.PlaneGeometry(1, .5);
  const cloudMats = TEX.clouds.map((tex) => cutout(tex));
  [
    // ゲート全景・発走（-Zを見る）
    [-11, 17, 92, 0], [10, 9.5, 62, 1], [-15, 5, 54, 2], [5, 24, 44, 3], [16, 3.5, 70, 0], [-3, 33, 60, 1],
    // ゲート横パン（左上を見上げる）
    [-24, 29, 84, 2], [-40, 23, 96, 3], [-31, 40, 58, 0], [-55, 12, 80, 1],
    // 発走灯（右上を見上げる）
    [30, 31, 80, 3], [46, 19, 96, 2], [62, 9, 84, 0],
    // 走路を見通す（+Zを見る）
    [171, 21, 104, 1], [191, 9.5, 58, 2], [196, 3.5, 78, 3], [160, 5, 84, 0], [183, 34, 50, 2],
    // そのほか全周
    [95, 10, 90, 1], [128, 14, 76, 3], [222, 11, 88, 0], [255, 16, 96, 2], [292, 9, 84, 1],
  ].forEach(([azimuth, elevation, width, variant], index) => {
    const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180, distance = 300;
    const cloud = new THREE.Mesh(cloudGeo, cloudMats[variant]);
    cloud.position.set(Math.sin(az) * Math.cos(el) * distance, Math.sin(el) * distance,
      -Math.cos(az) * Math.cos(el) * distance);
    cloud.scale.set(index % 2 ? -width : width, width, 1);
    cloud.lookAt(0, cloud.position.y * .35, 0);
    cloud.renderOrder = -5;
    clouds.add(cloud);
  });
  g.add(clouds);
  W.cloudMats = cloudMats;
  // 芝: 大きなむらを頂点カラーで足し、タイルの繰り返しを目立たせない
  const turfGeo = new THREE.PlaneGeometry(680, 680, 48, 48);
  {
    const position = turfGeo.attributes.position, colors = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i);
      const tone = .96 + Math.sin(x * .071 + 1.3) * Math.sin(y * .053 + .4) * .055
        + Math.sin(x * .19 + y * .13) * .03;
      colors.push(tone * .98, tone, tone * .96);
    }
    turfGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  const turf = new THREE.Mesh(turfGeo, M.basic({ map: TEX.turf, vertexColors: true }));
  turf.rotation.x = -Math.PI / 2;
  g.add(turf);
  W.turfMat = turf.material;
  // ゲート前の近景には立った葉を足す（発走の低いカメラで視差が出る）。1 draw call。
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.016, 0, 0, .016, 0, 0, .02, .1, .012], 3));
  bladeGeo.computeVertexNormals();
  const grass = new THREE.InstancedMesh(bladeGeo, M.basic({ color: 0xffffff, side: THREE.DoubleSide }), 7000);
  const blade = new THREE.Object3D(), bladeColor = new THREE.Color();
  for (let i = 0; i < grass.count; i++) {
    blade.position.set(rand(-9.3, 9.3), .005, rand(-6, 42));
    blade.rotation.y = rand(0, TAU);
    blade.scale.setScalar(rand(.5, 1.25));
    blade.updateMatrix(); grass.setMatrixAt(i, blade.matrix);
    grass.setColorAt(i, bladeColor.setHSL(rand(.3, .35), rand(.5, .68), rand(.26, .42)));
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate = true;
  g.add(grass);
  W.grassMat = grass.material;
  // 地平線の樹林帯（遠景の森。フォグ越しに霞む明るめの緑）
  const trees = new THREE.Mesh(
    new THREE.CylinderGeometry(238, 238, 3, 64, 1, true),
    M.std({ color: 0x5f9b67, roughness: .92, side: THREE.BackSide })
  );
  trees.position.y = 1.5;
  g.add(trees);
  // 地平線の緑を円筒一枚で終わらせず、低ポリ樹冠を重ねて輪郭を作る。
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  const crownMat = M.std({ color: 0x4f8f5b, roughness: .95 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, 180);
  const crownDummy = new THREE.Object3D();
  for (let i = 0; i < 180; i++) {
    const a = i / 180 * TAU + rand(-.025, .025);
    const r = rand(228, 238);
    const sc = rand(3.0, 5.0);
    crownDummy.position.set(Math.cos(a) * r, rand(1.3, 2.2), Math.sin(a) * r);
    crownDummy.scale.set(sc * 1.6, sc * .5, sc * 1.4);
    crownDummy.rotation.set(rand(-.12, .12), rand(0, TAU), 0);
    crownDummy.updateMatrix();
    crowns.setMatrixAt(i, crownDummy.matrix);
  }
  crowns.instanceMatrix.needsUpdate = true;
  g.add(crowns);
  // 太陽: ゲート全景(z≈26から-Zを見る)の右上に入る位置。にじみ・光芒・十字・斜めの光の筋を重ねる（参考0139–0156）
  const sun = new THREE.Group();
  sun.add(sprite(TEX.bokeh, 0xfff3cf, 15, .9));
  const sunRays = sprite(TEX.rays, 0xfff6dc, 50, .5);
  const sunCross = sprite(TEX.cross, 0xffffff, 28, .9);
  const sunStreak = sprite(TEX.cross, 0xdff4ff, 1, .38);
  sunStreak.scale.set(170, 6, 1);
  sunStreak.material.rotation = .46;
  sun.add(sunRays, sunCross, sunStreak);
  sun.position.set(22, 44, -84);
  g.add(sun);
  W.sun = { group: sun, rays: sunRays, cross: sunCross };
  // 走路の先のかすんだ逆光（+Zを見るカット用。球ではなく広い明るみとして置く）
  const trackGlow = sprite(TEX.bokeh, 0xe8f8ff, 1, .3);
  trackGlow.scale.set(120, 26, 1);          // 地平線に沿って横へ伸びる薄い明るみ
  trackGlow.position.set(-10, 5, 210);
  g.add(trackGlow);
  // ラチ（白柵）: 走路の両脇に沿わせる（ゲート前を横切らせない）
  const railMat = M.std({ color: 0xf4f7fa, metalness: .38, roughness: .28 });
  const raceRails = new THREE.Group();
  for (const sx of [-1, 1]) {
    raceRails.add(cylinder(.06, 260, railMat, sx * RACE_LAYOUT.railX, 1.05, 5, 'z', 14));
    raceRails.add(cylinder(.045, 260, railMat, sx * RACE_LAYOUT.railX, .55, 5, 'z', 14));
    for (let z = -125; z <= 135; z += 4) raceRails.add(cylinder(.055, 1.1, railMat, sx * RACE_LAYOUT.railX, .55, z, 'y', 14));
  }
  batchStaticMeshes(raceRails);
  g.add(raceRails);
  W.raceRails = raceRails;
  // 発走ラインの白線（ゲートの少し先）
  g.add(box(19.1, .012, .3, M.lamb({ color: 0xf4f8fb }), 0, .006, -2.6));
  // 原作のスタンドは一枚斜面ではなく、白い庇で区切られた三層構造。
  const stand = new THREE.Group();
  stand.rotation.y = RACE_LAYOUT.standRotationY;
  stand.position.set(RACE_LAYOUT.standOffsetX, 0, RACE_LAYOUT.standCenterZ);
  stand.scale.x = RACE_LAYOUT.standLengthScale;
  const standDark = M.std({ color: 0x18383b, metalness: .16, roughness: .62 });
  const standMid = M.std({ color: 0x31565a, metalness: .24, roughness: .5 });
  const standLight = M.std({ color: 0xd8e1df, metalness: .38, roughness: .34 });
  const standTrim = M.std({ color: 0x93b1b2, metalness: .48, roughness: .28 });
  const tierDefs = [
    { frontZ: -23.8, baseY: 1.05, depth: 8.8, angle: .32 },
    { frontZ: -31.0, baseY: 4.35, depth: 7.3, angle: .34 },
    { frontZ: -37.4, baseY: 7.45, depth: 7.0, angle: .35 },
  ];

  tierDefs.forEach((tier, index) => {
    const run = Math.cos(tier.angle) * tier.depth;
    const rise = Math.sin(tier.angle) * tier.depth;
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(220, tier.depth), M.lamb({ map: TEX.crowdSlope }));
    slope.rotation.x = -Math.PI / 2 + tier.angle;
    slope.position.set(0, tier.baseY + rise / 2, tier.frontZ - run / 2);
    stand.add(slope);
    stand.add(buildStandAudience(tier));

    // それぞれの層に独立した床スラブ、暗い腹、白い鼻先、ガラス手すりを持たせる。
    stand.add(box(224, .34, 1.55, standLight, 0, tier.baseY - .06, tier.frontZ + .22));
    stand.add(box(224, .27, .72, standDark, 0, tier.baseY + .17, tier.frontZ + .54));
    stand.add(box(224, .08, .76, standTrim, 0, tier.baseY + .38, tier.frontZ + .56));
    const rail = new THREE.Mesh(
      new THREE.PlaneGeometry(220, .62),
      M.basic({ color: index === 0 ? 0x7f9999 : 0x55777a, transparent: true, opacity: .78, side: THREE.DoubleSide, fog: false })
    );
    rail.position.set(0, tier.baseY + .7, tier.frontZ + .64);
    stand.add(rail);
    // ガラス面に細い支柱と手すりを置き、各層の縮尺を読めるようにする。
    for (let x = -104; x <= 104; x += 8) {
      stand.add(cylinder(.026, .7, standTrim, x, tier.baseY + .7, tier.frontZ + .69, 'y', 10));
    }
    stand.add(cylinder(.035, 220, standTrim, 0, tier.baseY + 1.04, tier.frontZ + .69, 'x', 12));
    // 各層の奥に窓と暗いコンコースを置く。白い庇の下に奥行きを残す。
    const windows = new THREE.Mesh(new THREE.PlaneGeometry(220, 1.25), M.lamb({ map: TEX.suites }));
    windows.position.set(0, tier.baseY + rise + .7, tier.frontZ - run - .25);
    stand.add(windows);
  });

  // 最下段だけに控えめな広告帯を置き、層の境界を読みやすくする。
  stand.add((() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(220, .48), M.lamb({ map: TEX.adboards }));
    m.position.set(0, 1.39, -23.13);
    return m;
  })());

  // 最上部の貴賓席・コンコース。
  stand.add(box(228, 2.65, 1.1, standDark, 0, 11.1, -45.2));
  stand.add((() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(224, 2.25), M.lamb({ map: TEX.suites }));
    m.position.set(0, 11.15, -44.62);
    return m;
  })());

  // 大屋根は三層全体を覆い、前端を大きく張り出させる。
  stand.add(box(230, .72, 25, M.std({ color: 0xd6dfdf, metalness: .28, roughness: .42 }), 0, 13.05, -34.9));
  stand.add(box(230.4, .62, .38, standLight, 0, 12.82, -22.45));
  stand.add(box(230.4, .1, .4, standTrim, 0, 12.45, -22.43));
  stand.add((() => {
    const roofTex = ct(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#34494c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a3c3f'; ctx.fillRect(0, 0, w, 20); ctx.fillRect(0, 118, w, 20);   // 桁
      ctx.fillStyle = '#4c6669';
      ctx.fillRect(0, 20, w, 4); ctx.fillRect(0, 138, w, 4);
      ctx.fillRect(122, 0, 12, h);                                                          // 梁
      for (const y of [72, 196]) {
        ctx.fillStyle = radialGrad(ctx, 64, y, 26, [[0, 'rgba(255,246,214,.95)'], [.3, 'rgba(255,236,190,.4)'], [1, 'rgba(255,236,190,0)']]);
        ctx.fillRect(38, y - 26, 52, 52);
      }
    }, { repeat: [36, 2] });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(228, 24.4), M.basic({ map: roofTex, fog: false }));
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 12.67, -34.9);
    W.standRoofUnder = m;
    return m;
  })());

  // 層の奥に見える柱と屋根梁。手前の視界を塞がない位置に下げる。
  for (let x = -100; x <= 100; x += 25) {
    stand.add(box(.42, 12.1, .42, standMid, x, 6.05, -44.1));
    stand.add(box(.26, .16, 24, standTrim, x, 12.56, -34.8));
  }
  for (let x = -108; x <= 108; x += 12) {
    stand.add(box(.09, 2.45, .12, standTrim, x, 11.18, -44.55));
  }
  stand.add(box(230, 12.3, 1, standDark, 0, 6.15, -46.2));

  // ペンライトも三層へ分けて配置し、奥行きと階層が動きの中でも消えないようにする。
  W.penlights = [
    new Sparkles(68, new THREE.Vector3(0, 2.5, -28), new THREE.Vector3(95, 1.6, 4), 0x7af0ff, 1.0),
    new Sparkles(58, new THREE.Vector3(0, 5.6, -34.4), new THREE.Vector3(95, 1.5, 3.2), 0xff8ad8, .95),
    new Sparkles(48, new THREE.Vector3(0, 8.6, -40.5), new THREE.Vector3(95, 1.45, 3.1), 0xfff08a, .9),
  ];
  W.penlights.forEach((p, tierIndex) => {
    const tier = tierDefs[tierIndex];
    const attr = p.pts.geometry.attributes.position;
    const rise = Math.sin(tier.angle) * tier.depth;
    const run = Math.cos(tier.angle) * tier.depth;
    for (let i = 0; i < attr.count; i++) {
      const t = Math.random();
      attr.setXYZ(i, rand(-95, 95), tier.baseY + .42 + t * rise + rand(0, .34), tier.frontZ - .2 - t * run);
    }
    attr.needsUpdate = true;
    p.center.y = tier.baseY + rise / 2 + .45;
    p.size.y = rise / 2 + .55;
    stand.add(p.pts);
  });
  batchStaticMeshes(stand);
  g.add(stand);
  W.standG = stand;   // +Zを見るカットの画面左に固定。カット切替で移動・出現させない。

  // ---- スタートゲート（表示番号は左から 10→1 / 参考: movie/frames 0148・0196・0240） ----
  const gates = new THREE.Group();
  gates.position.set(0, 0, RACE_LAYOUT.gateZ);
  const gateStatic = new THREE.Group();   // 動かない骨組み。最後に同形状をインスタンス化する
  gates.add(gateStatic);
  // 物理ベースの拡散は 1/π になるため、白銀の柱は自己発光で持ち上げて明るい鋼に見せる
  const steel = M.metal({ color: 0xeaf0f4, emissive: 0x4d575e, specular: 0xffffff });
  const gold = M.metal({ color: 0xe6b93c, emissive: 0x6a4708, specular: 0xfff0b0 });
  const rainbowMetal = M.metal({ color: 0xece2fb, emissive: 0x6a5c8c, specular: 0xffffff });
  const gateGreen = M.std({ color: 0x23946c, emissive: 0x0a3324 });
  const frameShade = M.std({ color: 0x1d4a3c, emissive: 0x04110c });
  const plateEdge = M.basic({ color: 0xb98a1b, fog: false });
  const signalDark = M.std({ color: 0x3a3238, emissive: 0x0a080a });
  const signalFace = M.basic({ color: 0x7a1a1e, fog: false });
  const leafMats = {
    silver: cutout(TEX.gateLeaf.silver), gold: cutout(TEX.gateLeaf.gold), rainbow: cutout(TEX.gateLeaf.rainbow),
  };
  W.gateLeafMats = leafMats;
  const GW = 1.45, DOOR_H = 1.95, DOOR_Y = .52, LEAF_W = GW / 2 - .13;
  const leafGeoR = new THREE.PlaneGeometry(LEAF_W, DOOR_H);
  const leafGeoL = flipU(leafGeoR.clone());
  const shadowGeo = new THREE.PlaneGeometry(1.02, 1.76);
  const plateGeo = new THREE.PlaneGeometry(.44, .48);
  W.gateObjs = [];
  W.gatePlates = [];
  W.gateSteel = steel;
  for (let col = 0; col < 10; col++) {
    const n = 10 - col;                 // 表示番号（左端が10）
    const x = (col - 4.5) * GW;
    const isSSR = n === GACHA.ssrGate, isSR = GACHA.srGates.includes(n);
    const kind = isSSR ? 'rainbow' : isSR ? 'gold' : 'silver';
    const fm = isSSR ? rainbowMetal : isSR ? gold : steel;
    const S = (mesh) => { mesh.position.x += x; gateStatic.add(mesh); return mesh; };
    for (const side of [-1, 1]) {
      const px = side * (GW / 2 - .075);
      S(box(.085, 2.72, .12, steel, px, 1.36, .45));             // 前柱（白銀で統一）
      S(box(.09, 2.72, .09, frameShade, px, 1.36, -.55));        // 奥柱
      const brace = box(.5, .058, .1, steel, side * .4425, 2.54, .45);
      brace.rotation.z = -side * .868;                           // 開口を八角形に見せる持ち送り
      S(brace);
      S(rodBetween([px, 1.65, -.55], [px, 2.6, .45], .018, steel));
      S(rbox(.25, .08, .26, .018, frameShade, px, .04, .45));
      S(rbox(.23, .07, .24, .018, frameShade, px, .04, -.55));
      S(box(.035, 1.5, .94, frameShade, side * (GW / 2 - .045), 1.3, -.05));   // 房を仕切る側板
    }
    S(box(GW - .1, .075, .12, steel, 0, 2.72, .45));             // 上梁
    S(box(GW - .06, .12, .2, gateGreen, 0, 2.84, .43));          // 緑の受け梁
    // 番号プレート: 段付きの緑の受け台に黄色い板を立てる
    S(rbox(.58, .1, .2, .02, gateGreen, 0, 2.95, .4));
    S(rbox(.46, .07, .16, .02, gateGreen, 0, 3.03, .4));
    S(box(.48, .52, .05, plateEdge, 0, 3.33, .4));
    const plateTex = TEX.plateOf(n);
    W.gatePlates.push({ texture: plateTex, n });
    const plate = new THREE.Mesh(plateGeo, M.basic({ map: plateTex, fog: false }));
    plate.position.set(x, 3.33, .427);
    gateStatic.add(plate);
    // 房の境のトラスに付く小さな信号箱（参考0164–0172）
    if (col > 0) {
      S(box(.17, .17, .14, signalDark, -GW / 2, 3.22, .36));
      S(box(.1, .1, .02, signalFace, -GW / 2, 3.22, .44));
    }

    const one = new THREE.Group();
    one.position.set(x, 0, 0);
    // 各ゲートの奥にカードの影を立たせ、格子越しの空間を埋める。
    const shadow = new THREE.Mesh(shadowGeo, M.basic({
      map: isSSR ? TEX.cardShadowSSR : TEX.cardShadow,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      opacity: isSSR ? 1 : .9,
    }));
    shadow.position.set(((col % 3) - 1) * .045, 1.42, .1);
    shadow.rotation.z = ((col % 3) - 1) * .035;
    shadow.renderOrder = 1;
    one.add(shadow);
    // 房の内側から漏れる逆光。金の房だけ暖色で強く光る（参考0160–0220）
    const shadowGlow = sprite(TEX.bokeh,
      isSSR ? 0xffb4ec : isSR ? 0xffd45e : 0xe5f6ff,
      isSSR ? 3.0 : isSR ? 2.6 : 2.15,
      isSSR ? .68 : isSR ? .62 : .38);
    shadowGlow.position.set(0, 1.5, -.25);
    one.add(shadowGlow);

    // 前扉は左右2枚で一つの唐草模様。10番だけ虹、1・7番は金。
    // ただし色が付くのは発光して正体が明かされてから（setGateRevealed）。それまでは全房とも鉄色
    const leaves = [], bars = [];
    const mkDoor = (sx) => {
      const piv = new THREE.Group();
      piv.position.set(sx * (GW / 2 - .13), 0, .5);
      // 合わせ目が手前へ出る浅いくの字（参考0240）。開閉は piv、折れは fold が担う
      const fold = new THREE.Group();
      fold.rotation.y = sx * .13;
      piv.add(fold);
      const leaf = new THREE.Mesh(sx > 0 ? leafGeoR : leafGeoL, leafMats[kind]);
      leaf.position.set(-sx * LEAF_W / 2, DOOR_Y + DOOR_H / 2, 0);
      leaf.renderOrder = 3;
      fold.add(leaf);
      leaves.push(leaf);
      // 絵の框に重ねる厚みのある框（開いた扉を横から見ても板に見える）
      const seamBar = rbox(.032, DOOR_H, .05, .008, fm, -sx * (LEAF_W - .016), DOOR_Y + DOOR_H / 2, -.016);
      const hingeBar = rbox(.032, DOOR_H * .9, .05, .008, fm, -sx * .016, DOOR_Y + DOOR_H * .45, -.016);
      fold.add(seamBar, hingeBar);
      bars.push(seamBar, hingeBar);
      one.add(piv);
      return piv;
    };
    const dl = mkDoor(-1), dr = mkDoor(1);
    if (isSSR) {
      // 光柱
      const pillar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 14), M.add({ color: 0xf4ecff, opacity: .0 }));
      pillar.position.set(0, 7, .3);
      one.add(pillar);
      W.ssrPillar = pillar;
      // 虹色シアーを薄く重ね、最後のゲートだけSSRの色変化を出す。
      const sheen = new THREE.Mesh(new THREE.PlaneGeometry(LEAF_W * 2, DOOR_H), M.add({ map: TEX.rainbowSheen, opacity: 0 }));
      sheen.position.set(0, DOOR_Y + DOOR_H / 2, .6);
      sheen.renderOrder = 4;
      one.add(sheen);
      W.ssrSheen = sheen;
      // シルエットカット用の強い逆光（影の真後ろで白く飛ばす）
      const backlight = sprite(TEX.bokeh, 0xffffff, 2.5, 0);
      backlight.material.color.setRGB(1.7, 1.6, 1.8);
      backlight.position.set(0, 1.5, -.7);
      one.add(backlight);
      W.ssrBacklight = backlight;
      // 到達時のバースト（参考0216）
      const burst = sprite(TEX.bokeh, 0xff85dc, .1, 0);
      burst.position.set(0, 1.5, .8);
      one.add(burst);
      W.ssrBurst = burst;
    }
    // レアリティグロー（房の奥の逆光ハロ）
    let glowS = null;
    if (isSSR || isSR) {
      glowS = sprite(TEX.bokeh, isSSR ? 0xf3e5ff : 0xffe8b0, isSSR ? 3.6 : 2.5, isSSR ? .42 : .34);
      glowS.position.set(0, 1.5, isSSR ? -1.5 : -.6);
      one.add(glowS);
    }
    gates.add(one);
    W.gateObjs.push({ group: one, doors: [dl, dr], glow: glowS, shadow, shadowGlow, isSSR, isSR, n, x,
      kind, metal: fm, leaves, bars, revealed: true });
  }
  batchStaticMeshes(gateStatic);
  // 横パンで房が画面中央に来た瞬間、扉の前に光の粒をあふれさせる（房ごとの色）
  W.gateBursts = new GateBursts(W.gateObjs.map((go) => ({
    x: go.x,
    colors: (go.isSSR ? [0xff9ddc, 0xfff3a8, 0xa8f0ff, 0xd9b8ff, 0xffffff]
      : go.isSR ? [0xffe45a, 0xfff2a0, 0xffc93a] : [0xffffff, 0xeaf6ff, 0xdff0ff])
      .map((hex) => new THREE.Color(hex)),
  })));
  gates.add(W.gateBursts.points);
  // ---- 上部構造: 緑トラス → 黄プレート列 → 湾曲看板 → 立体鋳鉄クレスト+中央エンブレム ----
  const trussRods = [];
  for (const z of [.12, -.45]) {
    for (const y of [2.88, 3.56]) trussRods.push([[-7.4, y, z], [7.4, y, z]]);
    for (let i = 0; i < 20; i++) {
      const x = -7.4 + i * .74;
      trussRods.push([[x, i % 2 ? 3.56 : 2.88, z], [x + .74, i % 2 ? 2.88 : 3.56, z]]);
    }
  }
  for (let i = 0; i <= 10; i++) {
    for (const y of [2.88, 3.56]) trussRods.push([[-7.4 + i * 1.48, y, .12], [-7.4 + i * 1.48, y, -.45]]);
  }
  gates.add(instancedRods(trussRods, .032, gateGreen));

  // 高さ一定の板を頂部だけ持ち上げ、原作の低い弓形看板を実形状で作る。
  const ribbonGeometry = (width, height, rise, segments = 48) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const x = (u - .5) * width;
      const lift = Math.cos((u - .5) * Math.PI) * rise;
      pos.push(x, -height / 2 + lift, 0, x, height / 2 + lift, 0);
      uv.push(u, 0, u, 1);
      if (i < segments) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const bannerFrameMat = M.lamb({ color: 0x174e35, emissive: 0x031309, side: THREE.DoubleSide });
  const bannerFrame = new THREE.Mesh(ribbonGeometry(10.72, .88, .25), bannerFrameMat);
  bannerFrame.position.set(0, 4.05, .3);
  gates.add(bannerFrame);
  const banner = new THREE.Mesh(
    ribbonGeometry(10.4, .66, .23),
    M.basic({ map: TEX.banner, side: THREE.DoubleSide, fog: false })
  );
  banner.position.set(0, 4.07, .39);
  gates.add(banner);

  // 看板の背後を走る鋳鉄アーチ。太い暗緑の芯に明るい緑を重ねて丸棒の厚みを出す。
  const crestDark = M.lamb({ color: 0x164e3d, emissive: 0x06170f });
  const crestGreen = M.lamb({ color: 0x3b9669, emissive: 0x0c2b1b });
  const crestGold = M.lamb({ color: 0xf0bd4f, emissive: 0x5b3908 });
  const tubeFrom = (points, radius, mat, tubularSegments = 48) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false), mat);
  };
  const archPoints = [
    [-7.2, 4.46, .2], [-5.3, 4.5, .2], [-3.4, 4.6, .2],
    [-1.7, 4.79, .2], [0, 5.05, .2],
    [1.7, 4.79, .2], [3.4, 4.6, .2], [5.3, 4.5, .2], [7.2, 4.46, .2],
  ];
  gates.add(tubeFrom(archPoints, .098, crestDark, 72));
  const archHighlight = archPoints.map(([x, y]) => [x, y + .015, .255]);
  gates.add(tubeFrom(archHighlight, .046, crestGreen, 72));
  gates.add(box(14.45, .09, .14, crestDark, 0, 4.38, .18));

  // 波形の鋳鉄スクロール（参考0160・0196）。両端の大波と、看板の上に並ぶ小波。いずれも中央へ向かって巻く。
  const crestMat = cutout(TEX.crest);
  const crestGeo = new THREE.PlaneGeometry(1, 1), crestGeoFlip = flipU(crestGeo.clone());
  for (const sx of [-1, 1]) {
    for (const [cx, baseY, width, height] of [[6.38, 3.6, 1.9, 1.2], [3.7, 4.5, 1.5, .72], [1.62, 4.6, 1.3, .62]]) {
      const scroll = new THREE.Mesh(sx > 0 ? crestGeoFlip : crestGeo, crestMat);
      scroll.scale.set(width, height, 1);
      scroll.position.set(sx * cx, baseY + height / 2, .26);
      scroll.renderOrder = 2;
      gates.add(scroll);
    }
  }
  // 中央の金エンブレム（白い翼 + 月桂樹 + 星入りの蹄鉄）
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.425), cutout(TEX.emblem));
  emblem.position.set(0, 5.1, .46);
  emblem.renderOrder = 3;
  gates.add(emblem);

  // 両端支柱と球形フィニアル。
  for (const sx of [-1, 1]) {
    gates.add(box(.22, 4.76, .22, crestDark, sx * 7.25, 2.38, -.1));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 9), crestGold);
    cap.position.set(sx * 7.25, 4.73, .02);
    gates.add(cap);
  }
  // 原作の正面カットでは袖柵を見せない。互換用に空グループだけ保持する。
  const wings = new THREE.Group();
  gates.add(wings);
  W.gateWings = wings;
  // ゲート足元の薄霧（参考13/195246）
  const mist = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const s = sprite(TEX.bokeh, 0xffffff, rand(2.0, 3.2), .05);
    s.position.set(rand(-7, 7), .3, .9);
    mist.add(s);
  }
  gates.add(mist);
  W.gateMist = mist;
  g.add(gates);
  W.gatesG = gates;
  // 全景カットでゲートの足元と地平を白く飛ばすもや（参考0139–0156）。必要なカットだけ表示する
  const haze = new THREE.Group();
  const veilMat = (map, opacity) => new THREE.MeshBasicMaterial({
    map, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(70, 2.3), veilMat(TEX.haze, .55));
  front.position.set(0, .95, RACE_LAYOUT.gateZ + 1.25);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(240, 9), veilMat(TEX.haze, .95));
  back.position.set(0, 4.3, RACE_LAYOUT.gateZ - 9);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 12), veilMat(TEX.hazeGround, .75));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, .02, RACE_LAYOUT.gateZ + 1.25 + 6);
  front.renderOrder = 5; ground.renderOrder = 5; back.renderOrder = -2;
  haze.add(back, front, ground);
  haze.visible = false;
  g.add(haze);
  W.gateHaze = haze;

  // ---- スタートランプ（グレー支柱 + 緑トラス + 箱型赤LEDパネル / 参考195308） ----
  const lampG = new THREE.Group();
  lampG.position.set(9.5, 0, -5.3);
  const greenM = M.std({ color: 0x2a7a52, metalness: .52, roughness: .34 });
  const poleM = M.std({ color: 0x9aa4ad, metalness: .7, roughness: .26 });
  lampG.add((() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 2.6, 16), poleM); m.position.set(0, 1.3, 0); return m; })());
  // 緑トラスのブラケット
  lampG.add(box(1.1, .13, .13, greenM, 0, 3.05, .2));
  lampG.add(box(.13, .13, .8, greenM, -.45, 3.05, .2));
  lampG.add(box(.13, .13, .8, greenM, .45, 3.05, .2));
  lampG.add(box(.1, .55, .1, greenM, 0, 2.75, .2));
  const braceL = box(.54, .075, .075, greenM, -.225, 2.9, .2);
  braceL.rotation.z = -.588;
  const braceR = box(.54, .075, .075, greenM, .225, 2.9, .2);
  braceR.rotation.z = .588;
  lampG.add(braceL, braceR);
  // 箱型パネルは外箱・落とし込み・LED面・取付ボルトの4層で作る。
  const signalFrame = M.std({ color: 0x25262d, metalness: .64, roughness: .28 });
  const signalInset = M.std({ color: 0x471713, metalness: .18, roughness: .46 });
  lampG.add(rbox(.86, .86, .24, .06, signalFrame, 0, 2.45, .45));
  lampG.add(rbox(.69, .69, .035, .035, signalInset, 0, 2.45, .578));
  lampG.add(rbox(.9, .12, .34, .035, signalFrame, 0, 2.91, .43));
  // 発走灯の下は柵状の横桟ではなく、参考225–235の白い切妻屋根にする。
  const signalRoof = M.std({ color: 0xeef2f6, metalness: .18, roughness: .4 });
  for (const side of [-1, 1]) {
    const sheet = rbox(1.12, .085, 1.15, .02, signalRoof, side * .53, 1.67, -.42);
    sheet.rotation.z = -side * .22;
    lampG.add(sheet);
  }
  // LED面は消灯/点灯の2枚を切り替える（点灯側はHDR色でブルームに乗せ、粒は読めるまま残す）
  const faceGeo = new THREE.PlaneGeometry(.59, .59);
  W.lampFaceOff = new THREE.Mesh(faceGeo, M.basic({ map: TEX.led, fog: false }));
  W.lampFaceOn = new THREE.Mesh(faceGeo, M.basic({ map: TEX.ledOn, fog: false, color: new THREE.Color(1.5, 1.45, 1.45) }));
  for (const face of [W.lampFaceOff, W.lampFaceOn]) { face.position.set(0, 2.45, .598); lampG.add(face); }
  // 奥まったLED面を囲む深いフード（参考0226: 箱の内側にLEDが落とし込まれている）
  const hoodMat = M.std({ color: 0x57505e, emissive: 0x141118 });
  for (const [w, h, x, y] of [[.82, .055, 0, 2.835], [.82, .055, 0, 2.065], [.055, .82, -.3825, 2.45], [.055, .82, .3825, 2.45]]) {
    lampG.add(box(w, h, .26, hoodMat, x, y, .7));
  }
  W.lampGlow = sprite(TEX.bokeh, 0xff3a20, .01, 0);
  W.lampGlow.position.set(0, 2.45, 1.0);
  lampG.add(W.lampGlow);
  g.add(lampG);
  W.lampG = lampG;
  W.lampPos = new THREE.Vector3(9.5, 2.45, -4.7);

  g.visible = false;
  return g;
}

// ---------- 確定演出背景（パステル） ----------
function buildReveal() {
  const g = new THREE.Group();
  // シルエット/セリフ用のパステルと、カラー確定用の青空+光線を切替（参考195346→19）
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(12, 8.5), M.basic({ map: TEX.pastel, fog: false }));
  bg.position.set(0, 1.25, -4.5);
  g.add(bg);
  W.revealBgPastel = bg;
  const sky2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 8.5), M.basic({ map: TEX.revealSky, fog: false }));
  sky2.position.set(0, 1.25, -4.5);
  sky2.visible = false;
  g.add(sky2);
  W.revealBgSky = sky2;
  W.revealSpark = new Sparkles(60, new THREE.Vector3(0, 1.4, -2.5), new THREE.Vector3(3.5, 3, 2.5), 0xfff0fa, .35);
  g.add(W.revealSpark.pts);
  // 後光: カードの背後でゆっくり回る光条と、登場時に広がる光輪（カード自体は静止させたまま画面を動かす）
  W.revealRays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.add({ map: TEX.rays, color: 0xfff6dc, opacity: 0 }));
  W.revealRays.position.set(0, 1.32, -1.8);
  W.revealRays.scale.setScalar(8.5);
  g.add(W.revealRays);
  W.revealRing = sprite(TEX.ring, 0xffffff, .1, 0);
  W.revealRing.position.set(0, 1.32, -.4);
  g.add(W.revealRing);
  // 黒シルエット跳躍の背後ハロ（原作t29.0: 図の縁が白く光る）
  W.teaserGlow = sprite(TEX.bokeh, 0xfffef2, 4.6, 0);
  W.teaserGlow.position.set(0, 1.35, -2.0);
  g.add(W.teaserGlow);
  // カラー確定時の左上の金色バースト（原作t33-34.5）
  // reveal は fov33 の狭角クローズアップなので、画角の左上隅ぎりぎりに置く
  W.revealSun = sprite(TEX.bokeh, 0xffd98a, 5.5, 0);
  W.revealSun.position.set(-1.1, 2.5, -3.4);
  g.add(W.revealSun);
  const sunCross = sprite(TEX.cross, 0xffe9b8, 2.6, 0);
  sunCross.position.set(-.95, 2.35, -3.3);
  g.add(sunCross);
  W.revealSunCross = sunCross;
  g.visible = false;
  return g;
}

// ---------- 年賀ハガキ 3D（VRM の代役 = この演出の主役） ----------
function loadImg(src, timeout = 4000) {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const to = setTimeout(() => res(null), timeout);
    img.onload = () => { clearTimeout(to); res(img); };
    img.onerror = () => { clearTimeout(to); res(null); };
    img.src = src;
  });
}
function wrapLines(g, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}
// 表: 宛名面（切手 + 郵便番号枠 + 縦書き宛名 + 差出人）
async function drawHagakiFront(data) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 758;
  const g = c.getContext('2d');
  g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 512, 758);
  // 紙の質感
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(180,160,120,${Math.random() * .05})`; g.fillRect(Math.random() * 512, Math.random() * 758, 2, 2); }
  // 上端の「年賀」帯風ライン
  g.fillStyle = '#d8404a'; g.fillRect(0, 0, 512, 6);
  // 切手（画像があれば使用）
  const kitte = await loadImg('./images/kitte.png');
  if (kitte) g.drawImage(kitte, 28, 30, 96, 118);
  else {
    g.fillStyle = '#e8b94f'; g.fillRect(28, 30, 96, 118);
    g.strokeStyle = '#a87820'; g.lineWidth = 4; g.strokeRect(28, 30, 96, 118);
  }
  g.strokeStyle = 'rgba(200,60,70,.65)'; g.lineWidth = 2;
  g.strokeRect(24, 26, 104, 126);
  // 郵便番号枠（右上: 3桁 + 4桁）
  g.strokeStyle = '#d8404a'; g.lineWidth = 3;
  g.font = '700 26px "Noto Sans JP", sans-serif'; g.fillStyle = '#d8404a';
  g.fillText('〒', 200, 66);
  for (let i = 0; i < 3; i++) g.strokeRect(232 + i * 40, 34, 32, 42);
  for (let i = 0; i < 4; i++) g.strokeRect(232 + 3 * 40 + 10 + i * 34, 38, 27, 38);
  // 消印風スタンプ（2027 元旦）
  g.save();
  g.translate(150, 92); g.rotate(-.12);
  g.strokeStyle = 'rgba(120,110,100,.7)'; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.stroke();
  g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(120,110,100,.85)';
  g.font = '700 15px "Noto Sans JP", sans-serif'; g.textAlign = 'center';
  g.fillText('2027', 0, -8);
  g.fillText('1.1', 0, 12);
  g.restore();
  // 縦書き宛名（中央）
  const name = `${data.a ?? ''}${data.h ? ' ' + data.h : ''}`.trim() || '宛名 太郎 様';
  const chars = [...name.replace(/\s+/g, ' ')];
  const fs = Math.min(58, Math.floor(520 / Math.max(1, chars.length)));
  g.font = `700 ${fs}px "Noto Sans JP", serif`;
  g.fillStyle = '#20242c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let y = 200 + fs * .5;
  for (const ch of chars) {
    if (ch === ' ') { y += fs * .5; continue; }
    g.fillText(ch, 288, y);
    y += fs * 1.08;
  }
  // 差出人（左下・小さめ縦書き）
  const sender = (data.s ?? '').trim();
  if (sender) {
    g.font = '500 30px "Noto Sans JP", serif';
    let sy = 470;
    for (const ch of [...sender.replace(/\s+/g, ' ')]) {
      if (ch === ' ') { sy += 16; continue; }
      g.fillText(ch, 96, sy);
      sy += 34;
    }
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
// 裏: 挨拶面（背景画像 + 謹賀新年 + 挨拶文パネル）
async function drawHagakiBack(data) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 758;
  const g = c.getContext('2d');
  // 背景（共有データの bgurl。読めなければ和風グラデ）
  const bg = await loadImg(data.bgurl);
  if (bg) {
    const s = Math.max(512 / bg.width, 758 / bg.height);
    const dw = bg.width * s, dh = bg.height * s;
    try { g.drawImage(bg, (512 - dw) / 2, (758 - dh) / 2, dw, dh); }
    catch (e) { g.fillStyle = '#f6ead8'; g.fillRect(0, 0, 512, 758); }
  } else {
    const grd = g.createLinearGradient(0, 0, 0, 758);
    grd.addColorStop(0, '#fdeee0'); grd.addColorStop(.55, '#f8dfc8'); grd.addColorStop(1, '#f3cfae');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 758);
    g.fillStyle = 'rgba(216,64,74,.85)';
    g.beginPath(); g.arc(420, 96, 54, 0, TAU); g.fill(); // 初日の出
  }
  // 謹賀新年（画像があれば右上に縦配置）
  if (data.pv !== 0) {
    const kin = await loadImg('./images/kingasinnen.png');
    if (kin) {
      const kw = 120, kh = kw * kin.height / kin.width;
      try { g.drawImage(kin, 512 - kw - 26, 26, kw, Math.min(kh, 420)); } catch (e) { }
    } else {
      g.font = '900 64px "Noto Sans JP", serif';
      g.fillStyle = '#b8332e'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const t = '謹賀新年';
      [...t].forEach((ch, i) => g.fillText(ch, 448, 80 + i * 70));
    }
  }
  // 挨拶文パネル
  const msg = (data.m ?? '').trim() || '新年 あけましておめでとうございます!';
  g.font = '500 27px "Noto Sans JP", sans-serif';
  const lines = wrapLines(g, msg, 380);
  const lh = 40, panelH = lines.length * lh + 48;
  const py = 758 - panelH - 56;
  if (data.mbg !== 0) {
    g.fillStyle = 'rgba(255,255,255,.82)';
    g.beginPath(); g.roundRect(36, py, 440, panelH, 18); g.fill();
  }
  g.fillStyle = '#3a3630'; g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach((ln, i) => g.fillText(ln, 60, py + 26 + i * lh));
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
// ハガキ本体（表裏板ポリ + 薄い厚み）。W.hagaki(位置) > W.hagakiPivot(回転/はためき)
// テクスチャは3段階: 白紙の仮テクスチャ → 手描きの予備（裏で用意）→ 実カードから作った本番。
// 予備は画像の読み込みを待つので、開演の準備は待たせない（同期で組み上げる）
export function buildHagaki(data) {
  const HW = 1.0, HH = 1.48;
  const blank = () => ct(4, 4, (g, w, h) => { g.fillStyle = '#fffdf6'; g.fillRect(0, 0, w, h); });
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  // 宛名面はガチャ演出中のブルームを拾いすぎない紙色にし、文字のコントラストを保つ。
  // 挨拶面はDOMキャプチャの色をそのまま使い、表示画面とリザルトの色味を揃える。
  const FRONT_PAPER = 0xd8dad8;
  const BACK_PAPER = 0xffffff;
  const fmat = new THREE.MeshBasicMaterial({
    map: blank(),
    color: FRONT_PAPER,
    fog: false,
    toneMapped: true,
  });
  const bmat = new THREE.MeshBasicMaterial({
    map: blank(),
    color: BACK_PAPER,
    fog: false,
    toneMapped: false,
  });
  const emat = M.std({ color: 0xd6d0c0, roughness: .88, metalness: 0, fog: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(HW, HH), fmat);
  // 表裏の面を厚みメッシュから明確に離し、回転中のZ-fightingによる明滅を防ぐ。
  front.position.z = .0085;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HW, HH), bmat);
  back.rotation.y = Math.PI;
  back.position.z = -.0085;
  const edge = new THREE.Mesh(new RoundedBoxGeometry(HW + .008, HH + .008, .012, 4, .012), emat);
  front.renderOrder = 2;
  back.renderOrder = 2;
  pivot.add(edge, front, back);
  g.add(pivot);
  g.visible = false;
  for (const m of [fmat, bmat, emat]) m.userData.baseColor = m.color.clone();
  W.scene.add(g);
  W.hagaki = g;
  W.hagakiPivot = pivot;
  W.hagakiMats = [fmat, bmat, emat];
  W.hagakiReal = [false, false];
  drawHagakiFront(data).then((tex) => { if (!W.hagakiReal[0]) swapHagakiMap(0, tex); }).catch(() => { });
  drawHagakiBack(data).then((tex) => { if (!W.hagakiReal[1]) swapHagakiMap(1, tex); }).catch(() => { });
  return g;
}
function swapHagakiMap(index, texture) {
  const material = W.hagakiMats[index];
  material.map?.dispose();
  material.map = texture;
  W.renderer.initTexture(texture);   // 表示される瞬間ではなく、今のうちにGPUへ送る
}
function setHagakiFace(index, canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  W.hagakiReal[index] = true;
  swapHagakiMap(index, texture);
}
// 実カード（画面表示そのもの）からテクスチャを作る。手描きの予備はレイアウトが実表示と一致しないため、
// 成功したら必ずこちらを使う。
// html2canvas は使わない（複製した文書を組み直すので、縦書きや折り返し位置が画面と変わることがある）。
// 宛名面: 画面の実レイアウトを測って描く（数ms）。開演の直前に呼ぶ
export async function refreshHagakiFront() {
  const { renderAddressFaceCanvas } = await import('../print.js');
  setHagakiFace(0, renderAddressFaceCanvas());
}
// 挨拶面: 同じく実レイアウトを測って描く（背景画像の読み込みを待つので非同期）。
// 大きなテクスチャの転送が扇子カットに重ならないよう、3Dの動きが無いセリフ画面で始め、
// 確定画面はこの完了を待ってからカードを出す
let backCapture = null;
let captureErrorHandler = null;
export function onCardCaptureError(handler) { captureErrorHandler = handler; }
export function resetCardCapture() { backCapture = null; }
export function ensureHagakiBack() {
  backCapture ??= import('../print.js')
    .then(({ renderGreetingFaceCanvas }) => renderGreetingFaceCanvas())
    .then((canvas) => { setHagakiFace(1, canvas); return true; })
    .catch((error) => { captureErrorHandler?.(error); return false; });
  return backCapture;
}
export function showHagaki(v) { if (W.hagaki) W.hagaki.visible = v; }
// 黒シルエット化（テクスチャ色を乗算で落とす。解除時はアイボリー基調色へ戻す）
export function setHagakiSilhouette(on, factor = .04) {
  if (!W.hagakiMats) return;
  for (const m of W.hagakiMats) {
    if (on) m.color.setScalar(factor);
    else m.color.copy(m.userData.baseColor);
  }
}
export function resetHagakiPose() {
  if (!W.hagaki) return;
  W.hagaki.position.set(0, 0, 0);
  W.hagaki.rotation.set(0, 0, 0);
  W.hagaki.scale.setScalar(1);
  W.hagakiPivot.rotation.set(0, 0, 0);
  W.hagakiPivot.position.set(0, 0, 0);
  W.hagakiPivot.scale.setScalar(1);
}

// ---------- 3D扇子 + 手（「激熱ッ！」カットイン用） ----------
// 蛇腹に折れた扇面（アニュラーセクタ。放射ラインごとに z を交互に振って折り目を作る）
// 扇面テクスチャ（青海波 + 小紋 + 筆文字「激熱ッ！」）。展開図: x=角度方向, y=半径方向(上=外周)
async function fanPaperTexture() {
  // 筆文字フォントは長く待たない（遅い回線ではゴシックで描き、届いた時点で描き直す）
  const brushLabel = '\u6fc0\u71b1\u30c3!!';
  const brush = document.fonts.load('200px "Yuji Boku"', brushLabel).catch(() => { });
  await Promise.race([brush, new Promise((resolve) => setTimeout(resolve, 900))]);
  const draw = (g, w, h) => {
    const paper = g.createLinearGradient(0, 0, 0, h);
    paper.addColorStop(0, '#edf8fb');
    paper.addColorStop(.34, '#fbfdfc');
    paper.addColorStop(.72, '#f4f9fa');
    paper.addColorStop(1, '#e2f0f4');
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    // 28枚の扇面を白青の細い陰影で分ける。
    for (let i = 0; i < 28; i++) {
      g.fillStyle = i % 2 ? 'rgba(88,155,188,.105)' : 'rgba(255,255,255,.2)';
      g.fillRect((w / 28) * i, 0, w / 28, h);
      g.fillStyle = 'rgba(75,127,157,.07)';
      g.fillRect((w / 28) * i, 0, 2, h);
    }
    // 原作の外周は白地に細い二重線だけ。青緑の装飾は要側へ集める。
    for (const [yy, width, col] of [
      [h * .035, 4, '#bfdbe4'],
      [h * .075, 3, '#94bfce'],
    ]) {
      g.strokeStyle = col; g.lineWidth = width;
      g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke();
    }

    // 要側の入れ子状の羽根文様。白縁→青緑→青紫の順で細く収束させる。
    const cellW = w / 27;
    g.strokeStyle = '#75c8c4'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, h * .665); g.lineTo(w, h * .665); g.stroke();
    for (let i = 0; i < 27; i++) {
      const x = (i + .5) * cellW;
      const half = cellW * .49;
      // 白い花弁状の縁
      g.fillStyle = '#eef9f7';
      g.strokeStyle = '#72cbc6'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x - half, h * .70);
      g.quadraticCurveTo(x - half * .62, h * .635, x, h * .655);
      g.quadraticCurveTo(x + half * .62, h * .635, x + half, h * .70);
      g.lineTo(x + half * .72, h * .79);
      g.lineTo(x - half * .72, h * .79);
      g.closePath(); g.fill(); g.stroke();

      // 原作に近い低彩度の青緑パネル
      const feather = g.createLinearGradient(x, h * .69, x, h * .94);
      feather.addColorStop(0, '#83d6cf');
      feather.addColorStop(.58, '#4da9bd');
      feather.addColorStop(1, '#477da9');
      g.fillStyle = feather;
      g.beginPath();
      g.moveTo(x - half * .88, h * .715);
      g.lineTo(x, h * .675);
      g.lineTo(x + half * .88, h * .715);
      g.lineTo(x + half * .58, h * .89);
      g.lineTo(x, h * .94);
      g.lineTo(x - half * .58, h * .89);
      g.closePath(); g.fill();

      // 白い菱と、その下の藍紫の雫
      g.fillStyle = 'rgba(246,252,250,.93)';
      g.beginPath();
      g.moveTo(x, h * .70);
      g.lineTo(x + half * .24, h * .75);
      g.lineTo(x, h * .80);
      g.lineTo(x - half * .24, h * .75);
      g.closePath(); g.fill();
      g.fillStyle = i % 2 ? '#4d5c9b' : '#536eaa';
      g.beginPath();
      g.moveTo(x, h * .80);
      g.quadraticCurveTo(x + half * .43, h * .86, x, h * .975);
      g.quadraticCurveTo(x - half * .43, h * .86, x, h * .80);
      g.fill();
    }
    // 原作の黒い筆文字。
    g.save();
    g.translate(w / 2, h * .52);
    g.rotate(-.025);
    g.fillStyle = '#11131a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 194;
    const label = '\u6fc0\u71b1\u30c3!!';
    do {
      g.font = `900 ${fs}px "Yuji Boku", "Noto Sans JP", serif`;
      fs -= 4;
    } while (g.measureText(label).width > w - 72 && fs > 126);
    g.fillText(label, 0, 0);
    g.restore();
    // 小さな朱印。
    g.fillStyle = 'rgba(204,66,68,.88)';
    g.fillRect(w * .88, h * .61, 46, 46);
    g.fillStyle = '#fff8ed';
    g.font = '700 26px "Noto Sans JP", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('\u65b0\u6625', w * .88 + 23, h * .61 + 24);
  };
  const texture = ct(1024, 512, draw);
  if (!document.fonts.check('200px "Yuji Boku"', brushLabel)) {
    brush.then(() => { draw(texture.image.getContext('2d'), 1024, 512); texture.needsUpdate = true; });
  }
  return texture;
}
export async function buildFan3D() {
  const R = .52, RI = .13, FOLDS = 28;
  const A1 = Math.PI * (20 / 180), A2 = Math.PI * (160 / 180);
  // outer(位置+カメラ正対) > inner(傾き/扇ぎアニメ) の2層
  const outer = new THREE.Group();
  const group = new THREE.Group();
  outer.add(group);

  // 扇面（両面・折り目付き）
  const paperTex = await fanPaperTexture();
  const paper = new THREE.Mesh(
    fanSectorGeometry(RI, R, A1, A2, FOLDS, .012),
    // 生成りの和紙色を固定し、ブルーム閾値を越える純白にはしない。
    new THREE.MeshLambertMaterial({ map: paperTex, color: 0xf0f2ef, emissive: 0x343838, side: THREE.DoubleSide, fog: false })
  );
  group.add(paper);
  // 要の隙間から背景色が透けて虹色に見えないよう、藍色の地板で塞ぐ。
  const innerLeaf = new THREE.Mesh(
    new THREE.CircleGeometry(RI + .008, 32, A1, A2 - A1),
    M.basic({ color: 0xdcebed, side: THREE.DoubleSide, fog: false })
  );
  innerLeaf.position.z = -.016;
  group.add(innerLeaf);

  // 骨（中骨24本 + 太い親骨2本）と要
  const ribMat = M.basic({ color: 0xb7cbd5, fog: false });
  for (let i = 0; i <= FOLDS; i += 2) {
    const a = A1 + (A2 - A1) * (i / FOLDS);
    const rib = rbox(.008, R - .02, .007, .002, ribMat, 0, 0, 0);
    rib.position.set(Math.cos(a) * (R - .02) / 2, Math.sin(a) * (R - .02) / 2, -.012);
    rib.rotation.z = a - Math.PI / 2;
    group.add(rib);
  }
  const guardMat = M.std({ color: 0x5b6080, emissive: 0x000000, metalness: 0, roughness: .64 });
  for (const a of [A1, A2]) {
    const guard = rbox(.024, R + .01, .014, .004, guardMat, 0, 0, 0);
    guard.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, .002);
    guard.rotation.z = a - Math.PI / 2;
    group.add(guard);
  }
  const pinMat = M.std({ color: 0x68a8b1, emissive: 0x000000, metalness: .08, roughness: .55 });
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .05, 20), pinMat);
  pin.rotation.x = Math.PI / 2;
  group.add(pin);
  // 手元の柄（握り）
  group.add(rbox(.034, .13, .022, .004, guardMat, 0, -.085, 0));

  group.add(buildFanHand());

  outer.visible = false;
  W.scene.add(outer);
  W.fan3d = outer;
  W.fan3dInner = group;
  return outer;
}

// ---------- 環境切替 ----------
export function setEnv(name) {
  const { scene, corridorG, raceG, revealG, amb, key, rim } = W;
  corridorG.visible = name === 'corridor';
  raceG.visible = name === 'race';
  revealG.visible = name === 'reveal';
  if (name === 'corridor') {
    scene.background = new THREE.Color(0x4a2922);
    scene.fog = new THREE.Fog(0x684334, 14, 34);
    amb.color.set(0xffe6cf); amb.intensity = .8;
    key.color.set(0xffdfbd); key.intensity = 1.0; key.position.set(2, 4, 5);
    rim.color.set(0xffb47d); rim.intensity = .3; rim.position.set(0, 3, -7);
  } else if (name === 'race') {
    scene.background = new THREE.Color(0xbfe4ff);
    scene.fog = new THREE.Fog(0xbce3eb, 85, 300);
    amb.color.set(0xffffff); amb.intensity = .68;
    key.color.set(0xfff6e0); key.intensity = 1.05; key.position.set(40, 70, 40);
    rim.color.set(0x9cc8ff); rim.intensity = .34; rim.position.set(0, 10, -30);
  } else if (name === 'reveal') {
    scene.background = new THREE.Color(0xffe6f2);
    scene.fog = null;
    amb.color.set(0xffffff); amb.intensity = .56;
    key.color.set(0xffffff); key.intensity = .62; key.position.set(.5, 2.5, 5);
    rim.color.set(0xffd0ec); rim.intensity = .28; rim.position.set(0, 2, -4);
  } else {
    scene.background = new THREE.Color(0x000000);
    scene.fog = null;
  }
}

// 暗転カット用: 無照明の空・雲・芝をまとめて減光する（1で通常）
export function setRaceDim(level) {
  for (const mat of [W.skyMat, W.turfMat, W.grassMat, ...(W.cloudMats ?? [])]) mat?.color.setScalar(level);
}

// 発走灯はシーン内の固定物。光の状態とFXのリセットを分ける。
export function setStartLamp(lit) {
  W.lampG.visible = true;
  W.lampFaceOn.visible = lit;
  W.lampFaceOff.visible = !lit;
  W.lampGlow.material.opacity = lit ? .3 : 0;
  W.lampGlow.scale.setScalar(lit ? 1.7 : .01);
}

// ---------- FXリセット（フェーズ直接ジャンプ対応） ----------
const WHITE_AT_DEFAULT = Object.freeze([.58, .66]);
const BLUR_AT_DEFAULT = Object.freeze([.5, .5]);
// ゲートの色（参考0148→0160, 0205→0216）: 全景では全房とも鉄色。横パンで光の粒があふれた瞬間に
// はじめて金・虹へ変わる。色・房内の逆光・影絵をまとめて切り替える
function gateGlowLook(go) {
  if (go.revealed && go.isSSR) return { color: 0xffb4ec, scale: 3.0, opacity: .68 };
  if (go.revealed && go.isSR) return { color: 0xffd45e, scale: 2.6, opacity: .62 };
  return { color: 0xe5f6ff, scale: 2.15, opacity: .38 };
}
export function setGateRevealed(go, shown) {
  go.revealed = shown;
  const kind = shown ? go.kind : 'silver';
  for (const leaf of go.leaves) leaf.material = W.gateLeafMats[kind];
  for (const bar of go.bars) bar.material = shown ? go.metal : W.gateSteel;
  go.shadow.material.map = shown && go.isSSR ? TEX.cardShadowSSR : TEX.cardShadow;
  const look = gateGlowLook(go);
  go.shadowGlow.material.color.set(look.color);
  go.shadowGlow.scale.setScalar(look.scale);
  go.shadowGlow.material.opacity = look.opacity;
  if (go.glow) go.glow.visible = shown;
}
export function setGatesRevealed(shown) {
  for (const go of W.gateObjs) setGateRevealed(go, shown);
}
export function repaintGatePlates() {
  for (const { texture, n } of W.gatePlates ?? []) {
    paintGatePlate(texture.image.getContext('2d'), texture.image.width, texture.image.height, n);
    texture.needsUpdate = true;
  }
}

// 横パンの進行に合わせ、画面中央へ来た房だけを光らせる。光の粒は state.burst → updateWorldFx が描く
// amountOf: 房番号 → 光の強さ(0–1)。既定は「横パンで画面中央にある房ほど強い」
export function setGateCenterFlash(progress, time = 0, amountOf = (n) => gateFlashAmount(progress, n)) {
  state.burst = (index) => amountOf(W.gateObjs[index].n);
  for (const go of W.gateObjs) {
    const peak = amountOf(go.n);
    go.shadowGlow.material.opacity = gateGlowLook(go).opacity
      + Math.sin(time * 6 + go.x) * .08 + peak * .24;
  }
  if (W.ssrBurst) {
    const peak = amountOf(GACHA.ssrGate);
    W.ssrBurst.material.opacity = peak * .62;
    W.ssrBurst.scale.setScalar(.1 + peak * 5.2);
  }
}

export function resetFx({ lampLit = false } = {}) {
  state.bloom = .18; state.after = 0; state.radial = 0; state.shake = 0; state.whiteout = 0;
  state.frame = null;
  state.twist = 0;
  // 追加FX（光の粒 / スピード線 / きらめき軌跡 / 接地影 / レンズフレア / 白光の中心）
  state.burst = null; state.streak = 0; state.trail = 0; state.cardShadow = 0; state.flare = 0;
  state.whiteAt = WHITE_AT_DEFAULT;
  state.whiteFlat = 0; state.skyWhite = 0; state.horizonAt = .43; state.blurAt = BLUR_AT_DEFAULT;
  for (const lights of W.penlights ?? []) lights.pts.material.size = lights.baseSize;
  W.gateBursts?.reset();
  W.trail?.clear();
  if (W.gateHaze) W.gateHaze.visible = false;
  if (W.revealRays) W.revealRays.material.opacity = 0;
  if (W.revealRing) { W.revealRing.material.opacity = 0; W.revealRing.scale.setScalar(.1); }
  for (const mat of W.doorMats ?? []) mat.color.setScalar(1);
  setRaceDim(1);
  if (W.renderer) W.renderer.toneMappingExposure = .9;
  if (W.gradePass) W.gradePass.uniforms.grade.value = 1;
  const { doorFx } = W;
  doorFx.slit.material.opacity = 0; doorFx.slit.scale.set(1, 1, 1);
  doorFx.glow.material.opacity = 0; doorFx.glow.scale.setScalar(.1);
  doorFx.rays.scale.set(.01, .01, 1); doorFx.rays.rotation.z = 0; doorFx.rays.material.opacity = 0;
  doorFx.ring.material.opacity = 0; doorFx.ring.scale.setScalar(.1);
  doorFx.cross.material.opacity = 0; doorFx.cross.scale.setScalar(.1);
  W.doorL.rotation.y = 0; W.doorR.rotation.y = 0;
  W.doorShoe.material.opacity = 0;
  W.doorInner.material.opacity = 0;
  W.gatesG.visible = true;
  if (W.standG) W.standG.visible = true;
  if (W.raceRails) W.raceRails.visible = true;
  if (W.lampG) W.lampG.visible = true;
  if (W.gateMist) W.gateMist.visible = true;
  if (W.gateWings) W.gateWings.visible = true;
  if (W.standRoofUnder) W.standRoofUnder.visible = true;
  for (const go of W.gateObjs) {
    go.doors[0].rotation.y = 0; go.doors[1].rotation.y = 0;
    // 既定は「正体が明かされた後」の色。全景と横パンの冒頭だけフェーズ側で鉄色へ戻す
    setGateRevealed(go, true);
    if (go.glow) go.glow.material.opacity = go.isSSR ? .4 : .32;
    go.shadow.visible = true;
    go.shadowGlow.visible = true;
  }
  if (W.ssrPillar) W.ssrPillar.material.opacity = 0;
  if (W.ssrSheen) W.ssrSheen.material.opacity = 0;
  if (W.ssrBacklight) W.ssrBacklight.material.opacity = 0;
  if (W.ssrBurst) { W.ssrBurst.material.opacity = 0; W.ssrBurst.scale.setScalar(.1); }
  setStartLamp(lampLit);
  W.confetti.set(false);
  W.sparkles.set(false);
  W.revealSpark.set(false);
  for (const p of W.penlights ?? []) p.set(false);
  if (W.hagaki) { resetHagakiPose(); setHagakiSilhouette(false); }
  if (W.fan3d) W.fan3d.visible = false;
  if (W.teaserGlow) W.teaserGlow.material.opacity = 0;
  if (W.revealSun) W.revealSun.material.opacity = 0;
  if (W.revealSunCross) W.revealSunCross.material.opacity = 0;
  // 確定背景はパステル（シルエット/セリフ用）に戻す
  if (W.revealBgPastel) { W.revealBgPastel.visible = true; W.revealBgSky.visible = false; }
}

// ---------- 初期化 ----------
export function initWorld(canvas) {
  buildTextures();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = .9;
  W.renderer = renderer;

  const scene = new THREE.Scene();
  W.scene = scene;
  const camera = new THREE.PerspectiveCamera(50, 9 / 16, .05, 500);
  W.camera = camera;
  W.camState = { px: 0, py: 1.3, pz: 3, lx: 0, ly: 1.2, lz: 0, fov: 50, roll: 0 };

  // ライト
  W.amb = new THREE.AmbientLight(0xffffff, .8);
  W.key = new THREE.DirectionalLight(0xffffff, 1.2);
  W.rim = new THREE.DirectionalLight(0x88aaff, .5);
  scene.add(W.amb, W.key, W.rim, W.key.target);
  // カメラに貼り付く演出（スピード線・レンズゴースト）を描くため、カメラ自体をシーンへ入れる
  scene.add(camera);
  W.camFx = new THREE.Group();
  camera.add(W.camFx);

  // 各環境
  W.corridorG = buildCorridor(); scene.add(W.corridorG);
  W.raceG = buildRace(); scene.add(W.raceG);
  W.revealG = buildReveal(); scene.add(W.revealG);

  // パーティクル（競馬場用）
  W.confetti = new Confetti(800, new THREE.Vector3(0, 8, 14), new THREE.Vector3(16, 6, 22));
  W.raceG.add(W.confetti.mesh);
  W.sparkles = new Sparkles(150, new THREE.Vector3(0, 4.5, 3), new THREE.Vector3(13, 5, 10));
  W.raceG.add(W.sparkles.pts);

  // 疾走のスピード線とレンズゴースト（カメラ空間）
  W.streaks = new SpeedStreaks(TEX.streak);
  W.camFx.add(W.streaks.mesh);
  W.flareGhosts = [[.66, 1.25, 0xbff2ff, .2], [.4, 2.5, 0xcfeaff, .13], [.14, .85, 0xd8ffe9, .18]]
    .map(([along, size, color, opacity]) => {
      const ghost = sprite(TEX.ghost, color, size, 0);
      ghost.userData = { along, opacity };
      ghost.renderOrder = 8;
      ghost.visible = false;
      W.camFx.add(ghost);
      return ghost;
    });
  // 年賀状のきらめき軌跡と接地影
  W.trail = new SparkTrail(TEX.cross, 110, .15);
  scene.add(W.trail.points);
  W.cardShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0),
    new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  W.cardShadow.rotation.x = -Math.PI / 2;
  W.cardShadow.visible = false;
  scene.add(W.cardShadow);

  // ポストプロセス
  // 等倍表示（PC）は格子や手すりの縁が目立つのでMSAAをかける。高DPIの端末は負荷を優先して掛けない
  const pixelRatio = renderer.getPixelRatio();
  const gl = renderer.getContext();
  const canMultisample = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  const samples = pixelRatio < 1.75 && canMultisample ? Math.min(4, renderer.capabilities.maxSamples ?? 0) : 0;
  const composer = new EffectComposer(renderer,
    new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples }));
  composer.setPixelRatio(pixelRatio);
  composer.addPass(new RenderPass(scene, camera));
  const afterPass = new AfterimagePass(0);
  afterPass.enabled = false;
  composer.addPass(afterPass);
  // 通常の白い紙や手すりは発光させず、HDRの演出光だけをブルーム対象にする。
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(540, 960), .22, .45, .94);
  composer.addPass(bloomPass);
  const RadialShader = {
    uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, center: { value: new THREE.Vector2(.5, .5) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; varying vec2 vUv;
      void main(){
        vec2 dir = vUv - center;
        vec4 col = vec4(0.0); float total = 0.0;
        for (int i = 0; i < 14; i++) {
          float t = float(i) / 13.0;
          float w = 1.0 - t;
          col += texture2D(tDiffuse, vUv - dir * t * strength) * w;
          total += w;
        }
        gl_FragColor = col / total;
      }`,
  };
  const radialPass = new ShaderPass(RadialShader);
  radialPass.enabled = false;
  composer.addPass(radialPass);
  // アニメ調の仕上げ: 彩度ブースト + ほんのり暖色 + ビネット
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      sat: { value: 1.24 },
      vig: { value: .16 },
      grade: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float sat; uniform float vig; uniform float grade; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(.299, .587, .114));
        vec3 col = mix(vec3(l), c.rgb, mix(1.0, sat, grade));
        col *= mix(vec3(1.0), vec3(1.02, 1.0, .985), grade);
        float d = distance(vUv, vec2(.5, .52));
        col *= 1.0 - smoothstep(.46, .92, d) * vig * grade;
        gl_FragColor = vec4(col, c.a);
      }`,
  };
  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  W.gradePass = gradePass;
  composer.addPass(new OutputPass());
  // トーンマッピング後に光を広げる。1なら端まで完全な白になりカットを覆う。
  const whiteoutPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, amount: { value: 0 }, center: { value: new THREE.Vector2(.58, .66) },
      flatAmount: { value: 0 }, sky: { value: 0 }, horizon: { value: .43 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float amount; uniform vec2 center; varying vec2 vUv;
      uniform float flatAmount; uniform float sky; uniform float horizon;
      void main(){
        vec4 scene = texture2D(tDiffuse, vUv);
        vec2 offset = (vUv - center) * vec2(.5625, 1.0);
        float distanceToLight = length(offset);
        float radius = amount * 1.25;
        float spread = 1.0 - smoothstep(radius - .24, radius + .12, distanceToLight);
        float veil = smoothstep(0.0, .24, amount) * spread;
        vec3 exposed = scene.rgb + vec3(.22, .34, .36) * amount * (1.0 - distanceToLight);
        vec3 color = mix(exposed, vec3(1.0), veil);
        color = mix(color, vec3(1.0), smoothstep(.88, 1.0, amount));
        // 空だけを白く飛ばす: 地平線より上を覆い、引き際は地平線に沿った横一文字の光条が残る
        float above = smoothstep(horizon - .05, horizon + .015, vUv.y);
        float streak = exp(-pow((vUv.y - horizon) / (.022 + .1 * sky), 2.0));
        float skyVeil = max(sky * above, smoothstep(0.0, .6, sky) * streak * .9);
        color = mix(color, vec3(1.0), skyVeil);
        gl_FragColor = vec4(mix(color, vec3(1.0), flatAmount), scene.a);
      }`,
  });
  whiteoutPass.enabled = false;
  composer.addPass(whiteoutPass);
  W.whiteoutPass = whiteoutPass;
  W.composer = composer; W.bloomPass = bloomPass; W.afterPass = afterPass; W.radialPass = radialPass;

  // リサイズ（9:16ステージ / WebNenga 側と衝突しないよう --g* 変数に出す）
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let sh = vh, sw = sh * 9 / 16;
    if (sw > vw) { sw = vw; sh = sw * 16 / 9; }
    sw = Math.round(sw); sh = Math.round(sh);
    document.documentElement.style.setProperty('--gsw', sw + 'px');
    document.documentElement.style.setProperty('--gsh', sh + 'px');
    document.documentElement.style.setProperty('--gsu', (sh / 100) + 'px');
    renderer.setSize(sw, sh, false);
    composer.setSize(sw, sh);
    camera.aspect = sw / sh;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  resetFx();
  setEnv('none');
  return W;
}

// ---------- 事前準備（初回描画の引っかかり防止） ----------
// シェーダのコンパイルとテクスチャの転送は「その素材を最初に描いたフレーム」でまとめて走り、
// 扇子カットやコース登場の瞬間に数百msの停止になる。開演前（先読み中）に済ませておく。
// 再生中に裏で進めるとき用: フレームの空き時間に進める（空きが無くても60msで進む）
const pauseIdle = () => new Promise((resolve) => {
  if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 60 });
  else setTimeout(resolve, 16);
});
const warmed = new Set();
export async function prewarm(env, { passes = false, polite = false } = {}) {
  if (warmed.has(env)) return;
  warmed.add(env);
  const { renderer, camera, composer } = W;
  // polite: 再生中・閲覧中に裏で進める。数msごとに手を止め、フレームの空き時間へ回す。
  // 既定（開演待ち）は一気に進める。細かく譲ると、譲るたびに他の処理が挟まって合計が何倍にも延びる
  const sliced = async (items, work) => {
    let started = performance.now();
    for (const item of items) {
      work(item);
      if (polite && performance.now() - started > 6) { await pauseIdle(); started = performance.now(); }
    }
  };
  // 実シーンと同じ「ライトの本数・種類」と「フォグの有無」を持つ代理シーンを使う。
  // シェーダの種類はこの2つで決まるので、再生中のシーンの状態を触らずに裏で準備できる
  const proxy = new THREE.Scene();
  proxy.add(new THREE.AmbientLight(), new THREE.DirectionalLight(), new THREE.DirectionalLight());
  if (env === 'corridor' && !W.corridorG.visible) {
    W.corridorG.traverse((o) => { if (o.isPointLight) proxy.add(new THREE.PointLight(0xffffff, 1, o.distance, o.decay)); });
  }
  if (env !== 'reveal') proxy.fog = new THREE.Fog(0xffffff, 1, 10);
  const roots = {
    corridor: [W.corridorG, W.fan3d, W.hagaki, W.trail.points, W.cardShadow],
    race: [W.raceG, W.hagaki, W.camFx, W.trail.points, W.cardShadow],
    reveal: [W.revealG, W.hagaki],
  }[env].filter(Boolean);
  // ポストプロセスと同じ描画先（HDRのレンダーターゲット）を前提にコンパイルする。
  // 大きなグループは子ごとに分け、裏で進めるときに途中で手を止められるようにする
  const onComposerTarget = (work) => {
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.renderTarget1);
    try { return work(); } finally { renderer.setRenderTarget(previousTarget); }
  };
  await sliced(roots.flatMap((root) => (root.children.length > 6 ? root.children : [root])),
    (piece) => onComposerTarget(() => renderer.compile(piece, camera, proxy)));
  // ドライバ側の並列コンパイルが済むまで待つ（対応環境では主スレッドを止めない）
  await onComposerTarget(() => Promise.all(roots.map((root) => renderer.compileAsync(root, camera, proxy))));
  // テクスチャは少しずつGPUへ送る
  const textures = new Set();
  for (const root of roots) {
    root.traverse((object) => {
      for (const material of [].concat(object.material ?? [])) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
  }
  await sliced([...textures], (texture) => renderer.initTexture(texture));
  if (passes) {
    // ポストプロセス各段のシェーダは、全段を有効にして1フレーム描いて準備する（開演前の初期化時のみ）
    resetFx();
    setEnv(env);
    if (env === 'corridor' && W.fan3d) W.fan3d.visible = true;
    Object.assign(state, { after: .5, radial: .05, whiteout: .5, bloom: .3 });
    applyCamera(0);
    updateWorldFx(0, 0);
    composer.render();
    resetFx();
    setEnv('none');
  }
}

// ---------- 毎フレーム適用 ----------
const _shakeV = new THREE.Vector3();
export function applyCamera(t) {
  const cs = W.camState, cam = W.camera;
  let sx = 0, sy = 0;
  if (state.shake > 0.0001) {
    sx = (Math.sin(t * 67) + Math.sin(t * 41 + 1.7)) * .5 * state.shake;
    sy = (Math.sin(t * 53 + .9) + Math.sin(t * 79)) * .5 * state.shake;
  }
  cam.position.set(cs.px + sx, cs.py + sy, cs.pz);
  cam.lookAt(cs.lx, cs.ly, cs.lz);
  if (cs.roll) cam.rotateZ(cs.roll);
  if (Math.abs(cam.fov - cs.fov) > .01) { cam.fov = cs.fov; cam.updateProjectionMatrix(); }
}

const _sunNdc = new THREE.Vector3();
export function updateWorldFx(dt = 0, t = 0) {
  const white = W.whiteoutPass.uniforms;
  W.whiteoutPass.enabled = state.whiteout > 0 || state.whiteFlat > 0 || state.skyWhite > 0;
  white.amount.value = state.whiteout;
  white.center.value.set(state.whiteAt[0], state.whiteAt[1]);
  white.flatAmount.value = state.whiteFlat;
  white.sky.value = state.skyWhite;
  white.horizon.value = state.horizonAt;
  W.bloomPass.strength = state.bloom;
  const af = state.after;
  W.afterPass.enabled = af > .02;
  if (W.afterPass.enabled) W.afterPass.uniforms['damp'].value = af;
  const rd = state.radial;
  W.radialPass.enabled = rd > .0008;
  if (W.radialPass.enabled) {
    W.radialPass.uniforms['strength'].value = rd;
    W.radialPass.uniforms['center'].value.set(state.blurAt[0], state.blurAt[1]);
  }

  const cam = W.camera;
  const tanHalf = Math.tan(cam.fov * Math.PI / 360);
  // ゲートの光の粒: 画面高に対する点の大きさを画角へ合わせる
  W.gateBursts.material.uniforms.uPx.value = W.renderer.domElement.height / (2 * tanHalf);
  W.gateBursts.update(dt, t, W.raceG.visible ? state.burst : null);
  W.streaks.update(dt, state.streak, 34);
  // 年賀状のきらめき軌跡と接地影
  const card = W.hagaki;
  const cardOn = !!card && card.visible;
  if (cardOn && state.trail > 0) W.trail.emit(dt, card.position, state.trail);
  W.trail.update(dt);
  const shadow = W.cardShadow;
  shadow.visible = cardOn && state.cardShadow > .01;
  if (shadow.visible) {
    const height = Math.max(0, card.position.y - .74);         // カード下端の高さ
    const spread = 1 + height * .35;
    shadow.position.set(card.position.x, .03, card.position.z - .05);
    shadow.scale.set(spread * card.scale.x, spread * .8, 1);
    shadow.material.opacity = state.cardShadow / (1 + height * .9);
  }
  // 太陽の光芒をゆっくり回し、画面内にあるときだけレンズゴーストを対角へ並べる
  const flare = W.raceG.visible ? state.flare : 0;
  if (W.raceG.visible) {
    W.sun.rays.material.rotation = t * .04;
    W.sun.cross.material.rotation = Math.sin(t * .7) * .06;
  }
  let ghostFade = 0;
  if (flare > .01) {
    _sunNdc.copy(W.sun.group.position).project(cam);
    const off = Math.max(Math.abs(_sunNdc.x), Math.abs(_sunNdc.y));
    if (_sunNdc.z < 1) ghostFade = flare * Math.max(0, Math.min(1, (1.25 - off) / .3));
  }
  for (const ghost of W.flareGhosts) {
    ghost.visible = ghostFade > .01;
    if (!ghost.visible) continue;
    const depth = 12, { along, opacity } = ghost.userData;
    ghost.position.set(_sunNdc.x * along * tanHalf * cam.aspect * depth, _sunNdc.y * along * tanHalf * depth, -depth);
    ghost.material.opacity = opacity * ghostFade;
  }
}
