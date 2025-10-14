/**
 * index.js — v2.571 harness
 * - Leaves your game logic untouched (GameLogic.js etc.)
 * - Ensures a tiny global bus (window.Grey) for opt-in animations
 * - Loads animations.js once
 */

(() => {
  // ---------- Event bus (idempotent) ----------
  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on = (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    };
    const off = (name, fn) => listeners.get(name)?.delete(fn);
    const emit = (name, detail) => {
      (listeners.get(name) || []).forEach(fn => {
        try { fn(detail); } catch (e) { console.error('[Grey handler error]', name, e); }
      });
    };
    const safeEmit = (name, detail) => {
      try { emit(name, detail); } catch (e) { /* no-op */ }
    };
    const bus = { on, off, emit, safeEmit };
    window.Grey = bus;
    return bus;
  })();

  // ---------- Import animations once ----------
  async function loadAnimationsOnce() {
    if (window.__greyAnimationsLoaded__) return;
    try {
      await import('./animations.js');
    } catch (e) {
      // If module import fails (older bundlers), fall back to dynamic script
      console.warn('[Grey] module import failed, trying script fallback', e);
      await new Promise(res => {
        const s = document.createElement('script');
        s.src = './animations.js';
        s.type = 'module';
        s.onload = res;
        s.onerror = () => { console.warn('[Grey] animations fallback failed'); res(); };
        document.head.appendChild(s);
      });
    }
  }

  // ---------- Boot once DOM is ready ----------
  document.addEventListener('DOMContentLoaded', async () => {
    await loadAnimationsOnce();

    // At this point your existing game setup (from GameLogic.js / other files) should already
    // be running, because index.html includes those before index.js or alongside it.

    // Optional example wiring (commented out):
    // If, during your draw step, you want to trigger a subtle draw animation for cards that
    // were just added to the hand, you can do:
    //
    // const justDrawn = Array.from(document.querySelectorAll('#hand .card'))
    //   .slice(-n); // if you know how many were drawn
    // Grey.safeEmit('cards:drawn', { nodes: justDrawn });

    // Similarly, when revealing the leftmost Aetherflow card:
    // Grey.safeEmit('aetherflow:reveal', { node: document.querySelector('#flow-row .card') });
    //
    // When the rightmost Flow card leaves the board at end of turn:
    // Grey.safeEmit('aetherflow:falloff', { node: rightMostCardEl });
    //
    // When buying a card from Flow:
    // Grey.safeEmit('aetherflow:bought', { node: boughtCardEl });
  });
})();