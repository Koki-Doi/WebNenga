// DOM オーバーレイ（扇子 / セリフ / 確定帯 / フラッシュ / HUD）
// gacha-demo の ui.js から年賀状ガチャに必要な分を移植（ID は gc- プレフィックス）
import { gsap } from 'gsap';
import { state, GACHA } from './gacha-state.js';

const $ = (id) => document.getElementById(id);
export const UI = {};

// ---------- 汎用 ----------
function show(id, v = true) { $(id).classList.toggle('show', v); }
UI.show = show;
// 非表示の層（display:none）を見えないまま一度だけレイアウトさせ、初回表示の文字組みの重さを先に払う
UI.prelayout = (id) => {
  const el = $(id);
  if (!el || el.classList.contains('show')) return;
  el.style.visibility = 'hidden';
  el.classList.add('show');
  void el.offsetWidth;
  el.classList.remove('show');
  el.style.visibility = '';
};
UI.hideAllOverlays = () => {
  for (const id of ['gc-speech', 'gc-reveal-ui']) show(id, false);
};
UI.flash = (inDur = .12, outDur = .5, hold = 0, rainbow = false) => new Promise((res) => {
  const el = $('gc-flash');
  el.classList.add('show');
  el.classList.toggle('rainbow', rainbow);
  gsap.killTweensOf(el);
  gsap.fromTo(el, { opacity: 0 }, {
    opacity: 1, duration: inDur, ease: 'power2.in', onComplete: () => {
      res(); // ピーク時点で次のフェーズへ（カット切替を覆う）
      gsap.to(el, {
        opacity: 0, duration: outDur, delay: hold, ease: 'power2.out',
        onComplete: () => { el.classList.remove('show'); el.classList.remove('rainbow'); }
      });
    }
  });
});

// ---------- セリフ画面 ----------
UI.showSpeech = () => {
  const stars = $('gc-speech-stars');
  stars.innerHTML = '';
  const glyphs = ['✦', '✧', '●', '✦', '☆'];
  const cols = ['#ffffff', '#ffffff', '#ffe9f4', '#eafff2', '#e8f4ff'];
  for (let i = 0; i < 24; i++) {
    const s = document.createElement('i');
    if (Math.random() < .45) {
      s.className = 'hs';
      const sz = 2.2 + Math.random() * 3.6;
      s.style.width = s.style.height = `calc(var(--gsu) * ${sz})`;
      s.style.transform = `rotate(${(Math.random() * 50 - 25).toFixed(0)}deg)`;
      s.style.opacity = .3 + Math.random() * .5;
    } else {
      s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      s.style.fontSize = `calc(var(--gsu) * ${1.2 + Math.random() * 2.4})`;
      s.style.color = cols[Math.floor(Math.random() * cols.length)];
      s.style.textShadow = '0 0 8px rgba(255,255,255,.8)';
      s.style.opacity = .5 + Math.random() * .45;
    }
    s.style.left = Math.random() * 92 + 2 + '%';
    s.style.top = Math.random() * 90 + 3 + '%';
    s.style.animationDelay = `${-Math.random() * 3}s`;
    stars.appendChild(s);
  }
  $('gc-speech-text').textContent = '';
  show('gc-speech', true);
};
UI.animateSpeech = (line) => {
  const el = $('gc-speech-text');
  const box = $('gc-speech-box');
  el.replaceChildren(...line.split('\n').map((text) => {
    const span = document.createElement('span');
    span.className = 'gc-speech-line';
    span.textContent = text;
    return span;
  }));
  // 一文字ずつではなく、行全体をセル画のカットインのように一括表示する。
  box.classList.remove('is-entering');
  void box.offsetWidth;
  box.classList.add('is-entering');
  return Promise.resolve();
};
UI.hideSpeech = () => {
  $('gc-speech-box').classList.remove('is-entering');
  show('gc-speech', false);
};

// ---------- 確定帯（SSR 演出） ----------
UI.showRevealLabels = (tk) => {
  const root = $('gc-reveal-ui');
  root.querySelector('.gc-rv-name').textContent = (GACHA.card.s || '差出人').trim() || '差出人';
  // 余白で瞬く十字のきらめきとしゃぼん玉（年賀状の面には重ねない固定配置）
  const fx = root.querySelector('.gc-rv-fx');
  if (!fx.childElementCount) {
    const spots = [
      ['sp', 5, 5, 3.4], ['sp', 93, 9, 4.6], ['sp', 4, 33, 2.4], ['sp', 96, 41, 3], ['sp', 6, 63, 4],
      ['sp', 94, 70, 2.6], ['sp', 16, 79, 2.8], ['sp', 86, 96, 3.6], ['sp', 30, 97, 2.2], ['sp', 60, 2.5, 2],
      ['bb', 8, 18, 7], ['bb', 95, 24, 5], ['bb', 3.5, 50, 4], ['bb', 96, 57, 8], ['bb', 12, 94, 6], ['bb', 72, 98, 4.5],
    ];
    spots.forEach(([kind, x, y, size], i) => {
      const el = document.createElement('i');
      el.className = kind;
      el.style.left = `${x}%`; el.style.top = `${y}%`;
      el.style.setProperty('--s', size);
      el.style.animationDelay = `${-(i * .37) % 1.7}s`;
      fx.appendChild(el);
    });
  }
  show('gc-reveal-ui', true);
  const tl = gsap.timeline();
  tk?._tweens.add(tl);
  tl.fromTo('.gc-rv-band', { xPercent: -60, opacity: 0 }, { xPercent: 0, opacity: 1, duration: .34, ease: 'power3.out' })
    .fromTo('.gc-rv-epithet', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .25, ease: 'power2.out' }, .14)
    .fromTo('.gc-rv-name', { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .42, ease: 'back.out(1.8)' }, .2)
    .to('.gc-rv-stars span', { scale: 1, rotation: -8, duration: .34, ease: 'back.out(2.6)', stagger: .17 }, .42)
    .to('.gc-rv-new', { scale: 1, duration: .35, ease: 'back.out(2.2)' }, .9)
    .fromTo('.gc-rv-items', { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: .3, ease: 'power2.out' }, 1.0);
  gsap.set('.gc-rv-stars span', { scale: 0 });
  // scale(0) からは傾きを読み戻せないため、回転は明示して保持する
  gsap.set('.gc-rv-new', { scale: 0, rotation: -9 });
};
UI.hideRevealLabels = () => show('gc-reveal-ui', false);
