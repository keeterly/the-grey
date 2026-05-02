// ai.js — Strategic AI Decision Engine
// One deliberate action per call, board-state aware.
export async function runAiTurn(state, api) {
  const side = 'ai';
  const pub  = api.getPublic() || {};
  const me   = pub.players?.ai    || {};
  const opp  = pub.players?.player || {};
  const hand  = me.hand  || [];
  const aether = (me.aether|0) + (me.tempAether|0);
  const opponentHp = (opp.vitality|0);
  const myHp       = (me.vitality|0);

  // ── Board Assessment ──────────────────────────────────────────
  const oppSlots = (opp.slots || []).slice(0, 3);
  const oppSpells = oppSlots.filter(s => s?.hasCard && s?.card?.type === 'SPELL');
  // Opponent spells one step from resolving are immediate threats
  const immediateThreats = oppSpells.filter(s => {
    const c = s.card;
    return (c.progress|0) >= (c.pip|0) - 1;
  });

  // Win condition progress (thresholds: confluence=5, dominion=10)
  const myFlowCards  = (me.flowCardsAcquired  | 0);
  const myEssence    = (me.greyEssence        | 0);
  const oppFlowCards = (opp.flowCardsAcquired | 0);
  const oppEssence   = (opp.greyEssence       | 0);
  const oppNearConfluence = oppFlowCards >= 4;   // one buy from winning
  const oppNearDominion   = oppEssence   >= 8;   // one or two channels from winning
  const myNearConfluence  = myFlowCards  >= 4;
  const myNearDominion    = myEssence    >= 8;

  // ── Urgency Tiers ─────────────────────────────────────────────
  // 3 = desperate  2 = kill mode  1 = elevated  0 = normal
  const urgencyLevel =
    (opponentHp <= 4 || myHp <= 3 || immediateThreats.length >= 2 || oppNearConfluence || oppNearDominion) ? 3 :
    (opponentHp <= 6 || (immediateThreats.length >= 1 && myHp <= 5)) ? 2 :
    (opponentHp <= 8 || immediateThreats.length >= 1 || myHp <= 5) ? 1 :
    0;
  const killMode = urgencyLevel >= 2;

  // ── Utilities ─────────────────────────────────────────────────
  const firstOpenSpellSlot = () => api.findFirstOpenSpellSlot(side);
  const glyphSlotOpen = () => !(pub.players?.ai?.slots?.[3]?.hasCard);

  const handByType = (t) => hand.filter(c => c?.type === t);
  const hasType    = (t) => handByType(t).length > 0;

  const dealsDamage       = (c) => /deal.*damage/i.test(c?.text || '');
  const hasHexText        = (c) => /hex/i.test(c?.text || '');
  const hasDrawText       = (c) => /draw/i.test(c?.text || '');
  const drainsEssence     = (c) => /reduce.*essence/i.test(c?.text || '');
  const drainsConfluence  = (c) => /reduce.*confluence/i.test(c?.text || '');

  const getCardCost = (c) => {
    if (!c) return 0;
    if (typeof c.playCost !== 'undefined') return c.playCost;
    return typeof c.cost !== 'undefined' ? c.cost : 0;
  };

  // ── 0) ADVANCE a spell already on the board ───────────────────
  {
    const slots = pub.players?.ai?.slots || [];
    const advanceable = [];
    for (let i = 0; i < 3; i++) {
      const s = slots[i];
      const c = s?.card;
      if (!s?.hasCard || c?.type !== 'SPELL') continue;
      if ((c.progress|0) >= (c.pip|0)) continue;
      const rawCost    = (typeof c.stepCost === 'number') ? c.stepCost : 1;
      const hexPenalty = s.hex ? 2 : 0;
      const effectiveCost = rawCost + hexPenalty;
      const stepsLeft  = (c.pip|0) - (c.progress|0);
      advanceable.push({ i, c, stepCost: effectiveCost, dmg: dealsDamage(c), stepsLeft });
    }

    // Free+damage > free > paid+damage (kill) > closest to resolving
    advanceable.sort((a, b) => {
      const aFree = a.stepCost === 0 ? 1 : 0;
      const bFree = b.stepCost === 0 ? 1 : 0;
      if (aFree !== bFree) return bFree - aFree;
      if (killMode && a.dmg !== b.dmg) return (b.dmg ? 1 : 0) - (a.dmg ? 1 : 0);
      return a.stepsLeft - b.stepsLeft;
    });

    for (const { i, stepCost } of advanceable) {
      if (stepCost === 0 || api.canPay(side, stepCost)) {
        if (api.advanceSpellOne)  { api.advanceSpellOne(side, i);  return state; }
        if (api.payAndAdvanceOne) { api.payAndAdvanceOne(side, i); return state; }
      }
    }
  }

  // ── 1) CAST an Instant ────────────────────────────────────────
  {
    const instants = handByType('INSTANT').filter(c => api.canPay(side, getCardCost(c)));
    if (instants.length) {
      instants.sort((a, b) => {
        const aDmg = dealsDamage(a) ? 1 : 0;
        const bDmg = dealsDamage(b) ? 1 : 0;
        if (aDmg !== bDmg) return bDmg - aDmg;
        return getCardCost(a) - getCardCost(b);
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

  // ── 2) SET a Glyph (skip when desperate — no time for setup) ──
  if (urgencyLevel < 3 && glyphSlotOpen() && hasType('GLYPH')) {
    const g = handByType('GLYPH')[0];
    api.setGlyphFromHand(side, g.id);
    return state;
  }

  // ── 3) PLAY a Spell ───────────────────────────────────────────
  {
    const slot = firstOpenSpellSlot();
    if (slot >= 0) {
      const spells = handByType('SPELL')
        .filter(c => api.canPay(side, getCardCost(c)))
        .sort((a, b) => {
          if (killMode) {
            const aDmg = dealsDamage(a) ? 1 : 0;
            const bDmg = dealsDamage(b) ? 1 : 0;
            if (aDmg !== bDmg) return bDmg - aDmg;
          }
          return getCardCost(a) - getCardCost(b) || (a.pip|0) - (b.pip|0);
        });
      for (const s of spells) {
        try { api.playSpellFromHand(side, s.id, slot); return state; } catch { /* try next */ }
      }
    }
  }

  // ── 4) BUY from Flow ──────────────────────────────────────────
  {
    const prices  = [4, 3, 2, 2, 2];
    const flow    = (pub.flow || []).slice(0, 5);
    const wantGlyph = glyphSlotOpen() && urgencyLevel < 2;

    const scored = flow.map((c, i) => {
      if (!c) return null;
      const price = prices[i] || 0;
      if (aether < price) return null;
      let score = 0;

      if (wantGlyph && c.type === 'GLYPH') score += 80;
      if (c.type === 'SPELL')    score += 50 - (getCardCost(c)) * 2 - (c.pip|0);
      if (c.type === 'INSTANT')  score += 35 - getCardCost(c);
      if (c.type === 'REACTION') score += 20;

      if (dealsDamage(c)) {
        score += urgencyLevel === 3 ? 80 :
                 urgencyLevel === 2 ? 60 :
                 urgencyLevel === 1 ? 40 : 20;
      }

      // Board presence / control
      if (oppSpells.length >= 1 && hasHexText(c))        score += 30;
      if (immediateThreats.length >= 1 && hasHexText(c)) score += 20;

      // Win condition disruption — critical when opponent is one step from winning
      if (drainsEssence(c)    && oppNearDominion)   score += 80;
      if (drainsConfluence(c) && oppNearConfluence) score += 80;
      if (drainsEssence(c)    && oppEssence >= 6)   score += 30;
      if (drainsConfluence(c) && oppFlowCards >= 3) score += 30;

      // Race our own win conditions: bonus for buying when we're close
      if (myNearConfluence) score += 20; // any buy advances Confluence
      if (myNearDominion && c.aetherValue > 0) score += 15; // cards we can channel

      // Card draw when hand is low
      if (hand.length <= 2 && hasDrawText(c)) score += 30;

      score += (8 - price);
      score += (Math.random() * 8) - 4; // small noise to prevent identical play each game
      return { idx: i, price, score };
    }).filter(Boolean);

    if (scored.length) {
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];
      api.buyFromFlowIndex(side, pick.idx, pick.price);
      return state;
    }
  }

  // ── 5) CHANNEL for aether / Dominion progress ────────────────
  // When racing Dominion, channel ANY card with aetherValue (highest first for fastest progress).
  // Otherwise preserve damage cards in elevated/kill mode.
  {
    const channelable = hand.filter(c => (c.aetherValue|0) > 0);
    if (myNearDominion && channelable.length) {
      // Racing Dominion: channel highest-value card (non-damage preferred, damage if needed)
      const sorted = channelable.sort((a, b) => (b.aetherValue|0) - (a.aetherValue|0));
      const pick = sorted.find(c => !dealsDamage(c)) || (urgencyLevel < 2 ? sorted[0] : null);
      if (pick) { api.channelFromHand(side, pick.id); return state; }
    }

    const nonDamage = hand
      .filter(c => !dealsDamage(c) && (c.aetherValue|0) > 0)
      .sort((a, b) => (a.aetherValue|0) - (b.aetherValue|0));
    const damageCards = hand
      .filter(c => dealsDamage(c) && (c.aetherValue|0) > 0)
      .sort((a, b) => (a.aetherValue|0) - (b.aetherValue|0));

    const toChannel = nonDamage.length ? nonDamage[0] : (urgencyLevel === 0 ? damageCards[0] : null);
    if (toChannel) { api.channelFromHand(side, toChannel.id); return state; }
  }

  // ── 6) Last resort: discard to thin hand ─────────────────────
  {
    const glyphIsOpen = () => !(pub.players?.ai?.slots?.[3]?.hasCard);
    const undesirable = hand
      .filter(c => !(c.type === 'GLYPH' && glyphIsOpen()))
      .filter(c => !dealsDamage(c) || urgencyLevel >= 3)
      .sort((a, b) => {
        const av = (a.aetherValue|0) - (b.aetherValue|0);
        if (av !== 0) return av;
        return (b.playCost|0) - (a.playCost|0);
      });
    const pick = undesirable[0];
    if (pick) { api.channelFromHand(side, pick.id); return state; }
  }

  // ── 7) No-op → ends the AI action loop ───────────────────────
  return state;
}
