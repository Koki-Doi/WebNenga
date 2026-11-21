// js/main.js
import { initEditor } from './editor.js';
import { initCardControls } from './card-controls.js';
import { initCardEffects } from './card-effects.js';
import { initPrint } from './print.js';

// 初期ロード中インジケータ（index.html 直書き）をフェードアウトして除去。
// フェードイン途中でも現在の不透明度から滑らかに消えるよう、値を固定してから遷移させる。
function dismissPageLoading() {
  const el = document.getElementById('page-loading');
  if (!el) return;
  el.style.opacity = getComputedStyle(el).opacity;
  el.classList.add('is-done');
  requestAnimationFrame(() => { el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 450);
}

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('card-container');
  const card = document.getElementById('card');

  if (!container || !card) {
    console.warn('Card container/card element not found. Skipping card initialization.');
    initEditor();
    dismissPageLoading();
    return;
  }

  const isEditorOpen = () => document.documentElement.classList.contains('editing-open');

  initCardControls({ container, card, isEditorOpen });
  initCardEffects({ container, card });
  initEditor();
  initPrint();
  dismissPageLoading();
});
