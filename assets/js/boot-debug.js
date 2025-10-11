/* The Grey — Mobile/Desktop layout bootstrap (v2.3.5 mobile sync)
   - Centers slot rows and preserves a 1280x720 stage with responsive scale
   - HUD hand overlay layer (non-clipping, above board)
   - Places Deck next to End Turn on the right
   - Press & Hold preview (touch + mouse)
   - Defensive (won’t break if selectors change)
*/

(() => {
  const STAGE_W = 1280;
  const STAGE_H = 720;
  const HOLD_MS = 260; // long-press threshold

  let stage, scaleWrap, hud, handRow, ctl, preview;
  let holdTimer = null;
  let heldCard = null;

  // ————— Utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // scale to fit (keeping 16:9), accounting for HUD
  function applyScale() {
    if (!scaleWrap || !stage) return;
    const hudH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 180;
    const vw = window.innerWidth;
    const vh = window.innerHeight - hudH;
    const sx = vw / STAGE_W;
    const sy = vh / STAGE_H;
    const s = Math.min(sx, sy);

    stage.style.transform = `scale(${s})`;
  }

  // To avoid fighting your main render, wrap once when #app gets content
  function ensureScaleFrame() {
    const mount = $('#app');
    if (!mount) return;

    if (!$('.tg-scale')) {
      scaleWrap = document.createElement('div');
      scaleWrap.className = 'tg-scale';

      stage = document.createElement('div');
      stage.className = 'tg-stage';

      // move any existing children of #app into stage
      while (mount.firstChild) stage.appendChild(mount.firstChild);
      mount.appendChild(scaleWrap);
      scaleWrap.appendChild(stage);
    }
    applyScale();
  }

  // HUD overlay with a “hand row” container and a right-side control cluster
  function ensureHud() {
    if ($('.tg-hud')) return;

    hud = document.createElement('div');
    hud.className = 'tg-hud';

    handRow = document.createElement('div');
    handRow.className = 'tg-hand-row';
    hud.appendChild(handRow);

    document.body.appendChild(hud);

    // Controls cluster (End Turn + Deck)
    ctl = document.createElement('div');
    ctl.className = 'tg-ctl';
    document.body.appendChild(ctl);

    // try to graft your existing controls into the cluster (non-breaking)
    const endTurn = $('[data-btn="endturn"], .endturn, button[aria-label="End Turn"]');
    if (endTurn) ctl.appendChild(endTurn);

    const deck = $('[data-btn="deck"], .deck, button[aria-label="Deck"], .tg-deck');
    if (deck) ctl.appendChild(deck);

    // Version tag (optional)
    const version = window.__THE_GREY_BUILD;
    if (version && !$('.tg-version')) {
      const tag = document.createElement('div');
      tag.className = 'tg-version';
      tag.textContent = version;
      document.body.appendChild(tag);
    }
  }

  // Try to mirror whatever your game uses as the live “hand” source
  function syncHandIntoHud() {
    if (!handRow) return;

    // pick first that exists: .hand, [data-hand], or bottom-most row of cards
    let src =
      $('.hand') ||
      $('[data-hand="you"]') ||
      (function findBottomRow() {
        const rows = $$('.row');
        if (!rows.length) return null;
        // choose the one visually lowest on screen
        return rows.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).pop();
      })();

    if (!src) return;

    // Grab card nodes (don’t clone deeply to preserve events)
    const cards = $$('.card', src);
    // Soft re-render: clear, then append lightweight mirrors
    handRow.textContent = '';
    cards.forEach(card => {
      const ph = document.createElement('div');
      ph.className = 'card';
      ph.style.width = getComputedStyle(card).width;
      ph.style.height = getComputedStyle(card).height;
      // visually mirror (title/ribbon). If your DOM has richer inner HTML, copy safely:
      ph.innerHTML = card.innerHTML;
      // mark so drags don’t interfere with source
      ph.dataset.mirror = 'hand';
      handRow.appendChild(ph);
    });
  }

  // Press & hold preview
  function ensurePreview() {
    if (preview) return;
    preview = document.createElement('div');
    preview.className = 'tg-preview';
    preview.style.display = 'none';
    document.body.appendChild(preview);
  }

  function showPreview(fromCard) {
    ensurePreview();
    document.documentElement.classList.add('tg-no-select');
    preview.innerHTML = '';
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = fromCard.innerHTML;
    preview.appendChild(c);
    preview.style.display = 'grid';
    requestAnimationFrame(() => preview.classList.add('show'));
  }

  function hidePreview() {
    document.documentElement.classList.remove('tg-no-select');
    if (!preview) return;
    preview.classList.remove('show');
    preview.style.display = 'none';
    preview.innerHTML = '';
  }

  function startHold(e) {
    const target = e.target.closest('.card');
    if (!target) return;
    clearTimeout(holdTimer);
    heldCard = target;
    holdTimer = setTimeout(() => {
      showPreview(heldCard);
    }, HOLD_MS);
  }
  function endHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (preview) hidePreview();
  }

  // Observe for DOM changes so we can keep the HUD hand mirrored & rows centered
  function observe() {
    const mo = new MutationObserver(() => {
      // ensure wrappers exist
      ensureScaleFrame();
      ensureHud();
      // keep hand mirrored
      syncHandIntoHud();
      // rows centering: in case classes are added late
      $$('.row').forEach(r => {
        r.style.justifyContent = 'center';
        r.style.gap = '16px';
      });
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: false });
  }

  // Wire events
  function wire() {
    window.addEventListener('resize', applyScale, { passive: true });
    document.addEventListener('scroll', applyScale, { passive: true });

    // long-press handlers (work for both main board and mirrored hand)
    document.addEventListener('touchstart', startHold, { passive: true });
    document.addEventListener('mousedown', startHold);
    ['touchend', 'touchcancel', 'mouseup', 'mouseleave', 'blur'].forEach(ev =>
      document.addEventListener(ev, endHold, { passive: true })
    );
  }

  // Init when DOM is ready; if your core emits a custom event (e.g., game ready),
  // this still works because we continuously observe.
  function init() {
    ensureScaleFrame();
    ensureHud();
    observe();
    wire();
    applyScale();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
