// ai.js
// One, small, deliberate action per call.
// Uses the api surface you exposed from UI: makeAiApi()
export async function runAiTurn(state, api) {
  const side = 'ai';
  const pub  = api.getPublic() || {};
  const me   = pub.players?.ai || {};
  const hand = me.hand || [];
  const aether = (me.aether|0) + (me.tempAether|0);

  // Utilities
  const firstOpenSpellSlot = () => api.findFirstOpenSpellSlot(side);
  const glyphSlotOpen = () => !(pub.players?.ai?.slots?.[3]?.hasCard);

  const handByType = (t) => hand.filter(c => c?.type === t);
  const hasType    = (t) => handByType(t).length > 0;

  // Helper to determine how much a card costs to play.  Many cards in v2.66
  // separate their playCost (the cost to put the card into play) from
  // stepCost (the cost to advance a spell).  Use playCost when deciding
  // whether the AI can afford a card.  If playCost is undefined, fall
  // back to the legacy cost property if present.
  const getCardCost = (card) => {
    if (!card) return 0;
    if (typeof card.playCost !== 'undefined') {
      return card.playCost;
    }
    return typeof card.cost !== 'undefined' ? card.cost : 0;
  };

  // 0) If we can cheaply advance an AI spell on board, do that (optional polish).
  //    (This keeps pressure without needing extra smarts.)
  try {
    const slots = pub.players?.ai?.slots || [];
    for (let i = 0; i < 3; i++) {
      const slot = slots[i];
      const c = slot?.card;
      if (slot?.hasCard && c?.type === 'SPELL') {
        // Spend 1 if we have it — your wrapped play handles discounts elsewhere
        if (aether >= 1 && (c.progress|0) < (c.pip|0)) {
          // Let GameLogic handle the actual advance via UI wrapper:
          // we don't have a direct "advance" helper on api, so skip if missing.
          if (typeof window.advanceSpell === 'function') {
            window.advanceSpell('ai', i, 1);
            return state;
          }
        }
      }
    }
  } catch {}

  // 1) CAST an Instant if we can afford one (fast tempo plays)
  {
    const inst = handByType('INSTANT')
      .find(c => api.canPay(side, getCardCost(c))); // wrapper applies temp/perm in helper
    if (inst) {
      await api.castInstantFromHand(side, inst.id);
      return state;
    }
  }

  // 2) SET a Glyph if the slot is empty and we have one
  if (glyphSlotOpen() && hasType('GLYPH')) {
    const g = handByType('GLYPH')[0];
    api.setGlyphFromHand(side, g.id);
    return state;
  }

  // 3) PLAY a Spell if there’s an open slot
  {
    const slot = firstOpenSpellSlot();
    if (slot >= 0) {
      // Prefer cheaper spells / ones with lower pip costs to get on board
      const spells = handByType('SPELL')
        .sort((a, b) => getCardCost(a) - getCardCost(b) || (a.pip|0) - (b.pip|0));
      for (const s of spells) {
        // Your wrapped player helper handles trance discount + temp first.
        try {
          // Only attempt to play the spell if we can afford its play cost.
          if (api.canPay(side, getCardCost(s))) {
            api.playSpellFromHand(side, s.id, slot);
            return state;
          }
        } catch { /* try next */ }
      }
    }
  }

  // 4) BUY from Flow if we can afford something useful (goes to AI discard)
  //    Preference: a glyph if we don’t have one set → cheap spell → anything affordable.
  {
    const prices = [4, 3, 2, 2, 2];
    const flow = (pub.flow || []).slice(0, 5);

    // Build a desirability score
    const wantGlyph = glyphSlotOpen();
    const scored = flow.map((c, i) => {
      if (!c) return null;
      const price = prices[i] || 0;
      const afford = aether >= price;
      if (!afford) return null;
      let score = 0;
      if (wantGlyph && c.type === 'GLYPH') score += 100;
      if (c.type === 'SPELL') score += 60 - (getCardCost(c))*2 - (c.pip|0);
      if (c.type === 'INSTANT') score += 40 - (getCardCost(c));
      // tiny bias for cheaper options
      score += (10 - price);
      return { idx: i, price, score };
    }).filter(Boolean);

    if (scored.length) {
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];
      api.buyFromFlowIndex(side, pick.idx, pick.price); // → goes to AI discard
      return state;
    }
  }

  // 5) CHANNEL a card if we’re stuck (prefer lowest-value channel)
  {
    const channelable = hand.filter(c => (c.aetherValue|0) > 0)
      .sort((a,b)=> (a.aetherValue|0) - (b.aetherValue|0));
    if (channelable.length) {
      api.channelFromHand(side, channelable[0].id);
      return state;
    }
  }

  // 6) Nothing to do → no-op (ends the AI’s action loop in your TURN_START handler)
  return state;
}
