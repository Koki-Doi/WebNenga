// Three.js ワールド構築: レンダラ / ポスト / 廊下 / 競馬場+ゲート / 確定背景 / 年賀ハガキ3D
// （年賀状2027/gacha-demo の world.js を WebNenga 向けに移植。VRMの代わりに年賀ハガキを主役にする）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { state, GACHA } from './gacha-state.js';

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
  if (opts.repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(...opts.repeat); }
  return tx;
}
function radialGrad(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  return gr;
}

const TEX = {};
function buildTextures() {
  TEX.carpet = ct(512, 1024, (g, w, h) => {
    g.fillStyle = '#8e1220'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    // 縁の二重金帯
    g.fillStyle = '#d8a93f'; g.fillRect(20, 0, 12, h); g.fillRect(w - 32, 0, 12, h);
    g.fillStyle = '#f7d77f'; g.fillRect(38, 0, 5, h); g.fillRect(w - 43, 0, 5, h);
    g.strokeStyle = 'rgba(247,215,127,.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(58, 0); g.lineTo(58, h); g.moveTo(w - 58, 0); g.lineTo(w - 58, h); g.stroke();
    // 中央の大型メダリオン列（参考2の絨毯柄）
    const dia = (cx, cy, r, lw, col) => {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.stroke();
    };
    for (let cy = 128; cy < h; cy += 256) {
      g.shadowColor = '#ffdf90'; g.shadowBlur = 8;
      dia(w / 2, cy, 96, 9, '#e8b94f');
      dia(w / 2, cy, 62, 4, '#f7d77f');
      g.shadowBlur = 0;
      g.fillStyle = '#f3cf6f';
      g.beginPath(); g.arc(w / 2, cy, 13, 0, TAU); g.fill();
      // 頂点の飾り曲線
      g.strokeStyle = 'rgba(244,196,96,.65)'; g.lineWidth = 4;
      for (const [dx, dy] of [[0, -96], [96, 0], [0, 96], [-96, 0]]) {
        g.beginPath(); g.arc(w / 2 + dx, cy + dy, 18, 0, TAU); g.stroke();
      }
      // メダリオン間の小ダイヤ
      dia(w / 2, cy + 128, 24, 5, '#caa040');
    }
  }, { repeat: [1, 3] });

  TEX.wall = ct(512, 512, (g, w, h) => {
    g.fillStyle = '#5e0d14'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,170,90,.18)'); grd.addColorStop(.6, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.42)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // クラウンモールと腰壁
    g.fillStyle = '#3c070c'; g.fillRect(0, 0, w, 26); g.fillRect(0, h * .84, w, h * .16);
    g.fillStyle = '#caa040'; g.fillRect(0, 26, w, 7); g.fillRect(0, h * .84 - 7, w, 7);
    g.fillStyle = 'rgba(247,215,127,.55)'; g.fillRect(0, h * .9, w, 4);
    // 金の付け柱（柱頭付き）
    for (const px of [0, w - 36]) {
      g.fillStyle = '#c9952f'; g.fillRect(px, 0, 36, h);
      g.fillStyle = '#f2cf6e'; g.fillRect(px + 9, 0, 8, h);
      g.fillStyle = '#e8b94f'; g.fillRect(px - 4, 33, 44, 22);
    }
    // 大きなアーチ装飾パネル
    g.strokeStyle = '#e3b659'; g.lineWidth = 11; g.shadowColor = '#aa6a20'; g.shadowBlur = 6;
    g.beginPath(); g.arc(w / 2, h * .46, w * .27, Math.PI, 0);
    g.lineTo(w * .77, h * .82); g.lineTo(w * .23, h * .82); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255,220,140,.5)'; g.lineWidth = 4; g.shadowBlur = 0;
    g.beginPath(); g.arc(w / 2, h * .46, w * .2, Math.PI, 0); g.stroke();
    // パネル内の暗がり
    g.fillStyle = 'rgba(40,4,8,.5)';
    g.beginPath(); g.arc(w / 2, h * .46, w * .2, Math.PI, 0);
    g.lineTo(w * .7, h * .8); g.lineTo(w * .3, h * .8); g.closePath(); g.fill();
    // 燭台（左右の柱際）と光だまり
    for (const sx of [.115, .885]) {
      g.fillStyle = '#e8b94f';
      g.fillRect(w * sx - 5, h * .5, 10, 26);
      g.beginPath(); g.arc(w * sx, h * .5, 9, 0, TAU); g.fill();
      g.fillStyle = radialGrad(g, w * sx, h * .44, 52, [[0, 'rgba(255,228,150,.95)'], [1, 'rgba(255,200,120,0)']]);
      g.beginPath(); g.arc(w * sx, h * .44, 52, 0, TAU); g.fill();
    }
  }, { repeat: [3, 1] });

  TEX.ceiling = ct(256, 256, (g, w, h) => {
    // 格間（コファード）天井
    g.fillStyle = '#2e060a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#caa040'; g.lineWidth = 8;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#46090e'; g.fillRect(34, 34, w - 68, h - 68);
    g.strokeStyle = 'rgba(247,215,127,.55)'; g.lineWidth = 3;
    g.strokeRect(34, 34, w - 68, h - 68);
    g.fillStyle = '#e8b94f';
    g.beginPath(); g.arc(w / 2, h / 2, 12, 0, TAU); g.fill();
    g.fillStyle = radialGrad(g, w / 2, h / 2, 52, [[0, 'rgba(255,210,130,.3)'], [1, 'rgba(255,210,130,0)']]);
    g.beginPath(); g.arc(w / 2, h / 2, 52, 0, TAU); g.fill();
  }, { repeat: [4, 8] });

  // 扉パネル: 巨大馬蹄が左右パネルの継ぎ目をまたぐ（sx=-1 左 / +1 右）
  const doorPanelTex = (sx) => ct(512, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#8c1620'); grd.addColorStop(1, '#5a0c12');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const gold = (lw, col = '#e8b94f') => { g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = '#ffdf90'; g.shadowBlur = 14; };
    // 外周枠（継ぎ目側は枠なし）
    gold(22);
    g.beginPath();
    if (sx < 0) { g.moveTo(w, 18); g.lineTo(18, 18); g.lineTo(18, h - 18); g.lineTo(w, h - 18); }
    else { g.moveTo(0, 18); g.lineTo(w - 18, 18); g.lineTo(w - 18, h - 18); g.lineTo(0, h - 18); }
    g.stroke();
    // コーナーの渦巻き飾り
    g.lineWidth = 12; g.strokeStyle = '#f0c45e';
    const cx0 = sx < 0 ? 90 : w - 90;
    for (const cy of [110, h - 110]) {
      g.beginPath();
      for (let a = 0; a < 4.2; a += .12) g.lineTo(cx0 + Math.cos(a + 1) * a * 13, cy + Math.sin(a + 1) * a * 9);
      g.stroke();
    }
    // 巨大馬蹄（中心=継ぎ目エッジ、開口は下）半リングをパネル毎に半分ずつ描く
    const hx = sx < 0 ? w : 0, hy = h * .40;
    const shoe = (r, lw, col) => {
      gold(lw, col);
      g.beginPath(); g.arc(hx, hy, r, Math.PI * .62, Math.PI * 2.38); g.stroke();
    };
    shoe(w * .78, 44, '#d9a93c');
    shoe(w * .78, 24, '#f3cf6f');
    shoe(w * .56, 16, '#f7d77f');
    // 馬蹄の鋲
    g.shadowBlur = 6; g.fillStyle = '#ffe9a8';
    for (let a = Math.PI * .66; a < Math.PI * 2.34; a += .22) {
      const px = hx + Math.cos(a) * w * .78, py = hy + Math.sin(a) * w * .78;
      if (px >= -14 && px <= w + 14) { g.beginPath(); g.arc(px, py, 9, 0, TAU); g.fill(); }
    }
    // 下部の装飾横帯
    gold(10, '#caa040');
    g.beginPath(); g.moveTo(sx < 0 ? 40 : 0, h * .82); g.lineTo(sx < 0 ? w : w - 40, h * .82); g.stroke();
    g.shadowBlur = 0;
  });
  TEX.doorPanelL = doorPanelTex(-1);
  TEX.doorPanelR = doorPanelTex(1);

  TEX.doorArch = ct(1024, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#7c121b';
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * .55); g.quadraticCurveTo(w / 2, -h * .35, w, h * .55); g.lineTo(w, h); g.closePath(); g.fill();
    g.strokeStyle = '#e8b94f'; g.lineWidth = 22; g.shadowColor = '#ffdf90'; g.shadowBlur = 16;
    g.beginPath(); g.moveTo(8, h); g.lineTo(8, h * .56); g.quadraticCurveTo(w / 2, -h * .3, w - 8, h * .56); g.lineTo(w - 8, h); g.stroke();
    g.lineWidth = 10; g.strokeStyle = '#f7d77f';
    g.beginPath(); g.arc(w / 2, h * 1.05, w * .3, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.fillStyle = '#f3cf6f'; g.beginPath(); g.arc(w / 2, h * .3, 26, 0, TAU); g.fill();
  });

  // 装飾ゲート扉（唐草スクロール + 細かい網目）
  // レアリティ別: ★1=白銀 / ★2=金 / ★3=虹プリズム（原作t16-19の扉色）
  const gateTex = (main, hi, lo, opts = {}) => ct(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // 虹扉は全ストロークをプリズムグラデで描く
    let mainCol = main, hiCol = hi;
    if (opts.rainbow) {
      const pr = g.createLinearGradient(0, 0, w * .3, h);
      ['#ff9ad0', '#ffd98a', '#b8f09a', '#8ad8ff', '#c89aff', '#ff9ad0'].forEach((c, i, a) => pr.addColorStop(i / (a.length - 1), c));
      mainCol = pr;
      const pr2 = g.createLinearGradient(0, h, w * .4, 0);
      ['#fff0fa', '#fffbe8', '#eafff0', '#e8f6ff', '#f4eaff'].forEach((c, i, a) => pr2.addColorStop(i / (a.length - 1), c));
      hiCol = pr2;
    }
    const bold = opts.rainbow ? 1.25 : 1;
    const st = (lw, col, blur = 3) => {
      const c = col === main ? mainCol : col === hi ? hiCol : col;
      g.strokeStyle = c; g.lineWidth = lw * bold;
      g.shadowColor = typeof c === 'string' ? c : '#ffd0f0'; g.shadowBlur = opts.rainbow ? blur + 3 : blur;
    };
    // 外枠
    st(16, lo, 0); g.strokeRect(8, 8, w - 16, h - 16);
    st(6, hi); g.strokeRect(20, 20, w - 40, h - 40);
    // 上部 1/3: 唐草スクロール（左右対称の渦巻き）
    st(7, main);
    for (const sx of [-1, 1]) {
      g.save();
      g.translate(w / 2, 64); g.scale(sx, 1);
      g.beginPath();
      for (let a = 0; a < 4.6; a += .1) g.lineTo(20 + Math.cos(a + 2.4) * a * 9.5, 26 + Math.sin(a + 2.4) * a * 7.5);
      g.stroke();
      g.beginPath(); g.moveTo(8, 96); g.quadraticCurveTo(64, 56, 104, 100); g.stroke();
      g.restore();
    }
    // 中央メダリオン
    st(7, hi);
    g.beginPath(); g.arc(w / 2, 130, 26, 0, TAU); g.stroke();
    g.beginPath(); g.arc(w / 2, 130, 13, 0, TAU); g.stroke();
    // 中段の横帯
    st(12, main, 0);
    g.beginPath(); g.moveTo(12, 176); g.lineTo(w - 12, 176); g.stroke();
    // 下部 2/3: 細かい網目（縦+横）
    st(4, main, 2);
    for (let x = 24; x <= w - 24; x += 17) { g.beginPath(); g.moveTo(x, 182); g.lineTo(x, h - 16); g.stroke(); }
    st(3, main, 0);
    for (let y = 196; y <= h - 20; y += 26) { g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke(); }
    // 中央の縦リブ
    st(9, hi, 0);
    g.beginPath(); g.moveTo(w / 2, 176); g.lineTo(w / 2, h - 14); g.stroke();
  });
  TEX.whiteGate = gateTex('#eef3f8', '#ffffff', '#c9d3dd');
  TEX.goldGate = gateTex('#e8b94f', '#ffe18a', '#b8862c');
  TEX.rainbowGate = gateTex('#e8b94f', '#ffe18a', '#d0c0e0', { rainbow: true });

  // 番号プレート: 全ゲート共通の黄色地+濃茶数字（原作t16-18）
  const plateTex = (num) => ct(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 10, 0, h - 10);
    grd.addColorStop(0, '#ffdf5e'); grd.addColorStop(.55, '#ffce30'); grd.addColorStop(1, '#e8a821');
    g.fillStyle = grd;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 12); g.fill();
    g.strokeStyle = '#b8791a'; g.lineWidth = 7;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 12); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(16, 16, w - 32, h - 32, 9); g.stroke();
    g.font = `900 ${num >= 10 ? 148 : 178}px "M PLUS Rounded 1c", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a2408';
    g.fillText(String(num), w / 2, h / 2 + 12);
  });
  TEX.plateOf = plateTex;

  // 頂部の金の王冠（クレスト中央 / 原作t15.5）
  TEX.crown = ct(256, 200, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    g.fillStyle = '#ffd95e'; g.strokeStyle = '#8a5a10'; g.lineWidth = 7;
    g.shadowColor = '#ffe9a0'; g.shadowBlur = 14;
    g.beginPath();
    g.moveTo(cx - 78, h - 40); g.lineTo(cx - 84, h - 116); g.lineTo(cx - 42, h - 74);
    g.lineTo(cx, h - 138); g.lineTo(cx + 42, h - 74); g.lineTo(cx + 84, h - 116);
    g.lineTo(cx + 78, h - 40); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#ffe9a0'; g.fillRect(cx - 82, h - 42, 164, 18);
    g.strokeRect(cx - 82, h - 42, 164, 18);
    // 珠飾り
    g.fillStyle = '#ff6a8a';
    g.beginPath(); g.arc(cx, h - 78, 11, 0, TAU); g.fill();
    g.fillStyle = '#6ad8ff';
    for (const dx of [-52, 52]) { g.beginPath(); g.arc(cx + dx, h - 66, 8, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd95e';
    for (const dx of [-84, 0, 84]) { g.beginPath(); g.arc(cx + dx, h - (dx ? 122 : 144), 9, 0, TAU); g.fill(); }
  });

  // ピンクのアーチ看板（白文字 + 金縁 + スカラップ縁 / 原作t17-18は白系の筆記体）
  TEX.banner = ct(2048, 360, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const top = (x) => 150 - Math.cos((x / w - .5) * Math.PI) * 96; // 中央が高いアーチ
    g.beginPath();
    g.moveTo(0, h - 58);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, top(x));
    // 下縁スカラップ
    for (let x = w; x > 0; x -= 64) g.quadraticCurveTo(x - 32, h - 18, x - 64, h - 58);
    g.closePath();
    const grd = g.createLinearGradient(0, 40, 0, h);
    grd.addColorStop(0, '#ff9aa8'); grd.addColorStop(.55, '#f2697f'); grd.addColorStop(1, '#e04a66');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = '#ffe9b0'; g.lineWidth = 14; g.stroke();
    // 白文字（うっすら金の縁取り）
    g.strokeStyle = '#e8a83c'; g.lineWidth = 10;
    g.font = 'italic 900 118px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText('Eclipse first, the rest nowhere.', w / 2, h * .56);
    g.fillStyle = '#fff8ee';
    g.fillText('Eclipse first, the rest nowhere.', w / 2, h * .56);
    // 文字上のきらめき
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 26; i++) {
      const x = w * (.2 + Math.random() * .6), y = h * (.35 + Math.random() * .4), r = 2 + Math.random() * 4;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  });

  // 濃緑の鉄骨トラス（X ブレース / 原作t16-18は緑系の鉄骨）
  TEX.truss = ct(1024, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const col = '#2e8a5e', dark = '#1d5c46';
    g.strokeStyle = dark; g.lineWidth = 14;
    g.beginPath(); g.moveTo(0, 10); g.lineTo(w, 10); g.stroke();
    g.beginPath(); g.moveTo(0, h - 10); g.lineTo(w, h - 10); g.stroke();
    g.strokeStyle = col; g.lineWidth = 9;
    for (let x = 0; x < w; x += 86) {
      g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 86, h - 10); g.stroke();
      g.beginPath(); g.moveTo(x + 86, 10); g.lineTo(x, h - 10); g.stroke();
      g.beginPath(); g.moveTo(x, 10); g.lineTo(x, h - 10); g.stroke();
    }
  });

  // 濃緑の鋳鉄スクロール飾り（ゲート上端の冠）
  TEX.frieze = ct(1024, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#1d5c46'; g.lineWidth = 15; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, h - 8); g.lineTo(w, h - 8); g.stroke();
    for (let cx = 64; cx < w; cx += 128) {
      for (const sx of [-1, 1]) {
        g.save(); g.translate(cx, h - 14); g.scale(sx, 1);
        g.beginPath();
        for (let a = 0; a < 4.4; a += .12) g.lineTo(12 + Math.cos(a + 1.6) * a * 10, -8 - Math.abs(Math.sin(a + 1.6) * a * 11));
        g.stroke();
        g.restore();
      }
      g.beginPath(); g.moveTo(cx, h - 14); g.lineTo(cx, 26); g.stroke();
      g.beginPath(); g.arc(cx, 18, 8, 0, TAU); g.stroke();
    }
  });

  // スタンドの貴賓席帯（窓）
  TEX.suites = ct(1024, 128, (g, w, h) => {
    g.fillStyle = '#27343c'; g.fillRect(0, 0, w, h);
    for (let x = 14; x < w - 60; x += 74) {
      const lit = Math.random() < .6;
      g.fillStyle = lit ? 'rgba(255,238,180,.85)' : 'rgba(130,170,200,.5)';
      g.fillRect(x, 26, 56, h - 56);
    }
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 12);
  }, { repeat: [8, 1] });

  // ランプの赤色LEDパネル
  TEX.led = ct(256, 256, (g, w, h) => {
    g.fillStyle = '#8a1410'; g.fillRect(0, 0, w, h);
    const vg = radialGrad(g, w / 2, h / 2, w * .72, [[0, 'rgba(255,120,90,.5)'], [1, 'rgba(40,0,0,.55)']]);
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff6a4a';
    for (let y = 16; y < h; y += 22) for (let x = 16; x < w; x += 22) {
      g.beginPath(); g.arc(x, y, 6.5, 0, TAU); g.fill();
    }
  });

  // SSRゲートの虹色シアー
  TEX.rainbowSheen = ct(256, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w * .4, h);
    const cols = ['#ff9ad0', '#ffd98a', '#b8ff9a', '#8ad8ff', '#c89aff', '#ff9ad0'];
    cols.forEach((c, i) => grd.addColorStop(i / (cols.length - 1), c));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  TEX.turf = ct(512, 512, (g, w, h) => {
    g.fillStyle = '#4cb244'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { if (i % 2) { g.fillStyle = 'rgba(0,70,10,.18)'; g.fillRect(0, i * 64, w, 64); } }
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,210' : '0,80,0'},${Math.random() * .1})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 4); }
  }, { repeat: [10, 4] });

  const drawCrowd = (g, w, h) => {
    // ベースは原作スタンドの赤茶系（参考t13.0の段色）
    g.fillStyle = '#5e4a4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `hsl(${Math.random() * 360}, ${24 + Math.random() * 44}%, ${50 + Math.random() * 34}%)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
    // うっすら白いヘイズ
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 0, w, h);
  };
  TEX.crowd = ct(1024, 256, drawCrowd, { repeat: [10, 1] });
  // スロープ用は縦横の通路ラインを足す（リピートで段ごとの通路に見える）
  TEX.crowdSlope = ct(1024, 256, (g, w, h) => {
    drawCrowd(g, w, h);
    g.fillStyle = 'rgba(72,82,90,.5)';
    for (let x = 96; x < w; x += 256) g.fillRect(x, 0, 10, h);
    g.fillRect(0, h - 14, w, 14);
  }, { repeat: [12, 5] });

  TEX.sky = ct(512, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2f96f0'); grd.addColorStop(.45, '#7cc4fa'); grd.addColorStop(.72, '#cdeaff'); grd.addColorStop(1, '#eef9ff');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // 高空の薄い雲
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * w, y = h * (.16 + Math.random() * .2), r = 26 + Math.random() * 60;
      g.fillStyle = radialGrad(g, x, y, r, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    // 地平線近くの入道雲（白帯にならないよう塊を散らして隙間を残す）
    for (let c = 0; c < 4; c++) {
      const cx = (c + .2 + Math.random() * .45) * w / 4.0, base = h * (.39 + Math.random() * .1);
      for (let i = 0; i < 7; i++) {
        const px = cx + (i - 3) * 13 + (Math.random() - .5) * 10;
        const r = 10 + Math.random() * 16 - Math.abs(i - 3) * 2.2;
        const py = base - Math.random() * r * .8;
        g.fillStyle = radialGrad(g, px, py, r, [[0, 'rgba(255,255,255,.85)'], [.7, 'rgba(250,253,255,.6)'], [1, 'rgba(245,250,255,0)']]);
        g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
      }
    }
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
}

// ---------- マテリアル/メッシュ ヘルパ ----------
const M = {
  basic: (o) => new THREE.MeshBasicMaterial(o),
  lamb: (o) => new THREE.MeshLambertMaterial(o),
  add: (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...o }),
};
function sprite(tex, color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  s.scale.setScalar(scale);
  return s;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// ---------- 紙吹雪 ----------
class Confetti {
  constructor(n, center, size) {
    this.n = n; this.center = center; this.size = size;
    const geo = new THREE.PlaneGeometry(.16, .06);
    const mat = M.basic({ side: THREE.DoubleSide, vertexColors: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const it = {
        p: new THREE.Vector3(center.x + rand(-size.x, size.x), center.y + rand(-size.y, size.y), center.z + rand(-size.z, size.z)),
        vy: rand(.5, 1.6), ph: rand(0, TAU), rs: rand(1, 4), ax: rand(0, TAU), sway: rand(.4, 1.4),
      };
      this.items.push(it);
      dummy.position.copy(it.p); dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color().setHSL(Math.random(), .92, .68));
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.dummy = dummy;
    this.active = false;
    this.mesh.visible = false;
  }
  set(v) { this.active = v; this.mesh.visible = v; }
  place(center, size) {
    this.center = center; this.size = size;
    for (const it of this.items) {
      it.p.set(center.x + rand(-size.x, size.x), center.y + rand(-size.y, size.y), center.z + rand(-size.z, size.z));
    }
  }
  update(dt, t) {
    if (!this.active) return;
    const { center, size, dummy } = this;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      it.p.y -= it.vy * dt;
      it.p.x += Math.sin(t * 2 + it.ph) * it.sway * dt;
      if (it.p.y < center.y - size.y) { it.p.y = center.y + size.y; it.p.x = center.x + rand(-size.x, size.x); }
      dummy.position.copy(it.p);
      dummy.rotation.set(t * it.rs + it.ph, it.ax + t * it.rs * .7, it.ph);
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
    this.pts.material.opacity = .65 + Math.sin(t * 5) * .25;
  }
}

// ---------- 廊下 ----------
function buildCorridor() {
  const g = new THREE.Group();
  // 床・壁・天井（原作の「見上げる巨大扉」に合わせ天井5.5m）
  g.add((() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 18), M.lamb({ map: TEX.carpet })); m.rotation.x = -Math.PI / 2; m.position.z = -1; return m; })());
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.5), M.lamb({ map: TEX.wall }));
    wall.position.set(sx * 4.03, 2.75, -1);
    wall.rotation.y = -sx * Math.PI / 2;
    g.add(wall);
  }
  g.add((() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 18), M.lamb({ map: TEX.ceiling })); m.rotation.x = Math.PI / 2; m.position.set(0, 5.52, -1); return m; })());
  // 金柱
  const colMat = M.lamb({ color: 0xc9952f, emissive: 0x331f05 });
  for (let z = 2; z >= -6; z -= 2.6) for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.1, .13, 5.5, 10), colMat);
    c.position.set(sx * 3.88, 2.75, z);
    g.add(c);
  }
  // シャンデリア光
  for (let z = 1; z >= -5; z -= 3) {
    const s = sprite(TEX.bokeh, 0xffd9a0, 1.6, .5);
    s.position.set(0, 5.0, z);
    g.add(s);
  }

  // ---- 扉一式（4.6m の巨大両開き / 外側ヒンジで実際に開く） ----
  const door = new THREE.Group();
  door.position.set(0, 0, -7);
  const mkPanel = (sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * 1.92, 0, 0);         // 外側エッジ＝ヒンジ
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 4.6, .16), [
      M.lamb({ color: 0x6b0f16 }), M.lamb({ color: 0x6b0f16 }), M.lamb({ color: 0x6b0f16 }),
      M.lamb({ color: 0x6b0f16 }), M.lamb({ map: sx < 0 ? TEX.doorPanelL : TEX.doorPanelR }), M.lamb({ color: 0x6b0f16 }),
    ]);
    panel.position.set(-sx * .95, 2.3, 0);
    piv.add(panel);
    // 縦長の金バーハンドル（継ぎ目寄り・ブラケット+玉飾り）
    const hMat = M.lamb({ color: 0xe8b94f, emissive: 0x553808 });
    const hx = -sx * 1.69;                      // パネル内側エッジ近く（world x ≈ ±0.23）
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 2.1, 10), hMat);
    bar.position.set(hx, 2.05, .24);
    piv.add(bar);
    for (const dy of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), hMat);
      knob.position.set(hx, 2.05 + dy * 1.05, .24);
      piv.add(knob);
      piv.add(box(.06, .06, .17, hMat, hx, 2.05 + dy * .85, .14));
    }
    door.add(piv);
    return piv;
  };
  W.doorL = mkPanel(-1);
  W.doorR = mkPanel(1);
  // アーチ上部（天井高5.52を超えないよう収める）
  const arch = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.15), M.lamb({ map: TEX.doorArch, transparent: true }));
  arch.position.set(0, 4.9, .02);
  door.add(arch);
  // 枠（柱も天井内に収める）
  const frameMat = M.lamb({ color: 0xd8a93f, emissive: 0x402a08 });
  door.add(box(.26, 5.35, .34, frameMat, -2.08, 2.675, 0));
  door.add(box(.26, 5.35, .34, frameMat, 2.08, 2.675, 0));
  door.add(box(4.6, .3, .36, frameMat, 0, 4.92, 0));
  door.add(box(4.7, .2, .55, frameMat, 0, .08, .1));
  // 扉の奥の白い光の間（開いた時に見える）
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 5.5), M.add({ color: new THREE.Color(2.6, 2.3, 1.6), opacity: 0 }));
  innerGlow.position.set(0, 2.6, -.4);
  door.add(innerGlow);
  W.doorInner = innerGlow;
  g.add(door);
  // 馬蹄リングのグロー（開扉前の予兆発光 / 参考5）
  const shoe = new THREE.Mesh(
    new THREE.TorusGeometry(1.48, .085, 8, 48, Math.PI * 1.72),
    M.add({ color: 0xffc46a, opacity: 0 })
  );
  // 描画した巨大馬蹄（パネル中心2.3 + テクスチャ比0.1×4.6 → y≈2.76, r≈0.78×1.9）に重ねる
  shoe.position.set(0, 2.76, -6.9);
  // arc は +X 起点で反時計回り: 残り 0.28π の切れ目を真下(270°)へ
  shoe.rotation.z = -Math.PI * .36;
  g.add(shoe);
  W.doorShoe = shoe;

  // ---- 扉の発光FX ----
  const fx = new THREE.Group();
  fx.position.set(0, 2.3, -6.86);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(.4, 4.6), M.add({ color: new THREE.Color(3, 2.4, 1.3), opacity: 0 }));
  fx.add(slit);
  const glow = sprite(TEX.bokeh, 0xffe6a8, .1, 0); fx.add(glow);
  const rays = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(.2, 11), M.add({ color: 0xffd98a, opacity: .75 }));
    r.rotation.z = (i / 9) * TAU;
    r.position.z = .02;
    rays.add(r);
  }
  rays.scale.setScalar(0.001);
  fx.add(rays);
  const ring = sprite(TEX.ring, 0xffffff, .1, 0); ring.position.z = .05; fx.add(ring);
  const cross = sprite(TEX.cross, 0xfff6d8, .1, 0); cross.position.z = .06; fx.add(cross);
  g.add(fx);
  W.doorFx = { slit, glow, rays, ring, cross };

  g.visible = false;
  return g;
}

// ---------- 競馬場 + スタートゲート ----------
function buildRace() {
  const g = new THREE.Group();
  // 空
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), M.basic({ map: TEX.sky, side: THREE.BackSide, fog: false }));
  g.add(sky);
  // 芝
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(340, 140), M.lamb({ map: TEX.turf }));
  turf.rotation.x = -Math.PI / 2;
  g.add(turf);
  // 地平線の樹林帯（遠景の森。フォグ越しに霞む明るめの緑）
  const trees = new THREE.Mesh(
    new THREE.CylinderGeometry(125, 125, 5, 48, 1, true),
    M.lamb({ color: 0x6fae72, side: THREE.BackSide })
  );
  trees.position.y = 2.5;
  g.add(trees);
  // 太陽 + レンズフレア（参考10・195246 の強い逆光）
  const sun = new THREE.Group();
  sun.add(sprite(TEX.bokeh, 0xfff6d8, 34, .95));
  const sCross = sprite(TEX.cross, 0xffffff, 14, .8);
  sCross.position.z = .1;
  sun.add(sCross);
  const ghost = sprite(TEX.bokeh, 0xaad4ff, 6, .28);
  ghost.position.set(-11, -10, 0);
  sun.add(ghost);
  sun.position.set(-26, 46, -62);
  g.add(sun);
  // ラチ（白柵）: 走路の両脇に沿わせる（ゲート前を横切らせない）
  const railMat = M.lamb({ color: 0xf4f7fa });
  for (const sx of [-1, 1]) {
    g.add(box(.06, .05, 130, railMat, sx * 9.6, .8, 20));
    g.add(box(.06, .05, 130, railMat, sx * 9.6, .45, 20));
    for (let z = -45; z <= 85; z += 4) g.add(box(.07, .85, .07, railMat, sx * 9.6, .42, z));
  }
  // スタンド: 観客で埋まったスロープ（階段状にしない）
  const stand = new THREE.Group();
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(220, 23), M.lamb({ map: TEX.crowdSlope }));
  slope.rotation.x = -Math.PI / 2 + .417;   // 手前 z≈-24,y≈1.1 → 奥 z≈-45,y≈10.4 へ登る斜面
  slope.position.set(0, 5.75, -34.5);
  stand.add(slope);
  // 斜面の手前の腰壁
  stand.add(box(220, 1.15, .35, M.lamb({ color: 0x3c4a52 }), 0, .56, -23.9));
  // 貴賓席（窓の帯）と白い大屋根
  stand.add((() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(224, 2.6), M.lamb({ map: TEX.suites }));
    m.position.set(0, 10.6, -44.2);
    return m;
  })());
  const roof = box(230, .7, 26, M.lamb({ color: 0xe8edf2 }), 0, 12.5, -36);
  stand.add(roof);
  // 屋根の裏は白く明るく（フライスルーで見上がる面）
  stand.add((() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(228, 25), M.basic({ color: 0xdfe7ee, fog: false }));
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 12.1, -36);
    return m;
  })());
  for (let x = -100; x <= 100; x += 25) stand.add(box(.6, 12, .6, M.lamb({ color: 0xb9c2cc }), x, 6, -24));
  // 背面壁は屋根の下に収める（空に白壁が見えないように）
  const back = box(230, 11.5, 1, M.lamb({ color: 0x6a7686 }), 0, 5.75, -47);
  stand.add(back);
  // 観客のペンライト（crowd フェーズで点灯 / 原作t12.0のシアン・ピンク・黄の光）
  W.penlights = [
    new Sparkles(60, new THREE.Vector3(0, 6.4, -34.5), new THREE.Vector3(95, .6, .6), 0x7af0ff, 1.15),
    new Sparkles(50, new THREE.Vector3(0, 6.2, -34), new THREE.Vector3(95, .6, .6), 0xff8ad8, 1.05),
    new Sparkles(40, new THREE.Vector3(0, 6.6, -35), new THREE.Vector3(95, .6, .6), 0xfff08a, 1.0),
  ];
  for (const p of W.penlights) {
    // 観客スロープ面(手前 z≈-24,y≈1.1 → 奥 z≈-45,y≈10.4)に沿って散らす
    const attr = p.pts.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      const t = Math.random();
      attr.setXYZ(i, rand(-95, 95), 1.6 + t * 8.8 + rand(.1, .8), -24.5 - t * 20.5);
    }
    attr.needsUpdate = true;
    p.center.y = 6; p.size.y = 5.2;   // 上昇ラップで面から大きく外れない範囲
    stand.add(p.pts);
  }
  g.add(stand);
  W.standG = stand;   // ゲート正面カットでは隠す（原作はゲート背後が空）

  // ---- スタートゲート（表示番号は左から 10→1 / 参考: 新スクショ群） ----
  const gates = new THREE.Group();
  gates.position.set(0, 0, -5);
  const steel = M.lamb({ color: 0xdfe6ee });
  const gold = M.lamb({ color: 0xd8a93f, emissive: 0x6a4a08 });
  W.gateObjs = [];
  const GW = 1.45;
  for (let col = 0; col < 10; col++) {
    const n = 10 - col;                 // 表示番号（左端が10）
    const x = (col - 4.5) * GW;
    const isSSR = n === GACHA.ssrGate, isSR = GACHA.srGates.includes(n);
    const rare = isSSR || isSR;
    const fm = rare ? gold : steel;
    const one = new THREE.Group();
    one.position.set(x, 0, 0);
    // 柱・梁
    one.add(box(.1, 2.7, .1, fm, -GW / 2 + .08, 1.35, .45));
    one.add(box(.1, 2.7, .1, fm, GW / 2 - .08, 1.35, .45));
    one.add(box(.1, 2.7, .1, fm, -GW / 2 + .08, 1.35, -.55));
    one.add(box(.1, 2.7, .1, fm, GW / 2 - .08, 1.35, -.55));
    one.add(box(GW - .1, .12, 1.1, fm, 0, 2.75, 0));
    // 側面パッド
    one.add(box(.06, 1.1, 1.0, M.lamb({ color: rare ? 0xf3cf6f : 0xf2f5f8 }), -GW / 2 + .05, 1.1, -.05));
    one.add(box(.06, 1.1, 1.0, M.lamb({ color: rare ? 0xf3cf6f : 0xf2f5f8 }), GW / 2 - .05, 1.1, -.05));
    // 背面パネル（参考t15.0: ワイドではゲート内部が暗く沈んで輪郭が立つ）
    if (!isSSR) {
      const bp = new THREE.Mesh(new THREE.PlaneGeometry(GW - .18, 2.3), M.lamb({ color: 0x9aa6b4 }));
      bp.position.set(0, 1.3, -.5);
      one.add(bp);
    }
    // 前扉（左右、ヒンジ開閉用ピボット）: ★1=白銀 / ★2=金 / ★3=虹プリズム
    // 白ゲートはわずかにグレーへ落としてブルームの白飛びを防ぐ
    const dmat = new THREE.MeshBasicMaterial({
      map: isSSR ? TEX.rainbowGate : isSR ? TEX.goldGate : TEX.whiteGate,
      color: rare ? 0xffffff : 0xd9e0e8,
      transparent: true, alphaTest: .2, side: THREE.DoubleSide, fog: false,
    });
    const mkDoor = (sx) => {
      const piv = new THREE.Group();
      piv.position.set(sx * (GW / 2 - .09), 0, .5);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(GW / 2 - .12, 2.25), dmat);
      pl.position.set(-sx * (GW / 4 - .05), 1.32, 0);
      piv.add(pl);
      one.add(piv);
      return piv;
    };
    const dl = mkDoor(-1), dr = mkDoor(1);
    // SSRゲートの追加装飾
    if (isSSR) {
      const archT = new THREE.Mesh(new THREE.TorusGeometry(GW / 2, .07, 8, 24, Math.PI), gold);
      archT.position.set(0, 2.75, .45);
      one.add(archT);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), gold);
      crown.position.set(0, 3.55, .45);
      one.add(crown);
      one.add(box(.08, .7, .08, gold, 0, 3.15, .45));
      // 光柱
      const pillar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 14), M.add({ color: 0xffe18a, opacity: .0 }));
      pillar.position.set(0, 7, .3);
      one.add(pillar);
      W.ssrPillar = pillar;
      // 虹色シアー（格子の上に重ねる / 参考195303）
      const sheen = new THREE.Mesh(new THREE.PlaneGeometry(GW - .2, 2.25), M.add({ map: TEX.rainbowSheen, opacity: 0 }));
      sheen.position.set(0, 1.32, .56);
      one.add(sheen);
      W.ssrSheen = sheen;
      // 到達時の金バースト（参考195258）
      const burst = sprite(TEX.bokeh, 0xffd34e, .1, 0);
      burst.position.set(0, 1.5, .8);
      one.add(burst);
      W.ssrBurst = burst;
    }
    // 番号プレート: 黄色地+濃茶数字、緑のマウント台座でトラス上に掲げる（原作t16-18）
    one.add(box(.5, .16, .14, M.lamb({ color: 0x1d6e46 }), 0, 2.94, .3));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.58, .58), M.basic({ map: TEX.plateOf(n), transparent: true, fog: false }));
    plate.position.set(0, 3.3, .34);
    one.add(plate);
    // レアリティグロー
    let glowS = null;
    if (rare) {
      glowS = sprite(TEX.bokeh, isSSR ? 0xffe0f4 : 0xffe8b0, isSSR ? 4.4 : 3.2, .85);
      // SSR はゲート内のキャラ(z≈-0.95)より奥に置いて逆光ハロにする
      glowS.position.set(0, 1.4, isSSR ? -1.5 : -.2);
      one.add(glowS);
    }
    gates.add(one);
    W.gateObjs.push({ group: one, doors: [dl, dr], glow: glowS, isSSR, isSR, n, x });
  }
  // ---- 上部構造（原作t15.5 下→上）: 緑トラス → 黄プレート列 → ピンクのアーチ看板 → 緑鋳鉄クレスト+金王冠 ----
  const trussMat = new THREE.MeshBasicMaterial({ map: TEX.truss, transparent: true, side: THREE.DoubleSide, fog: false });
  const truss = new THREE.Mesh(new THREE.PlaneGeometry(14.8, .68), trussMat);
  truss.position.set(0, 3.22, .12);
  gates.add(truss);
  const trussB = truss.clone();
  trussB.position.z = -.45;
  gates.add(trussB);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 2.0), M.basic({ map: TEX.banner, transparent: true, fog: false }));
  banner.position.set(0, 4.55, .35);
  gates.add(banner);
  // 看板の上に乗る緑鋳鉄スクロール（クレスト）と中央の金王冠
  const friezeMat = new THREE.MeshBasicMaterial({ map: TEX.frieze, transparent: true, side: THREE.DoubleSide, fog: false });
  const frieze = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 1.35), friezeMat);
  frieze.position.set(0, 5.85, .2);
  gates.add(frieze);
  const crown = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.25), M.basic({ map: TEX.crown, transparent: true, fog: false }));
  crown.position.set(0, 6.25, .3);
  gates.add(crown);
  // 両端支柱（緑鉄骨）
  gates.add(box(.18, 4.5, .18, M.lamb({ color: 0x2a7a52 }), -7.25, 2.25, -.1));
  gates.add(box(.18, 4.5, .18, M.lamb({ color: 0x2a7a52 }), 7.25, 2.25, -.1));
  // ゲート足元の薄霧（参考13/195246）
  for (let i = 0; i < 12; i++) {
    const s = sprite(TEX.bokeh, 0xffffff, rand(2.0, 3.2), .05);
    s.position.set(rand(-7, 7), .3, .9);
    gates.add(s);
  }
  g.add(gates);
  W.gatesG = gates;

  // ---- スタートランプ（グレー支柱 + 緑トラス + 箱型赤LEDパネル / 参考195308） ----
  const lampG = new THREE.Group();
  lampG.position.set(8.6, 0, -4.4);
  const greenM = M.lamb({ color: 0x2a7a52 });
  lampG.add((() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 2.6, 10), M.lamb({ color: 0x9aa4ad })); m.position.set(0, 1.3, 0); return m; })());
  // 緑トラスのブラケット
  lampG.add(box(1.1, .13, .13, greenM, 0, 3.05, .2));
  lampG.add(box(.13, .13, .8, greenM, -.45, 3.05, .2));
  lampG.add(box(.13, .13, .8, greenM, .45, 3.05, .2));
  lampG.add(box(.1, .55, .1, greenM, 0, 2.75, .2));
  // 箱型パネル（マルーン枠 + LED面）
  lampG.add(box(.78, .78, .2, M.lamb({ color: 0x4a1410 }), 0, 2.45, .45));
  // ランプ下に見えるゲート屋根の白い角（参考t19.5）
  lampG.add(box(1.9, .09, 1.3, M.lamb({ color: 0xeef2f6 }), -.7, 1.88, .35));
  W.lampMat = M.basic({ color: 0x2a0e0c, map: TEX.led, fog: false });
  const lampFace = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), W.lampMat);
  lampFace.position.set(0, 2.45, .56);
  W.lampGlow = sprite(TEX.bokeh, 0xff3a20, .01, 0);
  W.lampGlow.position.set(0, 2.45, .7);
  lampG.add(lampFace, W.lampGlow);
  g.add(lampG);
  W.lampPos = new THREE.Vector3(8.6, 2.45, -3.85);

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
  const msg = (data.m ?? '').trim() || 'あけましておめでとうございます。';
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
export async function buildHagaki(data) {
  const HW = 1.0, HH = 1.48;
  const [ftex, btex] = await Promise.all([drawHagakiFront(data), drawHagakiBack(data)]);
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  // 紙の白をブルーム閾値(輝度.78)未満に抑えるアイボリー乗算（白飛び防止）
  const PAPER = 0xe2e0da;
  const fmat = new THREE.MeshBasicMaterial({ map: ftex, color: PAPER, fog: false });
  const bmat = new THREE.MeshBasicMaterial({ map: btex, color: PAPER, fog: false });
  const emat = new THREE.MeshBasicMaterial({ color: 0xd6d0c0, fog: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(HW, HH), fmat);
  front.position.z = .0045;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HW, HH), bmat);
  back.rotation.y = Math.PI;
  back.position.z = -.0045;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(HW + .006, HH + .006, .007), emat);
  pivot.add(edge, front, back);
  g.add(pivot);
  g.visible = false;
  for (const m of [fmat, bmat, emat]) m.userData.baseColor = m.color.clone();
  W.scene.add(g);
  W.hagaki = g;
  W.hagakiPivot = pivot;
  W.hagakiMats = [fmat, bmat, emat];
  return g;
}
// 実カードDOM（画面表示そのもの）を html2canvas で撮ってテクスチャを差し替える。
// 手描きテクスチャはフォントサイズ/レイアウトが実表示と一致しないため、
// 成功したら必ずこちらを使う（失敗時のみ手描きフォールバックが残る）
export async function refreshHagakiTextures() {
  const { captureCardFaces } = await import('../print.js');
  const { front, back } = await captureCardFaces();
  const load = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
  const [fi, bi] = await Promise.all([load(front), load(back)]);
  const mk = (img) => {
    const t = new THREE.Texture(img);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const [fmat, bmat] = W.hagakiMats;
  fmat.map?.dispose(); bmat.map?.dispose();
  fmat.map = mk(fi);
  bmat.map = mk(bi);
  fmat.needsUpdate = true;
  bmat.needsUpdate = true;
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
function fanSectorGeometry(ri, ro, a1, a2, seg, pleat) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = a1 + (a2 - a1) * t;
    const z = (i % 2 ? pleat : -pleat);
    const ca = Math.cos(a), sa = Math.sin(a);
    // 内周は折り幅を弱める（要に近いほど折りが浅い）
    pos.push(ca * ri, sa * ri, z * .3, ca * ro, sa * ro, z);
    // 角度→U（画面右=角度小 が canvas 右になるよう反転）、半径→V
    uv.push(1 - t, 0, 1 - t, 1);
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 扇面テクスチャ（青海波 + 小紋 + 筆文字「激熱ッ！」）。展開図: x=角度方向, y=半径方向(上=外周)
async function fanPaperTexture() {
  try { await document.fonts.load('200px "Yuji Boku"', '激熱ッ！'); } catch (e) { }
  return ct(1024, 512, (g, w, h) => {
    g.fillStyle = '#faf6ea'; g.fillRect(0, 0, w, h);
    // 折り目の陰影（放射方向の縦ストライプ）
    for (let i = 0; i < 28; i++) {
      g.fillStyle = i % 2 ? 'rgba(120,95,55,.07)' : 'rgba(255,255,255,.05)';
      g.fillRect((w / 28) * i, 0, w / 28, h);
    }
    // 外周の青海波帯（上端 = 外周）
    g.save();
    g.beginPath(); g.rect(0, 0, w, h * .30); g.clip();
    g.strokeStyle = '#79b5e2'; g.lineWidth = 5;
    for (const [yy, off] of [[h * .02, 0], [h * .17, w * .045]]) {
      for (let x = -w * .05 + off; x < w * 1.05; x += w * .09) {
        for (const rr of [h * .13, h * .095, h * .06, h * .028]) {
          g.beginPath(); g.arc(x, yy, rr, 0, Math.PI); g.stroke();
        }
      }
    }
    g.restore();
    g.strokeStyle = '#d2a44a'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(0, h * .31); g.lineTo(w, h * .31); g.stroke();
    g.beginPath(); g.moveTo(0, 5); g.lineTo(w, 5); g.stroke();
    // 中程の小紋ドット
    g.fillStyle = '#a8cfe8';
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * w, y = h * (.34 + Math.random() * .58);
      g.beginPath(); g.arc(x, y, 3 + Math.random() * 4.5, 0, TAU); g.fill();
    }
    // 筆文字「激熱ッ！」（扇の中帯に大きく）
    g.save();
    g.translate(w / 2, h * .60);
    g.rotate(-.04);
    g.fillStyle = '#16120c';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '200px "Yuji Boku", "Noto Sans JP", serif';
    g.fillText('激熱', -110, 0);
    g.font = '120px "Yuji Boku", "Noto Sans JP", serif';
    g.fillText('ッ！', 210, 28);
    g.restore();
    // 朱の落款風アクセント
    g.fillStyle = 'rgba(200,60,40,.85)';
    g.fillRect(w * .87, h * .78, 44, 44);
    g.fillStyle = '#faf6ea';
    g.font = '700 26px "Noto Sans JP", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('新春', w * .87 + 22, h * .78 + 23);
  });
}
export async function buildFan3D() {
  const R = .52, RI = .13;
  const A1 = Math.PI * (20 / 180), A2 = Math.PI * (160 / 180);
  // outer(位置+カメラ正対) > inner(傾き/扇ぎアニメ) の2層
  const outer = new THREE.Group();
  const group = new THREE.Group();
  outer.add(group);

  // 扇面（両面・折り目付き）
  const paperTex = await fanPaperTexture();
  const paper = new THREE.Mesh(
    fanSectorGeometry(RI, R, A1, A2, 28, .012),
    new THREE.MeshLambertMaterial({ map: paperTex, side: THREE.DoubleSide, emissive: 0x555044 })
  );
  group.add(paper);

  // 骨（中骨14本 + 太い親骨2本）と要
  const ribMat = M.lamb({ color: 0x6b4a26, emissive: 0x1a0f06 });
  for (let i = 0; i <= 13; i++) {
    const a = A1 + (A2 - A1) * (i / 13);
    const rib = box(.011, R - .02, .006, ribMat, 0, 0, 0);
    rib.position.set(Math.cos(a) * (R - .02) / 2, Math.sin(a) * (R - .02) / 2, -.012);
    rib.rotation.z = a - Math.PI / 2;
    group.add(rib);
  }
  for (const a of [A1, A2]) {
    const guard = box(.024, R + .01, .012, M.lamb({ color: 0x5a3c1e, emissive: 0x160c04 }), 0, 0, 0);
    guard.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, .002);
    guard.rotation.z = a - Math.PI / 2;
    group.add(guard);
  }
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .05, 12), M.lamb({ color: 0xe8b94f, emissive: 0x553808 }));
  pin.rotation.x = Math.PI / 2;
  group.add(pin);
  // 手元の柄（握り）
  group.add(box(.034, .13, .022, ribMat, 0, -.085, 0));

  // 手（掌 + 指4本 + 親指 + 袖）— デフォルメの3Dハンド
  const skin = M.lamb({ color: 0xf6cfae, emissive: 0x40301e });
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(.075, 14, 12), skin);
  palm.scale.set(1.05, .8, .62);
  palm.position.set(.045, -.115, .015);
  hand.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(.017, .05, 4, 8), skin);
    f.position.set(-.012, -.055 - i * .036, .035);
    f.rotation.z = Math.PI / 2 - .12;
    hand.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(.019, .045, 4, 8), skin);
  thumb.position.set(.02, -.05, .03);
  thumb.rotation.z = .45;
  hand.add(thumb);
  // 袖（濃紅の筒）と腕: 右下画面外へ伸びる
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.085, .105, .34, 14), M.lamb({ color: 0x7a2430, emissive: 0x1c0508 }));
  sleeve.position.set(.22, -.32, .0);
  sleeve.rotation.z = .62;
  hand.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.088, .088, .05, 14), M.lamb({ color: 0xe8b94f, emissive: 0x553808 }));
  cuff.position.set(.135, -.215, 0);
  cuff.rotation.z = .62;
  hand.add(cuff);
  group.add(hand);

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
    scene.background = new THREE.Color(0x1c060a);
    scene.fog = new THREE.Fog(0x30070c, 9, 24);
    amb.color.set(0xffe2c8); amb.intensity = .85;
    key.color.set(0xffd9b0); key.intensity = 1.15; key.position.set(2, 4, 5);
    rim.color.set(0xff9a66); rim.intensity = .7; rim.position.set(0, 3, -7);
  } else if (name === 'race') {
    scene.background = new THREE.Color(0xbfe4ff);
    scene.fog = new THREE.Fog(0xd8efff, 80, 280);
    amb.color.set(0xffffff); amb.intensity = 1.0;
    key.color.set(0xfff6e0); key.intensity = 1.55; key.position.set(40, 70, 40);
    rim.color.set(0x9cc8ff); rim.intensity = .5; rim.position.set(0, 10, -30);
  } else if (name === 'reveal') {
    scene.background = new THREE.Color(0xffe6f2);
    scene.fog = null;
    amb.color.set(0xffffff); amb.intensity = 1.25;
    key.color.set(0xffffff); key.intensity = 1.2; key.position.set(.5, 2.5, 5);
    rim.color.set(0xffd0ec); rim.intensity = .8; rim.position.set(0, 2, -4);
  } else {
    scene.background = new THREE.Color(0x000000);
    scene.fog = null;
  }
}

// ---------- FXリセット（フェーズ直接ジャンプ対応） ----------
export function resetFx() {
  state.bloom = .35; state.after = 0; state.radial = 0; state.shake = 0;
  state.frame = null;
  state.twist = 0;
  const { doorFx } = W;
  doorFx.slit.material.opacity = 0; doorFx.slit.scale.set(1, 1, 1);
  doorFx.glow.material.opacity = 0; doorFx.glow.scale.setScalar(.1);
  doorFx.rays.scale.setScalar(.001); doorFx.rays.rotation.z = 0;
  doorFx.ring.material.opacity = 0; doorFx.ring.scale.setScalar(.1);
  doorFx.cross.material.opacity = 0; doorFx.cross.scale.setScalar(.1);
  W.doorL.rotation.y = 0; W.doorR.rotation.y = 0;
  W.doorShoe.material.opacity = 0;
  W.doorInner.material.opacity = 0;
  W.gatesG.visible = true;
  if (W.standG) W.standG.visible = true;
  for (const go of W.gateObjs) {
    go.doors[0].rotation.y = 0; go.doors[1].rotation.y = 0;
    if (go.glow) go.glow.material.opacity = .85;
  }
  if (W.ssrPillar) W.ssrPillar.material.opacity = 0;
  if (W.ssrSheen) W.ssrSheen.material.opacity = 0;
  if (W.ssrBurst) { W.ssrBurst.material.opacity = 0; W.ssrBurst.scale.setScalar(.1); }
  W.lampMat.color.set(0x2a0e0c);
  W.lampGlow.material.opacity = 0; W.lampGlow.scale.setScalar(.01);
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
  renderer.toneMapping = THREE.NoToneMapping;
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

  // 各環境
  W.corridorG = buildCorridor(); scene.add(W.corridorG);
  W.raceG = buildRace(); scene.add(W.raceG);
  W.revealG = buildReveal(); scene.add(W.revealG);

  // パーティクル（競馬場用）
  W.confetti = new Confetti(400, new THREE.Vector3(0, 6, 6), new THREE.Vector3(16, 7, 12));
  W.raceG.add(W.confetti.mesh);
  W.sparkles = new Sparkles(150, new THREE.Vector3(0, 4.5, 3), new THREE.Vector3(13, 5, 10));
  W.raceG.add(W.sparkles.pts);

  // ポストプロセス
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const afterPass = new AfterimagePass(0);
  afterPass.enabled = false;
  composer.addPass(afterPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(540, 960), .35, .6, .78);
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
    uniforms: { tDiffuse: { value: null }, sat: { value: 1.17 }, vig: { value: .38 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float sat; uniform float vig; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(.299, .587, .114));
        vec3 col = mix(vec3(l), c.rgb, sat);
        col *= vec3(1.02, 1.0, .985);
        float d = distance(vUv, vec2(.5, .52));
        col *= 1.0 - smoothstep(.46, .92, d) * vig;
        gl_FragColor = vec4(col, c.a);
      }`,
  };
  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  W.gradePass = gradePass;
  composer.addPass(new OutputPass());
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

export function updateWorldFx() {
  W.bloomPass.strength = state.bloom;
  const af = state.after;
  W.afterPass.enabled = af > .02;
  if (W.afterPass.enabled) W.afterPass.uniforms['damp'].value = af;
  const rd = state.radial;
  W.radialPass.enabled = rd > .004;
  if (W.radialPass.enabled) W.radialPass.uniforms['strength'].value = rd;
}
