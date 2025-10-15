// The Grey v2.571 — UI/Animation Patch Bundle
// ============================================
// Paste this whole file over your existing index.js.
// Focus: Aetherflow placement, Aetherflow title, AetherGem text fit, Trance placeholders,
// and hand animation jitter fix. Includes defensive hooks so it won't explode if some
// nodes are missing in your current DOM.
//
// Assumptions (non-breaking):
// - Aetherflow board container:    .aetherflow-board
// - Aetherflow title element:      .aetherflow-title
// - Aetherflow slots:              .aetherflow-slot (data-index on each)
// - Player areas:                  .player[data-id="aria"|"morr"]
// - Portrait area:                 .portrait
// - Aether gem wrapper:            .aether-gem (contains <svg> with <text> OR a <span class="aether-gem-value">)
// - Trance container:              .trance (inside each player), with two .trance-level items
// - Hand container:                .hand
// - Cards:                         .card (draggable) with data-card-id and optional data-cost
//
// Nothing below touches game logic; it's purely presentation + drag/drop plumbing.
// You can wire these callbacks to your existing turn engine if needed.
//
// ---------------------------------------------------------------

const UI = (() => {
  const state = {
    dragging: null,
    dragOrigin: null,
    raf: 0,
    turnHasFlowed: false,
  };

  // --- Utilities ------------------------------------------------------------
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const nextFrame = () => new Promise(requestAnimationFrame);
  const afterTransition = (el) => new Promise((res) => {
    if (!el) return res();
    const onEnd = (e) => {
      if (e.target !== el) return;
      el.removeEventListener('transitionend', onEnd);
      res();
    };
    el.addEventListener('transitionend', onEnd, { once: true });
    // fallback
    setTimeout(res, 350);
  });

  // FLIP helpers (to remove redraw jitter on hand re-layout)
  const flipAnimate = async (elements, mutate) => {
    const first = new Map();
    elements.forEach(el => {
      const r = el.getBoundingClientRect();
      first.set(el, r);
    });

    await mutate();

    await nextFrame();
    const timing = { duration: 220, easing: 'cubic-bezier(.2,.6,.2,1)' };
    elements.forEach(el => {
      const f = first.get(el);
      const l = el.getBoundingClientRect();
      const dx = f.left - l.left;
      const dy = f.top - l.top;
      const sx = f.width / Math.max(l.width, 1);
      const sy = f.height / Math.max(l.height, 1);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: 'translate(0,0) scale(1,1)' }
        ],
        timing
      );
    });
    await new Promise(r => setTimeout(r, timing.duration));
  };

  // Compute transform needed to move card onto slot (fixes offset placement)
  const computeSnapTransform = (cardEl, slotEl) => {
    const cb = cardEl.getBoundingClientRect();
    const sb = slotEl.getBoundingClientRect();
    // center card on slot
    const dx = (sb.left + sb.width / 2) - (cb.left + cb.width / 2);
    const dy = (sb.top + sb.height / 2) - (cb.top + cb.height / 2);
    return { dx, dy };
  };

  // --- Aetherflow -----------------------------------------------------------
  const ensureAetherflowTitle = () => {
    const board = qs('.aetherflow-board');
    if (!board) return;
    let title = qs('.aetherflow-title', board);
    if (!title) {
      title = document.createElement('div');
      title.className = 'aetherflow-title';
      title.textContent = 'AETHERFLOW';
      board.appendChild(title);
    } else if (!title.textContent.trim()) {
      title.textContent = 'AETHERFLOW';
    }
  };

  const aetherflowOncePerTurn = () => {
    // Simple guard: add .flowed-this-turn to board after animate, remove when new turn starts.
    const board = qs('.aetherflow-board');
    if (!board) return;
    if (board.classList.contains('flowed-this-turn')) return;
    board.classList.add('flowed-this-turn');
    // Kick a gentle river animation (CSS-driven)
    board.classList.add('river-tick');
    setTimeout(() => board.classList.remove('river-tick'), 1200);
  };

  const startNewTurn = () => {
    const board = qs('.aetherflow-board');
    if (board) board.classList.remove('flowed-this-turn');
    state.turnHasFlowed = false;
  };

  // --- AetherGem text fit inside gem ---------------------------------------
  const fitGemText = () => {
    qsa('.aether-gem').forEach(gem => {
      // Try SVG <text> first
      const svg = gem.querySelector('svg');
      if (svg) {
        // Use viewBox size as basis
        const vb = svg.getAttribute('viewBox');
        let boxSize = 100;
        if (vb) {
          const parts = vb.split(' ').map(Number);
          if (parts.length === 4 && parts[2] > 0) boxSize = parts[2];
        }
        const textEl = svg.querySelector('text');
        if (textEl) {
          // Scale font-size to 40% of gem box, clamp for long digits
          const val = (textEl.textContent || '').trim();
          const len = val.length || 1;
          const base = Math.round(boxSize * 0.42);
          const fs = clamp(Math.floor(base * (1.0 - (len - 1) * 0.12)), Math.floor(boxSize * 0.24), Math.floor(boxSize * 0.5));
          textEl.setAttribute('font-size', String(fs));
          textEl.setAttribute('text-anchor', 'middle');
          textEl.setAttribute('dominant-baseline', 'central');
          // Center if not already:
          if (!textEl.getAttribute('x')) textEl.setAttribute('x', String(boxSize / 2));
          if (!textEl.getAttribute('y')) textEl.setAttribute('y', String(boxSize / 2));
        }
      } else {
        // Fallback <span class="aether-gem-value">
        const span = gem.querySelector('.aether-gem-value');
        if (span) {
          // Measure container and set font-size
          const r = gem.getBoundingClientRect();
          const size = Math.max(12, Math.min(r.width, r.height) * 0.42);
          span.style.fontSize = size + 'px';
        }
      }
    });
  };

  // --- Trance placeholders --------------------------------------------------
  const ensureTrancePlaceholders = () => {
    qsa('.player').forEach(player => {
      let trance = qs('.trance', player);
      if (!trance) {
        trance = document.createElement('div');
        trance.className = 'trance';
        trance.innerHTML = `
          <div class="trance-level" data-level="1">◇ I — Runic Surge</div>
          <div class="trance-level" data-level="2">◇ II — Spell Unbound</div>
        `;
        player.appendChild(trance);
      } else if (!qs('.trance-level', trance)) {
        trance.innerHTML = `
          <div class="trance-level" data-level="1">◇ I — Runic Surge</div>
          <div class="trance-level" data-level="2">◇ II — Spell Unbound</div>
        `;
      }
      // Respect active level attribute on player (data-trance="0|1|2")
      const active = Number(player.getAttribute('data-trance') || '0');
      qsa('.trance-level', trance).forEach(levelEl => {
        const lvl = Number(levelEl.getAttribute('data-level'));
        levelEl.classList.toggle('active', active >= lvl);
      });
    });
  };

  // Public method to update trance level externally
  const setTranceLevel = (playerId, level) => {
    const player = qs(`.player[data-id="${playerId}"]`);
    if (!player) return;
    player.setAttribute('data-trance', String(level));
    ensureTrancePlaceholders();
  };

  // --- Drag & Drop to Aetherflow slots (offset fix) ------------------------
  const enableDragDrop = () => {
    const hand = qs('.hand');
    if (!hand) return;

    let currentOverSlot = null;

    const onPointerDown = (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      card.setPointerCapture?.(e.pointerId);
      state.dragging = card;
      state.dragOrigin = {
        x: e.clientX,
        y: e.clientY,
        tx: 0,
        ty: 0
      };
      card.classList.add('dragging');
    };

    const onPointerMove = (e) => {
      if (!state.dragging) return;
      const dx = e.clientX - state.dragOrigin.x;
      const dy = e.clientY - state.dragOrigin.y;
      state.dragOrigin.tx = dx;
      state.dragOrigin.ty = dy;
      state.dragging.style.transform = `translate(${dx}px, ${dy}px)`;

      // highlight slot under pointer
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slot = el?.closest?.('.aetherflow-slot');
      if (slot !== currentOverSlot) {
        currentOverSlot?.classList.remove('over');
        slot?.classList.add('over');
        currentOverSlot = slot || null;
      }
    };

    const onPointerUp = async (e) => {
      if (!state.dragging) return;
      state.dragging.releasePointerCapture?.(e.pointerId);

      const card = state.dragging;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slot = el?.closest?.('.aetherflow-slot');

      if (slot) {
        // Snap via transform to correct for offset, then finalize by moving DOM node
        const { dx, dy } = computeSnapTransform(card, slot);
        card.style.transition = 'transform 160ms ease-out';
        card.style.transform = `translate(${state.dragOrigin.tx + dx}px, ${state.dragOrigin.ty + dy}px)`;
        await afterTransition(card);
        card.style.transition = '';
        card.style.transform = '';

        slot.innerHTML = ''; // clear any ghost
        slot.appendChild(card);
        card.classList.add('placed');
      } else {
        // return to origin
        card.style.transition = 'transform 160ms ease-out';
        card.style.transform = `translate(0,0)`;
        await afterTransition(card);
        card.style.transition = '';
        card.style.transform = '';
      }

      currentOverSlot?.classList.remove('over');
      card.classList.remove('dragging');
      state.dragging = null;
      state.dragOrigin = null;
    };

    hand.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // --- Hand animation (draw/discard) jitter fixes --------------------------
  const handAnimator = (() => {
    const hand = () => qs('.hand');
    const cards = () => qsa('.hand .card');

    // Public hooks
    const onDraw = async (newCards = []) => {
      // Animate with FLIP, inserting nodes first to avoid flash
      const els = cards();
      await flipAnimate(els, async () => {
        const h = hand();
        newCards.forEach(c => h?.appendChild(c));
        await nextFrame();
        // allow CSS to fan
      });
    };

    const onDiscard = async (idsToRemove = []) => {
      const h = hand();
      if (!h) return;
      const toRemove = cards().filter(c => idsToRemove.includes(c.dataset.cardId));
      // Fade then remove with FLIP for remaining
      await Promise.all(toRemove.map(el => {
        el.classList.add('discarding');
        return afterTransition(el);
      }));
      const remain = cards().filter(c => !idsToRemove.includes(c.dataset.cardId));
      await flipAnimate(remain, async () => {
        toRemove.forEach(el => el.remove());
        await nextFrame();
      });
    };

    const refan = async () => {
      // Re-apply fan layout to kill jitter from rapid redraw
      const els = cards();
      await flipAnimate(els, async () => {
        await nextFrame();
      });
    };

    return { onDraw, onDiscard, refan };
  })();

  // --- Initialization -------------------------------------------------------
  const init = () => {
    ensureAetherflowTitle();
    ensureTrancePlaceholders();
    enableDragDrop();
    fitGemText();

    // Observe for gem value changes or portrait resize (resize observer)
    const ro = new ResizeObserver(() => fitGemText());
    qsa('.aether-gem').forEach(el => ro.observe(el));

    // When a new turn starts in your engine, call startNewTurn(); then trigger river once.
    document.addEventListener('new-turn', () => {
      startNewTurn();
      aetherflowOncePerTurn();
    });

    // If your engine dispatches a 'flow-aether' event, it will trigger once per turn.
    document.addEventListener('flow-aether', () => aetherflowOncePerTurn());
  };

  return {
    init,
    startNewTurn,
    triggerAetherflow: aetherflowOncePerTurn,
    setTranceLevel,
    hand: handAnimator
  };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => UI.init());

// Optional: expose for console debugging
window.TheGreyUI = UI;
