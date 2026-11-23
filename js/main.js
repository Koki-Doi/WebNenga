// js/main.js
import { initEditor } from './editor.js';
import { initCardControls } from './card-controls.js';
import { initCardEffects } from './card-effects.js';
import { initPrint } from './print.js';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('card-container');
  const card = document.getElementById('card');

  if (!container || !card) {
    console.warn('Card container/card element not found. Skipping card initialization.');
    initEditor();
    return;
  }

  const isEditorOpen = () => document.documentElement.classList.contains('editing-open');

  initCardControls({ container, card, isEditorOpen });
  initCardEffects({ container, card });
  initEditor();
  initPrint();
});
