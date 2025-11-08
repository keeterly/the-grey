// Mirrors your existing End Turn into a floating mobile FAB.
// Prefers the HUD button (#btn-endturn-hud); falls back to header (#btn-end-turn).
(function(){
  const END_TURN_SELECTORS = ['#btn-endturn-hud', '#btn-end-turn'];
  const mm = window.matchMedia('(max-width: 600px)');

  function findEndTurn(){
    for (const sel of END_TURN_SELECTORS){
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }

  function ensureFab(){
    let fab = document.querySelector('.mobile-fab');
    if (!mm.matches){ if (fab) fab.remove(); return; }

    if (!fab){
      fab = document.createElement('button');
      fab.className = 'mobile-fab';
      fab.type = 'button';
      fab.setAttribute('aria-label', 'End turn');

      // Reuse your existing «» glyph feel (you can swap to your SVG if desired)
      fab.textContent = '»';

      fab.addEventListener('click', () => {
        const endBtn = findEndTurn();
        endBtn?.click();
      }, { passive: true });

      document.body.appendChild(fab);
    }
  }

  // Initial + on viewport changes
  ensureFab();
  mm.addEventListener('change', ensureFab);

  // If your game hot-swaps HUD buttons later, keep FAB alive
  const mo = new MutationObserver(ensureFab);
  mo.observe(document.body, { childList: true, subtree: true });
})();
