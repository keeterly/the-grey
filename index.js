/**
 * index.js — v2.57 bootstrap
 * -------------------------------------------
 * - Loads animations lazily (inside the module) to avoid double-loads.
 * - Wires a tiny event bus (Grey.on / Grey.emit) for decoupled animations.
 * - Boots whatever your GameLogic.js exposes (init/render/turn handlers).
 * - Never throws if a helper is missing — everything is feature-detected.
 */

const qs  = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Tiny event bus (DOM CustomEvents under the hood) ---------- */
const Grey = {
  on(type, handler, options) {
    document.addEventListener(type, handler, options);
    return () => document.removeEventListener(type, handler, options);
  },
  emit(type, detail = {}) {
    document.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
};
// Expose for GameLogic.js (optional usage)
window.Grey = Grey;

/* ---------- Optional animations (lazy) ---------- */
let Anims = null;

async function loadAnimations() {
  try {
    // Cache-busted import so GH Pages doesn't serve an old copy
    const mod = await import('./animations.js?v=257');
    Anims = mod?.default ?? mod;
    // Give the module a chance to hook once, if it exports an install() helper
    if (Anims && typeof Anims.install === 'function') {
      Anims.install({ Grey, root: document });
    }
    // If the animation module wants to subscribe by itself
    if (Anims && typeof Anims.autowire === 'function') {
      Anims.autowire({ Grey });
    }
  } catch (err) {
    // Animations are optional; never block the game if missing
    console.warn('[Animations] not loaded (optional):', err?.message || err);
  }
}

/* ---------- Safely read exported helpers from GameLogic.js ---------- */
function getGameAPI() {
  // Common patterns we’ve used across versions — feature detect them
  const api = {
    // init/boot
    init:
      window.initGame ||
      window.setupGame ||
      window.startGame ||
      window.Game?.init ||
      null,

    // renderers
    renderAll:
      window.renderAll ||
      window.renderBoard ||
      window.Game?.render ||
      null,

    // turn helpers
    startTurn:
      window.startTurn ||
      window.Game?.startTurn ||
      null,

    endTurn:
      window.endTurn ||
      window.Game?.endTurn ||
      null,

    // drag & drop (optional in some builds)
    enableDnD:
      window.enableDragAndDrop ||
      window.Game?.enableDragAndDrop ||
      null
  };

  return api;
}

/* ---------- HUD wiring (safe) ---------- */
function wireHUD(api) {
  const endBtn = qs('#btn-endturn-hud');
  if (endBtn) {
    endBtn.addEventListener('click', async () => {
      // Let game logic handle end turn if provided
      if (typeof api.endTurn === 'function') {
        // You can dispatch “cards:discarded” *before* the actual state change if you want the animation to run while resolving.
        Grey.emit('turn:ending');
        await api.endTurn();
        Grey.emit('turn:ended');
      } else {
        Grey.emit('turn:ended');
      }
    });
  }

  const discardBtn = qs('#btn-discard-hud');
  if (discardBtn) {
    // Example drop target marking (your DnD may already do this)
    discardBtn.dataset.dropTarget = 'discard';
  }
  const deckBtn = qs('#btn-deck-hud');
  if (deckBtn) {
    deckBtn.dataset.dropTarget = 'deck';
  }
}

/* ---------- Portrait aether readouts (safe/optional) ---------- */
function updateAetherDisplays() {
  // If your logic exposes values on window/state, reflect them here.
  // These calls are no-ops if you haven’t wired them yet.
  try {
    const player = window.Game?.state?.player ?? window.playerState;
    const ai     = window.Game?.state?.ai     ?? window.aiState;

    const p = qs('#player-aether');
    const a = qs('#ai-aether');
    if (p && player && typeof player.aether === 'number') {
      p.textContent = `${player.aether}`;
    }
    if (a && ai && typeof ai.aether === 'number') {
      a.textContent = `${ai.aether}`;
    }
  } catch (_) {
    // silent — best effort UI refresh
  }
}

/* ---------- Animation hooks (events you can emit from GameLogic) ---------- */
/*
  Fire these from your game logic whenever appropriate:

  Grey.emit('cards:drawn',   { cards, source: 'deck' });
  Grey.emit('cards:discarded',{ cards, target: 'discard' });
  Grey.emit('flow:reveal',   { cardEl, index });        // leftmost/new reveal
  Grey.emit('flow:falloff',  { cardEl, index });        // rightmost leaving
  Grey.emit('market:buy',    { cardEl });               // spotlight then flyTo discard
*/
function wireAnimationListeners() {
  if (!Anims) return; // optional

  // Draw
  Grey.on('cards:drawn', e => {
    if (typeof Anims.animateDraw === 'function') {
      Anims.animateDraw(e.detail);
    }
  });

  // Discard
  Grey.on('cards:discarded', e => {
    if (typeof Anims.animateDiscard === 'function') {
      Anims.animateDiscard(e.detail);
    }
  });

  // Flow reveal (leftmost or new card)
  Grey.on('flow:reveal', e => {
    if (typeof Anims.animateFlowReveal === 'function') {
      Anims.animateFlowReveal(e.detail);
    }
  });

  // Flow falloff (rightmost)
  Grey.on('flow:falloff', e => {
    if (typeof Anims.animateFlowFalloff === 'function') {
      Anims.animateFlowFalloff(e.detail);
    }
  });

  // Market buy spotlight then fly
  Grey.on('market:buy', e => {
    if (typeof Anims.animateMarketBuy === 'function') {
      Anims.animateMarketBuy(e.detail);
    }
  });
}

/* ---------- Boot sequence ---------- */
async function boot() {
  await loadAnimations();           // optional, non-blocking
  const api = getGameAPI();

  // Initialize game logic if provided
  if (typeof api.init === 'function') {
    await api.init({ Grey });       // pass bus (optional)
  }

  // Render once
  if (typeof api.renderAll === 'function') {
    await api.renderAll();
  }

  wireHUD(api);
  if (typeof api.enableDnD === 'function') {
    api.enableDnD();
  }

  // Hook animation listeners after DOM is in place
  wireAnimationListeners();

  // First frame UI sync
  updateAetherDisplays();

  // If your logic exposes a startTurn, kick off the opener
  if (typeof api.startTurn === 'function') {
    await api.startTurn();
  }
}

/* ---------- Start on DOM ready ---------- */
document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    console.error('[Boot] Fatal error:', err);
  });
});