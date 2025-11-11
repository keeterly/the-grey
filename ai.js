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

  // 0) Try to ADVANCE a pip already on board.
  //    (a) First, advance any FREE step (stepCost === 0).
  //    (b) If none are free, advance one we can afford.
  {
    const slots = pub.players?.ai?.slots || [];
    // (a) Free steps first
    for (let i = 0; i < 3; i++) {
      const s = slots[i];
      const c = s?.card;
      if (!s?.hasCard || c?.type !== 'SPELL') continue;
      if ((c.progress|0) >= (c.pip|0)) continue;
      const stepCost = (typeof c.stepCost === 'number') ? c.stepCost : 1;
      if (stepCost === 0) {
        if (api.advanceSpellOne) { api.advanceSpellOne(side, i); return state; }
        if (api.payAndAdvanceOne) { api.payAndAdvanceOne(side, i); return state; }
        if (typeof window.advanceSpell === 'function') { window.advanceSpell('ai', i); return state; }
      }
    }
    // (b) Paid steps if we can afford them
    for (let i = 0; i < 3; i++) {
      const s = slots[i];
      const c = s?.card;
      if (!s?.hasCard || c?.type !== 'SPELL') continue;
      if ((c.progress|0) >= (c.pip|0)) continue;
      const stepCost = (typeof c.stepCost === 'number') ? c.stepCost : 1;
      if (!api.canPay || api.canPay(side, stepCost)) {
        if (api.advanceSpellOne) { api.advanceSpellOne(side, i); return state; }
        if (api.payAndAdvanceOne) { api.payAndAdvanceOne(side, i); return state; }
        if (typeof window.advanceSpell === 'function') { window.advanceSpell('ai', i); return state; }
      }
    }
  }

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

  // 6) As a last resort, discard or channel one low-impact card to improve next draw
  {
    // Build a list of undesirable cards: avoid discarding a Glyph if no glyph is set
   const glyphSlotIsOpen = () => !(pub.players?.ai?.slots?.[3]?.hasCard);
    const undesirable = hand
      .filter(c => !(c.type === 'GLYPH' && glyphSlotIsOpen()))
      .sort((a, b) => {
        // Lowest aetherValue first
        const av = (a.aetherValue | 0) - (b.aetherValue | 0);
        if (av !== 0) return av;
        // Highest playCost first (discard expensive spells first)
        const pc = (b.playCost | 0) - (a.playCost | 0);
        if (pc !== 0) return pc;
        // Type rank: prefer discarding Instants first, then Spells, then Glyphs
        const rank = (x) => x.type === 'INSTANT' ? 1 : (x.type === 'SPELL' ? 2 : 3);
        return rank(a) - rank(b);
      });
    const pick = undesirable[0];
    if (pick) {
      // Use channelFromHand even if aetherValue is 0; this still discards the card
      api.channelFromHand(side, pick.id);
      return state;
    }
  }

  // 7) Nothing to do → no-op (ends the AI’s action loop)
  return state;
}
