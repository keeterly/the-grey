// boot-debug.js — tiny boot strap + on-screen diagnostics
(() => {
  'use strict';

  function badge(ok) {
    return ok ? '✅' : '❌';
  }

  function showPanel(state) {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed; right: 12px; bottom: 12px; z-index: 9999;
      font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: rgba(0,0,0,.75); color: #fff; padding: 10px 12px; border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); max-width: 320px;
    `;
    panel.innerHTML = `
      <div style="opacity:.85;margin-bottom:6px">THE GREY • Boot Check</div>
      <div>${badge(state.hasEngine)} Engine script</div>
      <div>${badge(state.hasUI)} UI script</div>
      <div>${badge(state.hasDrag)} Drag script</div>
      <div>${badge(state.hasDispatch)} game.dispatch()</div>
      <div>${badge(state.didStart)} Start fired</div>
      ${state.error ? `<div style="color:#ff9a9a;margin-top:6px">Error: ${state.error}</div>` : ''}
    `;
    document.body.appendChild(panel);
    setTimeout(() => panel.remove(), 6000);
  }

  function wireHUD(game) {
    const $ = (id) => document.getElementById(id);
    const map = [
      ['fabDraw',  { type: 'DRAW' }],
      ['fabEnd',   { type: 'END_TURN' }],
      ['fabReset', { type: 'RESET' }],
    ];
    map.forEach(([id, action]) => {
      const el = $(id);
      if (!el) return;
      el.onclick = () => {
        try { game.dispatch(action); }
        catch (e) { console.error('[BOOT] dispatch failed', action, e); }
      };
    });
  }

  function start() {
    const state = {
      hasEngine: !!(window.game || window.Game || window.createGame || window.GameEngine),
      hasUI: !!(window.UI || window.UX || window.render || window.AppUI),
      hasDrag: !!(window.DragCards && typeof window.DragCards.init === 'function'),
      hasDispatch: false,
      didStart: false,
      error: null
    };

    try {
      // find/create the game instance from common patterns
      let g = window.game;
      if (!g && window.Game && typeof window.Game.create === 'function') g = window.Game.create();
      if (!g && typeof window.createGame === 'function') g = window.createGame();
      if (!g && window.GameEngine && typeof window.GameEngine.create === 'function') g = window.GameEngine.create();

      if (g) window.game = g;
      state.hasDispatch = !!(g && typeof g.dispatch === 'function');

      // init UI if present
      if (state.hasUI) {
        if (window.UI && typeof window.UI.init === 'function') window.UI.init(g);
        else if (typeof window.render === 'function') window.render(g);
        else if (window.UX && typeof window.UX.mount === 'function') window.UX.mount(g);
      }

      // init drag
      if (state.hasDrag) window.DragCards.init(document);

      // kick the game (common action names)
      if (state.hasDispatch) {
        try { g.dispatch({ type: 'RESET' }); } catch {}
        try { g.dispatch({ type: 'START_GAME' }); } catch {}
        try { g.dispatch({ type: 'START_TURN' }); } catch {}
        state.didStart = true;
      } else {
        state.error = 'Game engine found but no dispatch() method. Include mechanics script or export game.';
      }
    } catch (e) {
      console.error('[BOOT]', e);
      state.error = e.message || String(e);
    }

    showPanel(state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
