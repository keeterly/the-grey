// /src/boot-debug.js — debug helpers only; no automatic seeding

(function(){
  if (!window.game) {
    console.warn('[BRIDGE] boot-debug loaded before game exists');
    return;
  }
  const game = window.game;

  // ------- Debug helpers (kept from your previous workflow) -------
  const draw = (n=1) => game.dispatch({ type: 'DRAW', amount: n });
  const end  = ()    => game.dispatch({ type: 'END_TURN' });
  const rst  = ()    => game.reset();

  // Expose to console
  window.debug = Object.freeze({ draw, end, reset: rst, game });

  // ------- OPTIONAL: demo seeding, gated by URL flag -------
  // Use: https://…/the-grey/?demo=1 to see seeded boards once.
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') {
    try {
      seedDemoOnce(game);
      console.log('[BRIDGE] Demo layout seeded (one-time). Remove ?demo=1 to boot clean.');
    } catch (err) {
      console.warn('[BRIDGE] seedDemoOnce failed:', err);
    }
  }

  // NOTE: This function is **never** called unless ?demo=1 is present.
  function seedDemoOnce(game){
    const s = game.state;

    // Only seed if completely empty (avoid clobbering live state)
    if (Array.isArray(s.slots) && s.slots.some(Boolean)) return;
    if (Array.isArray(s.ai?.slots) && s.ai.slots.some(Boolean)) return;

    // Pull a few cards from the existing deck for a quick visual demo
    const take = (k=3) => {
      const out = [];
      while (k-- > 0 && s.deck.length) out.push(s.deck.shift());
      return out;
    };

    // Put 3 empties for player/AI but show a card in Aetherflow to visualize row
    // If you actually want to seed a card into a slot for the demo:
    // s.slots[1] = take(1)[0];
    // s.ai.slots[1] = take(1)[0];

    // Aetherflow: show up to 5 cards from flowDeck if available
    if (Array.isArray(s.flowRow) && s.flowRow.every(v => v == null)) {
      for (let i = 0; i < s.flowRow.length; i++) {
        s.flowRow[i] = s.flowDeck.shift() ?? null;
      }
    }

    // Force a re-render after manual mutation
    game._emit();
  }

  console.log('[BRIDGE] Drag bridge init');
})();
