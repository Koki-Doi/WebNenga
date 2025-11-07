// js/card-controls.js
// Responsible for flipping the postcard and suppressing unintended page scrolls.

export function initCardControls({ container, card, isEditorOpen }) {
  if (!container || !card) return;

  const toggle = () => {
    if (isEditorOpen()) return;
    card.classList.toggle('flipped');
    const pressed = card.classList.contains('flipped') ? 'true' : 'false';
    card.setAttribute('aria-pressed', pressed);
  };

  const handleClick = () => {
    if (isEditorOpen()) return;
    toggle();
  };

  const scrollers = ['Space', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  const handleKeyDown = (e) => {
    if (isEditorOpen()) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      toggle();
    } else if (scrollers.includes(e.code)) {
      e.preventDefault();
    }
  };

  const preventScroll = (ev) => {
    if (isEditorOpen()) return;
    ev.preventDefault();
  };

  container.addEventListener('click', handleClick);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('wheel', preventScroll, { passive: false });
  window.addEventListener('touchmove', preventScroll, { passive: false });
  window.addEventListener('gesturestart', preventScroll, { passive: false });

  return { toggle };
}
