// /assets/js/boot-debug.js — no automatic seeding; optional demo via ?demo=1
(function () {
  if (!window.game) return;
  const game = window.game;

  const draw = (n = 1) => game.dispatch({ type: 'DRAW', amount: n });
  const end  = ()      => game.dispatch({ type: 'END_TURN' });
  const rst  = ()      => game.reset?.();

  window.debug = Object.freeze({ draw, end, reset: rst, game });

  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') demoFillAetherflowOnce();

  function demoFillAetherflowOnce() {
    const s = game.state;
    if (!s) return;
    if (s.flowRow.some(Boolean)) return;           // don’t double-seed
    for (let i = 0; i < s.flowRow.length; i++) {
      s.flowRow[i] = s.flowDeck.shift() ?? null;
    }
    game._emit?.();
  }

  console.log('[BRIDGE] boot-debug ready');
})();
