/**
 * index.js — v2.57 safe boot
 * - Keep HTML unchanged (only this module tag).
 * - Lazily import animations (optional); if missing, nothing breaks.
 * - No dependency on GameLogic.js.
 *
 * NOTE: This file assumes your v2.57 game logic is already in here
 * (the same way your working build was). If you previously split
 * logic into modules, keep it here or import it WITHIN this module.
 */

/* ---------------- Utilities ---------------- */
const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------- Event bus (for animations) ---------------- */
export const Grey = {
  on(type, handler, options) {
    document.addEventListener(type, handler, options);
    return () => document.removeEventListener(type, handler, options);
  },
  emit(type, detail = {}) {
    document.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
};
window.Grey = Grey; // optional global for other code in this file

/* ---------------- OPTIONAL animations (non-blocking) ---------------- */
async function loadAnimations() {
  try {
    const mod = await import('./animations.js?v=257');
    const Anims = mod?.default ?? mod;

    if (Anims?.install) Anims.install({ Grey, root: document });
    if (Anims?.autowire) Anims.autowire({ Grey });
  } catch (e) {
    // Fine if it's not there yet — animations are optional
    // console.info('[animations] not present (optional)');
  }
}

/* ---------------- The original v2.57 boot logic ----------------
   REPLACE the stubs below with your existing v2.57 functions if needed.
   If your current file already contains all of this logic, keep it as-is;
   these are just guards to ensure the board comes up.
------------------------------------------------------------------*/

/** initBoard: ensures static DOM regions render (slots, flow, etc.) */
function initBoard() {
  // If your v2.57 already renders all these, keep your code.
  // Below is a minimal guard to ensure the flow row exists & is empty.

  const flowRow = qs('#flow-row');
  if (flowRow && !flowRow.children.length) {
    // Create 6 empty flow positions so the bar is visible
    for (let i = 0; i < 6; i++) {
      const li = document.createElement('li');
      li.className = 'flow-card slot';
      li.dataset.index = i;
      li.textContent = ''; // your styling shows frame anyway
      flowRow.appendChild(li);
    }
  }
}

/** renderAll: draw both boards + hand using your existing logic */
async function renderAll() {
  // Call your actual v2.57 render functions here.
  // These stubs keep the layout alive if render is split elsewhere.
  initBoard();
}

/** startTurn: draw + any start-of-turn effects, then animate (optional) */
async function startTurn() {
  // Example: if your draw returns the drawn DOM nodes,
  // you can emit Grey.emit('cards:drawn', { cards });
}

/** endTurn: discard hand, pass priority, then animate (optional) */
async function endTurn() {
  // Emit discard animation event if your logic supports it.
  // Grey.emit('cards:discarded', { cards, target: 'discard' });
}

/* ---------------- Wire HUD (end turn) ---------------- */
function wireHUD() {
  const endBtn = qs('#btn-endturn-hud');
  if (endBtn) {
    endBtn.addEventListener('click', async () => {
      await endTurn();
      // If you auto-start AI and then your turn:
      // await aiTurn(); await startTurn();
    });
  }
}

/* ---------------- Boot ---------------- */
async function boot() {
  await renderAll();     // draw the static board
  wireHUD();             // buttons
  await loadAnimations();// optional, safe
  await startTurn();     // begin
}

/* ---------------- Start ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => console.error('[boot]', err));
});