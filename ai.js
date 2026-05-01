// ai.js
// One, small, deliberate action per call.
// Uses the api surface you exposed from UI: makeAiApi()
export async function runAiTurn(state, api) {
  const side = 'ai';
  const pub  = api.getPublic() || {};
  const me   = pub.players?.ai || {};
  const opponent = pub.players?.player || {};
  const hand = me.hand || [];
  const aether = (me.aether|0) + (me.tempAether|0);
  const opponentHp = (opponent.vitality|0);

  // Utilities
  const firstOpenSpellSlot = () => api.findFirstOpenSpellSlot(side);
  const glyphSlotOpen = () => !(pub.players?.ai?.slots?.[3]?.hasCard);

  const handByType = (t) => hand.filter(c => c?.type === t);
  const hasType    = (t) => handByType(t).length > 0;

  // Does this card's text deal damage?
  const dealsDamage = (card) => /deal.*damage/i.test(card?.text || '');

  // How urgent is damage? True when opponent is at 3 or fewer HP.
  const killMode = opponentHp <= 3;

  const getCardCost = (card) => {
    if (!card) return 0;
    if (typeof card.playCost !== 'undefined') return card.playCost;
    return typeof card.cost !== 'undefined' ? card.cost : 0;
  };

  // 0) Try to ADVANCE a spell already on the board.
  //    Ordering: free-step damage spells → free-step others → paid damage spells → paid others.
  {
    const slots = pub.players?.ai?.slots || [];

    // Collect advanceable spells with metadata
    const advanceable = [];
    for (let i = 0; i < 3; i++) {
      const s = slots[i];
      const c = s?.card;
      if (!s?.hasCard || c?.type !== 'SPELL') continue;
      if ((c.progress|0) >= (c.pip|0)) continue;
      const stepCost = (typeof c.stepCost === 'number') ? c.stepCost : 1;
      advanceable.push({ i, c, stepCost, dmg: dealsDamage(c) });
    }

    // Sort: free-step damage first, free-step others second, paid damage third, paid others last
    advanceable.sort((a, b) => {
      const aFree = a.stepCost === 0 ? 1 : 0;
      const bFree = b.stepCost === 0 ? 1 : 0;
      if (aFree !== bFree) return bFree - aFree;
      if (a.dmg !== b.dmg) return (b.dmg ? 1 : 0) - (a.dmg ? 1 : 0);
      return 0;
    });

    for (const { i, stepCost } of advanceable) {
      if (stepCost === 0 || api.canPay(side, stepCost)) {
        if (api.advanceSpellOne) { api.advanceSpellOne(side, i); return state; }
        if (api.payAndAdvanceOne) { api.payAndAdvanceOne(side, i); return state; }
      }
    }
  }

  // 1) CAST an Instant. In kill mode or when instants deal damage, prioritize those.
  {
    const instants = handByType('INSTANT').filter(c => api.canPay(side, getCardCost(c)));
    if (instants.length) {
      // Sort: damage instants first (especially when opponent is low), then by cost
      instants.sort((a, b) => {
        const aDmg = dealsDamage(a) ? 1 : 0;
        const bDmg = dealsDamage(b) ? 1 : 0;
        if (aDmg !== bDmg) return bDmg - aDmg;
        return (getCardCost(a)) - (getCardCost(b));
      });
      const inst = killMode
        ? (instants.find(c => dealsDamage(c)) || instants[0])
        : instants[0];
      if (inst) {
        await api.castInstantFromHand(side, inst.id);
        return state;
      }
    }
  }

  // 2) SET a Glyph if the slot is empty and we have one
  if (glyphSlotOpen() && hasType('GLYPH')) {
    const g = handByType('GLYPH')[0];
    api.setGlyphFromHand(side, g.id);
    return state;
  }

  // 3) PLAY a Spell if there's an open slot.
  //    In kill mode prefer damage spells; otherwise prefer cheaper spells.
  {
    const slot = firstOpenSpellSlot();
    if (slot >= 0) {
      const spells = handByType('SPELL')
        .filter(c => api.canPay(side, getCardCost(c)))
        .sort((a, b) => {
          if (killMode) {
            // In kill mode: damage spells first, then cheapest
            const aDmg = dealsDamage(a) ? 1 : 0;
            const bDmg = dealsDamage(b) ? 1 : 0;
            if (aDmg !== bDmg) return bDmg - aDmg;
          }
          return getCardCost(a) - getCardCost(b) || (a.pip|0) - (b.pip|0);
        });
      for (const s of spells) {
        try {
          api.playSpellFromHand(side, s.id, slot);
          return state;
        } catch { /* try next */ }
      }
    }
  }

  // 4) BUY from Flow — prioritise damage cards; in kill mode they get a large bonus.
  {
    const prices = [4, 3, 2, 2, 2];
    const flow = (pub.flow || []).slice(0, 5);

    const wantGlyph = glyphSlotOpen();
    const scored = flow.map((c, i) => {
      if (!c) return null;
      const price = prices[i] || 0;
      if (aether < price) return null;
      let score = 0;
      if (wantGlyph && c.type === 'GLYPH') score += 100;
      if (c.type === 'SPELL')   score += 60 - (getCardCost(c))*2 - (c.pip|0);
      if (c.type === 'INSTANT') score += 40 - (getCardCost(c));
      // Damage cards get a significant bonus; even larger when in kill mode
      if (dealsDamage(c)) score += killMode ? 60 : 35;
      score += (10 - price);
      return { idx: i, price, score };
    }).filter(Boolean);

    if (scored.length) {
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];
      api.buyFromFlowIndex(side, pick.idx, pick.price);
      return state;
    }
  }

  // 5) CHANNEL a card for aether — prefer cards that are NOT damage dealers
  //    (don't sacrifice our win condition for a little ramp).
  {
    // Separate hand into damage-dealing cards and others
    const nonDamage = hand.filter(c => !dealsDamage(c) && (c.aetherValue|0) > 0)
      .sort((a, b) => (a.aetherValue|0) - (b.aetherValue|0));
    const damageCards = hand.filter(c => dealsDamage(c) && (c.aetherValue|0) > 0)
      .sort((a, b) => (a.aetherValue|0) - (b.aetherValue|0));

    // Channel non-damage cards first; only channel damage cards if nothing else available
    const toChannel = nonDamage.length ? nonDamage[0] : damageCards[0];
    if (toChannel) {
      api.channelFromHand(side, toChannel.id);
      return state;
    }
  }

  // 6) Last resort: discard a low-impact card to thin the deck
  {
    const glyphSlotIsOpen = () => !(pub.players?.ai?.slots?.[3]?.hasCard);
    const undesirable = hand
      .filter(c => !(c.type === 'GLYPH' && glyphSlotIsOpen()))
      .filter(c => !dealsDamage(c) || killMode) // keep damage cards unless desperate
      .sort((a, b) => {
        const av = (a.aetherValue | 0) - (b.aetherValue | 0);
        if (av !== 0) return av;
        const pc = (b.playCost | 0) - (a.playCost | 0);
        if (pc !== 0) return pc;
        const rank = (x) => x.type === 'INSTANT' ? 1 : (x.type === 'SPELL' ? 2 : 3);
        return rank(a) - rank(b);
      });
    const pick = undesirable[0];
    if (pick) {
      api.channelFromHand(side, pick.id);
      return state;
    }
  }

  // 7) Nothing to do → no-op (ends the AI's action loop)
  return state;
}
