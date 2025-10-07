
/**
 * The Grey — Hand drag & hold-to-preview (auto-detect edition)
 */
export function initHandDnD(opts = {}) {
  const hand = opts.hand || findHand();
  if (!hand) return console.warn('[tg] hand container not found');
  const cardSel = opts.cardSelector || '[data-card]';
  const slotSel = opts.slotSelector || '.slot,[data-slot]';
  const holdMs = opts.holdMs ?? 450;
  const moveCancelPx = opts.moveCancelPx ?? 8;

  ensurePreviewLayer();

  // Autotag cards if selector is generic
  if (cardSel === '[data-card]') autoTagCards(hand);

  bindAll(hand.querySelectorAll(cardSel));

  const mo = new MutationObserver(() => {
    if (cardSel === '[data-card]') autoTagCards(hand);
    bindAll(hand.querySelectorAll(cardSel));
  });
  mo.observe(hand, { childList: true, subtree: true });

  function bindAll(nodes){ nodes.forEach(attachCard); }

  function attachCard(card) {
    if (card.__tgBound) return;
    card.__tgBound = true;
    card.classList.add('tg-card','tg-card-fan');
    card.addEventListener('pointerdown', (e) => onDown(e, card));
  }

  function onDown(e, card) {
    if (e.button && e.button !== 0) return;
    card.setPointerCapture?.(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let holdTimer = null, previewing = false, dragging = false, ghost = null, ox = 0, oy = 0;

    const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };

    const openPreview = () => {
      if (dragging || previewing) return;
      previewing = true;
      const layer = document.getElementById('tgPreviewLayer');
      const clone = card.cloneNode(true);
      clone.classList.add('tg-preview-card');
      layer.innerHTML = '';
      layer.appendChild(clone);
      layer.classList.add('active');
      card.classList.add('tg-held');
      if (isInstant(card)) card.classList.add('tg-instant','tg-held');
    };

    const closePreview = () => {
      if (!previewing) return;
      previewing = false;
      const layer = document.getElementById('tgPreviewLayer');
      layer.classList.remove('active');
      layer.innerHTML = '';
      card.classList.remove('tg-held','tg-instant');
    };

    const startDrag = () => {
      if (dragging) return;
      dragging = true;
      cancelHold();
      closePreview();
      const r = card.getBoundingClientRect();
      ox = start.x - r.left;
      oy = start.y - r.top;
      ghost = card.cloneNode(true);
      ghost.classList.add('tg-ghost');
      if (isInstant(card)) ghost.classList.add('tg-instant','tg-held');
      document.body.appendChild(ghost);
      moveGhost(start.x, start.y);
    };

    const moveGhost = (x, y) => {
      if (!ghost) return;
      ghost.style.transform = `translate3d(${(x - ox)}px, ${(y - oy)}px, 0)`;
    };

    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) > moveCancelPx) startDrag();
      if (dragging) {
        moveGhost(ev.clientX, ev.clientY);
        highlightSlotUnder(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev) => {
      cancelHold();
      card.releasePointerCapture?.(e.pointerId);
      if (dragging) {
        const dropped = dropOnSlot(ev.clientX, ev.clientY, card);
        if (!dropped) {/* visual snapback only */}
      } else if (previewing) {
        closePreview();
      }
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      clearHighlights();
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      card.classList.remove('tg-held','tg-instant');
    };

    holdTimer = setTimeout(openPreview, holdMs);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  }

  function isInstant(card) {
    if (card.matches('.instant,[data-type="Instant"],[data-instant="true"]')) return true;
    const t = (card.getAttribute('data-type') || card.textContent || '').toLowerCase();
    return t.includes('instant');
  }

  function highlightSlotUnder(x, y) {
    clearHighlights();
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const slot = el.closest?.('[data-slot], .slot');
    if (slot) slot.classList.add('tg-slot-hover');
  }
  function clearHighlights() {
    document.querySelectorAll('.tg-slot-hover').forEach(el => el.classList.remove('tg-slot-hover'));
  }
  function dropOnSlot(x, y, card) {
    const els = document.elementsFromPoint(x, y);
    const slot = els.map(el => el.closest?.('[data-slot], .slot')).find(Boolean);
    if (!slot) return false;
    slot.classList.remove('tg-slot-hover');
    return true;
  }

  function ensurePreviewLayer() {
    if (!document.getElementById('tgPreviewLayer')) {
      const div = document.createElement('div');
      div.id = 'tgPreviewLayer';
      document.body.appendChild(div);
    }
  }

  function findHand() {
    const basic = document.querySelector([
      "[data-hand]",
      "[data-zone='hand']",
      "[data-zone*='hand' i]",
      ".hand",
      "#hand",
      ".hand-zone",
      ".handcards",
      ".cards-hand",
      "[data-region='hand']",
      "[data-row='hand']",
      "[data-area='hand']"
    ].join(','));
    if (basic) { basic.dataset.hand = basic.dataset.hand || "true"; return basic; }

    // Heuristic: bottom scrollable strip with portrait children
    const vh = window.innerHeight || 800;
    const all = Array.from(document.querySelectorAll('body *'));
    const scrollers = all.filter(el => {
      const cs = getComputedStyle(el);
      const overflowX = cs.overflowX;
      if (!/(auto|scroll)/.test(overflowX)) return false;
      if (el.scrollWidth <= el.clientWidth) return false;
      const r = el.getBoundingClientRect();
      const nearBottom = (vh - r.bottom) < vh * 0.35;
      return nearBottom && el.children.length >= 3;
    });
    const portraitScore = (el) => {
      let score = 0;
      for (const child of el.children) {
        const r = child.getBoundingClientRect();
        if (r.width > 40 && r.height > 60 && r.height > r.width * 1.2) score++;
      }
      return score;
    };
    scrollers.sort((a,b)=>portraitScore(b)-portraitScore(a));
    const pick = scrollers[0] || null;
    if (pick) pick.dataset.hand = pick.dataset.hand || "true";
    return pick;
  }

  function autoTagCards(hand) {
    if (!hand) return;
    const kids = Array.from(hand.querySelectorAll('*'));
    for (const el of kids) {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 60 && r.height > r.width * 1.2) {
        el.dataset.card = el.dataset.card || "true";
      }
    }
  }
}

// Auto-run on load
if (typeof window !== 'undefined') {
  const boot = () => { try { initHandDnD({}); } catch(e) { console.warn('[tg] init error', e); } };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
  // Fallback: late-load re-init
  setTimeout(() => { try { initHandDnD({}); } catch(e) {} }, 1000);
}
