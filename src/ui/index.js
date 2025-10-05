// =========================================================
// THE GREY — UI ENTRY (no engine imports)
// ---------------------------------------------------------
// Exports: init(game)
//  - Wires HUD buttons
//  - Sets up basic counters
//  - Leaves rendering/animations to render.js etc. (optional)
// =========================================================

export function init(game) {
  const $ = (id) => document.getElementById(id);

  // --- HUD counters (safe defaults) ---
  const state = (game && game.state) || {};
  const hp  = state.playerHP ?? 0;
  const ae  = state.playerAE ?? 0;
  const aiH = state.aiHP     ?? 0;
  const aiA = state.aiAE     ?? 0;

  const setText = (el, v) => { if (el) el.textContent = String(v); };

  setText($('hpValue'), hp);
  setText($('aeValue'), ae);
  setText($('aiHpValue'), aiH);
  setText($('aiAeValue'), aiA);

  // --- Trance bars (placeholder fill to 0) ---
  const fillWidth = (el, n, d) => { if (el) el.style.width = `${(100 * (n ?? 0)) / (d || 1)}%`; };
  fillWidth($('youTranceFill'), state.youTrance ?? 0, 6);
  fillWidth($('aiTranceFill'),  state.aiTrance  ?? 0, 6);
  setText($('youTranceCount'), `${state.youTrance ?? 0}/6`);
  setText($('aiTranceCount'),  `${state.aiTrance  ?? 0}/6`);

  // --- Wire FABs to game.dispatch (non-blocking, guarded) ---
  const safeDispatch = (type, payload) => {
    try {
      if (game && typeof game.dispatch === 'function') {
        game.dispatch({ type, ...(payload || {}) });
      } else {
        console.warn('[UI] dispatch unavailable for', type);
      }
    } catch (e) {
      console.error('[UI] dispatch error for', type, e);
    }
  };

  const map = [
    ['fabDraw',  'DRAW'],
    ['fabEnd',   'END_TURN'],
    ['fabReset', 'RESET'],
  ];
  map.forEach(([id, type]) => {
    const el = $(id);
    if (el) el.onclick = () => safeDispatch(type);
  });

  // --- Optional: expose simple inspect dialog wiring later ---
  const closeBtn = $('btnInspectClose');
  if (closeBtn) closeBtn.onclick = () => {
    const dlg = document.getElementById('inspect');
    if (dlg) dlg.classList.remove('show');
  };

  // --- Log that UI mounted ---
  console.log('[UI] init complete. HUD wired.');
}

// Optional global for legacy code paths (harmless)
if (typeof window !== 'undefined') {
  window.UI = window.UI || {};
  window.UI.init = window.UI.init || init;
}
