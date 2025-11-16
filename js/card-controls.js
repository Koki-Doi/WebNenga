// js/card-controls.js
// Responsible for flipping the postcard and suppressing unintended page scrolls.

export function initCardControls({ container, card, isEditorOpen }) {
  if (!container || !card) return;

  let lastFlipDir = 1;
  const getIsFlipped = () => card.classList.contains('flipped');
  const updatePressedState = () => {
    const pressed = getIsFlipped() ? 'true' : 'false';
    card.setAttribute('aria-pressed', pressed);
  };
  const applyFlipState = (shouldFlip) => {
    card.classList.toggle('flipped', shouldFlip);
    updatePressedState();
  };
  const setFlipDirection = (dir = 1) => {
    const normalized = dir >= 0 ? 1 : -1;
    lastFlipDir = normalized;
    card.style.setProperty('--flip-direction', `${normalized}`);
  };
  setFlipDirection(1);

  const markTapHintDismissed = () => {
    if (card.classList.contains('tap-hint-dismissed')) return;
    card.classList.add('tap-hint-dismissed');
  };

  const toggle = (direction = null) => {
    if (isEditorOpen()) return;
    markTapHintDismissed();
    if (direction != null) setFlipDirection(direction);
    applyFlipState(!getIsFlipped());
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

  const handlePointerDown = () => {
    if (isEditorOpen()) return;
    markTapHintDismissed();
    container.removeEventListener('pointerdown', handlePointerDown);
  };
  container.addEventListener('pointerdown', handlePointerDown, { passive: true });

  const SWIPE_THRESHOLD = 40;
  const SWIPE_VERTICAL_LIMIT = 60;
  let startX = null;
  let startY = null;

  const handleTouchStart = (e) => {
    if (isEditorOpen()) return;
    if (e.touches.length !== 1) {
      startX = null;
      startY = null;
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
  };

  const handleTouchEnd = (e) => {
    if (isEditorOpen()) return;
    if (startX == null || startY == null) return;
    const t = e.changedTouches?.[0];
    const sx = startX;
    const sy = startY;
    startX = null;
    startY = null;
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_VERTICAL_LIMIT) return;
    const direction = dx < 0 ? -1 : 1;
    toggle(direction);
  };

  container.addEventListener('touchstart', handleTouchStart, { passive: true });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
  container.addEventListener('touchcancel', () => {
    startX = null;
    startY = null;
  }, { passive: true });

  return { toggle };
}
