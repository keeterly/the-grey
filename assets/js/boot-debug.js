// keep these in sync with your constants
const PREVIEW_SCALE = 2.5;                      // 250% target
const PREVIEW_EASE_MS = 100;                    // quick ease into scale

function applyPreview(card) {
  // capture visual box
  const r = card.getBoundingClientRect();
  const startLeft = r.left;
  const startTop  = r.top;
  const startW    = r.width;
  const startH    = r.height;

  // remember original inline bits so we can restore 1:1
  card.__previewRestore = {
    position: card.style.position,
    left:     card.style.left,
    top:      card.style.top,
    width:    card.style.width,
    height:   card.style.height,
    transform:card.style.transform,
    filter:   card.style.filter,
    zIndex:   card.style.zIndex,
    transition: card.style.transition,
  };

  // freeze the card where it visually is (take it out of flow)
  card.style.position = 'fixed';
  card.style.left     = `${startLeft}px`;
  card.style.top      = `${startTop}px`;
  card.style.width    = `${startW}px`;
  card.style.height   = `${startH}px`;
  card.style.zIndex   = '2147483000';
  card.style.transition = `transform ${PREVIEW_EASE_MS}ms ease`;

  // disable page gestures that can cancel long-press on iOS
  document.documentElement.style.touchAction = 'none';

  // mark state & scale on its own layer
  card.dataset.previewing = '1';
  card.classList.add('is-previewing');
  // scale from center without nudging around
  card.style.transformOrigin = '50% 50%';
  card.style.transform = `translate3d(0,0,0) scale(${PREVIEW_SCALE})`;
  card.style.filter    = 'drop-shadow(0 16px 36px rgba(0,0,0,.35))';
}

function clearPreview(card) {
  if (!card || !card.dataset.previewing) return;

  // snap back to original inline styles (no layout jitter)
  const s = card.__previewRestore || {};
  card.classList.remove('is-previewing');
  delete card.dataset.previewing;

  // remove scale first to avoid a "jump" during restore
  card.style.transition = 'transform 80ms ease';
  card.style.transform  = 'translate3d(0,0,0) scale(1)';
  card.style.filter     = '';

  // after the quick unscale, restore positioning in the next frame
  requestAnimationFrame(() => {
    card.style.position  = s.position ?? '';
    card.style.left      = s.left ?? '';
    card.style.top       = s.top ?? '';
    card.style.width     = s.width ?? '';
    card.style.height    = s.height ?? '';
    card.style.zIndex    = s.zIndex ?? '';
    card.style.transition= s.transition ?? '';
    card.style.transform = s.transform ?? '';
    card.style.filter    = s.filter ?? '';
    card.style.removeProperty('transform-origin');
    card.__previewRestore = null;
    document.documentElement.style.removeProperty('touch-action');
  });
}