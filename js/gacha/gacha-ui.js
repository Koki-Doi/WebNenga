// DOM オーバーレイ（扇子 / セリフ / 確定帯 / フラッシュ / HUD）+ WebAudio 効果音
// gacha-demo の ui.js から年賀状ガチャに必要な分を移植（ID は gc- プレフィックス）
import { gsap } from 'gsap';
import { state, GACHA } from './gacha-state.js';

const $ = (id) => document.getElementById(id);
export const UI = {};

// ---------- 効果音（WebAudio シンセ） ----------
export const SFX = {
  ctx: null, master: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = state.muted ? 0 : .3;
    this.master.connect(this.ctx.destination);
  },
  setMuted(m) { if (this.master) this.master.gain.value = m ? 0 : .3; },
  _noise(dur) {
    const n = this.ctx.sampleRate * dur;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    return src;
  },
  _env(t0, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(.001, t0 + a + d);
    g.connect(this.master);
    return g;
  },
  tone(freq, dur, type = 'sine', vol = .5, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    o.connect(this._env(t0, .01, dur, vol));
    o.start(t0); o.stop(t0 + dur + .1);
  },
  whoosh(dur = .5, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this._noise(dur + .1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(250, t0);
    f.frequency.exponentialRampToValueAtTime(3600, t0 + dur);
    src.connect(f); f.connect(this._env(t0, .04, dur, .8));
    src.start(t0);
  },
  thud(delay = 0) {
    this.tone(130, .35, 'sine', .9, 42, delay);
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this._noise(.2);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    src.connect(f); f.connect(this._env(t0, .005, .18, .55));
    src.start(t0);
  },
  sparkle(delay = 0, base = 1240) {
    const notes = [0, 4, 7, 12, 16];
    notes.forEach((n, i) => this.tone(base * Math.pow(2, n / 12), .3, 'triangle', .22, null, delay + i * .055));
  },
  ding(delay = 0) { this.tone(1180, .5, 'sine', .5, null, delay); this.tone(2360, .4, 'sine', .18, null, delay); },
  clang(delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    [820, 1230, 1980].forEach((f, i) => this.tone(f, .25 - i * .05, 'square', .16, f * .92, delay));
    const src = this._noise(.16);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2400;
    src.connect(hp); hp.connect(this._env(t0, .004, .15, .5));
    src.start(t0);
  },
  swell(dur = 1.6, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    [220, 277, 330].forEach((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 2, t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(.0001, t0);
      g.gain.exponentialRampToValueAtTime(.12, t0 + dur * .8);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur + .25);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(600, t0);
      lp.frequency.exponentialRampToValueAtTime(5200, t0 + dur);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + .3);
    });
  },
  fanfare(delay = 0) {
    const seq = [[523, 0], [659, .11], [784, .22], [1047, .34]];
    for (const [f, d] of seq) { this.tone(f, .26, 'sawtooth', .2, null, delay + d); this.tone(f, .26, 'square', .08, null, delay + d); }
    [1047, 1319, 1568].forEach((f) => { this.tone(f, .9, 'sawtooth', .14, null, delay + .5); });
    this.sparkle(delay + .5, 2093);
  },
  gallop() {
    if (!this.ctx) return;
    for (let i = 0; i < 9; i++) {
      const t = i * .14;
      this.tone(95 + (i % 2) * 18, .1, 'sine', .5, 55, t);
    }
  },
  // ---- BGM（軽い王道進行ループ） ----
  _note(midi, t0, dur, type, vol) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + .015);
    g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    g.connect(this.master);
    o.connect(g);
    o.start(t0); o.stop(t0 + dur + .05);
  },
  bgmStart() {
    if (!this.ctx || this._bgmTimer) return;
    const chords = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]];
    const bass = [36, 43, 45, 41];
    const mel = [
      72, 0, 76, 0, 79, 0, 76, 74,
      72, 0, 74, 76, 74, 0, 71, 0,
      69, 0, 72, 0, 76, 0, 72, 69,
      65, 0, 69, 72, 74, 0, 76, 79,
    ];
    const EIGHTH = 60 / 132 / 2;
    this._bgmStep = 0;
    this._bgmNext = this.ctx.currentTime + .1;
    this._bgmTimer = setInterval(() => {
      if (!this.ctx) return;
      const ahead = this.ctx.currentTime + .3;
      while (this._bgmNext < ahead) {
        const s = this._bgmStep % 32, t0 = this._bgmNext, bar = Math.floor(s / 8);
        const in8 = s % 8;
        if (in8 === 0 || in8 === 3 || in8 === 6) this._note(bass[bar], t0, .26, 'triangle', .15);
        if (in8 % 2 === 1) for (const m of chords[bar]) this._note(m, t0, .13, 'square', .018);
        if (mel[s]) this._note(mel[s], t0, .21, 'triangle', .05);
        this._bgmNext += EIGHTH;
        this._bgmStep++;
      }
    }, 110);
  },
  bgmStop() {
    clearInterval(this._bgmTimer);
    this._bgmTimer = null;
  },
};

// ---------- 汎用 ----------
function show(id, v = true) { $(id).classList.toggle('show', v); }
UI.show = show;
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
  show('gc-reveal-ui', true);
  const tl = gsap.timeline();
  tk?._tweens.add(tl);
  tl.fromTo('.gc-rv-band', { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: .32, ease: 'power3.out' })
    .fromTo('.gc-rv-epithet', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .25, ease: 'power2.out' }, .14)
    .fromTo('.gc-rv-name', { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .42, ease: 'back.out(1.8)' }, .2)
    .to('.gc-rv-stars span', { scale: 1, rotation: -8, duration: .34, ease: 'back.out(2.6)', stagger: .17, onStart: () => SFX.ding() }, .42)
    .add(() => SFX.sparkle(0, 1600), .8)
    .to('.gc-rv-new', { scale: 1, duration: .35, ease: 'back.out(2.2)' }, .9)
    .fromTo('.gc-rv-items', { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: .3, ease: 'power2.out' }, 1.0);
  gsap.set('.gc-rv-stars span', { scale: 0 });
  gsap.set('.gc-rv-new', { scale: 0 });
};
UI.hideRevealLabels = () => show('gc-reveal-ui', false);
