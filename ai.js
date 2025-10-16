// ai.js — very simple baseline AI so you can start playtesting.
// Heuristics (in order):
// 1) Cast any affordable Instant with positive effect (cost ≤ aether+temp).
// 2) Play an affordable Spell into first open slot.
// 3) Channel a card with aetherValue>0 if it improves buy options or casting.
// 4) Buy the leftmost affordable Aetherflow card.
// 5) End turn.

export async function runAiTurn(state, api) {
  // api is a very small surface we expect from index.js
  // {
  //   getPublic(), getSideState(side),
  //   findFirstOpenSpellSlot(side),
  //   canPay(side, cost), pay(side, cost),
  //   playSpellFromHand(side, cardId, slotIndex),
  //   setGlyphFromHand(side, cardId),
  //   castInstantFromHand(side, cardId),
  //   channelFromHand(side, cardId),
  //   buyFromFlowIndex(side, idx, priceAtPos),
  //   flowPriceAt(idx),
  // }

  const side = "ai";
  const pub  = api.getPublic();
  const me   = api.getSideState(side);
  const hand = (me.hand || []).slice();

  // Utility
  const totalAe = () => (me.aether|0) + (me.tempAether|0);
  const openSlot = api.findFirstOpenSpellSlot(side);

  // 1) Cast any Instant we can afford
  for (const c of hand) {
    if (c.type === "INSTANT" && (c.cost|0) <= totalAe()) {
      try { state = await api.castInstantFromHand(side, c.id); return state; } catch {}
    }
  }

  // 2) Play an affordable Spell into first open slot
  if (openSlot >= 0) {
    for (const c of hand) {
      if (c.type === "SPELL" && (c.cost|0) <= totalAe()) {
        try { state = api.playSpellFromHand(side, c.id, openSlot); return state; } catch {}
      }
    }
  }

  // 3) Channel if it helps meet a cost threshold (prefer highest aetherValue)
  const chan = hand.filter(c => (c.aetherValue|0) > 0)
                   .sort((a,b)=> (b.aetherValue|0) - (a.aetherValue|0))[0];
  if (chan) {
    try { state = api.channelFromHand(side, chan.id); return state; } catch {}
  }

  // 4) Buy the leftmost affordable Flow card
  const flow = (pub.flow || []).slice(0,5);
  for (let i=0;i<flow.length;i++){
    const c = flow[i]; if (!c) continue;
    const price = api.flowPriceAt(i);
    if (price <= totalAe()) {
      try { state = api.buyFromFlowIndex(side, i, price); return state; } catch {}
    }
  }

  // 5) Nothing to do
  return state;
}
