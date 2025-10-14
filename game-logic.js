// The Grey v2.55 — synced decks from newest GameLogic.
// FLOW costs 4,3,3,2,2 (river, left→right).

const FLOW_COSTS = [4,3,3,2,2];
const mk = (id,name,type,{cost=0,pip=0,text="",aetherValue=0}={}) =>
  ({ id,name,type,cost,pip,text,aetherValue });

const Game = (() => {
  /* Base Deck (shared) */
  function makeBaseDeck(){
    const D = [];
    D.push(...Array.from({length:3},(_,k)=> mk(`bd_pulse_${k+1}`,"Pulse of the Grey","SPELL",{pip:1, text:"On Resolve: Draw 1, gain Æ", aetherValue:0})));
    D.push( mk("bd_wisp","Wispform Surge","SPELL",{pip:1, text:"On Resolve: Advance another Spell 1 (free)", aetherValue:0}) );
    D.push( mk("bd_bloom","Greyfire Bloom","SPELL",{cost:1,pip:1, text:"On Resolve: Advance another Spell 1 (free)", aetherValue:0}) );
    D.push(...Array.from({length:2},(_,k)=> mk(`bd_echo_${k+1}`,"Echoing Reservoir","SPELL",{pip:1, text:"On Resolve: Channel 1", aetherValue:2})));
    D.push( mk("bd_dorm","Dormant Catalyst","SPELL",{pip:1, text:"On Resolve: Channel 2", aetherValue:1}) );
    D.push( mk("bd_ash","Ashen Focus","SPELL",{pip:1, text:"On Resolve: Channel 1 and Draw 1", aetherValue:1}) );
    D.push( mk("bd_surge","Surge of Ash","INSTANT",{cost:1, text:"Target Spell advances 1 step (free)"}));
    D.push( mk("bd_veil","Veil of Dust","INSTANT",{cost:1, text:"Prevent 1 damage or negate a hostile Instant"}));
    D.push( mk("bd_glyph_light","Glyph of Remnant Light","GLYPH",{text:"When a Spell resolves → gain Æ"}));
    D.push( mk("bd_glyph_echo","Glyph of Returning Echo","GLYPH",{text:"When you Channel Aether → Draw 1"}));
    return D;
  }

  /* Aetherflow (market) */
  function makeFlowDeck(){
    return [
      mk("af_cinders","Surge of Cinders","INSTANT",{cost:2, text:"Deal 2 damage to any target"}),
      mk("af_feedback","Pulse Feedback","INSTANT",{cost:3, text:"Advance all Spells you control by 1"}),
      mk("af_refract","Refracted Will","INSTANT",{cost:2, text:"Counter an Instant or negate a Glyph trigger"}),
      mk("af_impel","Aether Impel","INSTANT",{cost:4, text:"Gain 3 Æ this turn"}),
      mk("af_cascade","Cascade Insight","INSTANT",{cost:3, text:"Draw 2 cards, then discard 1"}),
      mk("af_resonant","Resonant Chorus","SPELL",{pip:1, text:"On Resolve: Gain 2 Æ and Channel 1", aetherValue:1}),
      mk("af_ember","Emberline Pulse","SPELL",{cost:1,pip:1, text:"On Resolve: Deal 2 damage and Draw 1"}),
      mk("af_memory","Fractured Memory","SPELL",{pip:2, text:"On Resolve: Draw 2 cards"}),
      mk("af_vault","Obsidian Vault","SPELL",{pip:1, text:"On Resolve: Channel 2 and gain Æ", aetherValue:1}),
      mk("af_mirror","Mirror Cascade","SPELL",{cost:1,pip:1, text:"On Resolve: Copy the next Instant you play this turn"}),
      mk("af_sanguine","Sanguine Flow","SPELL",{cost:2,pip:1, text:"On Resolve: Lose 1 Vitality, Gain 3 Æ"}),
      mk("af_gwither","Glyph of Withering Light","GLYPH",{text:"When an opponent plays a Spell → They lose 1 Æ"}),
      mk("af_gvigil","Glyph of Vigilant Echo","GLYPH",{text:"At end of your turn → Channel 1"}),
      mk("af_gburied","Glyph of Buried Heat","GLYPH",{text:"When you discard for Aether → Gain +1 Æ"}),
      mk("af_gglass","Glyph of Soulglass","GLYPH",{text:"When you buy from Aether Flow → Draw 1"}),
    ];
  }

  // minimal state/actions for the demo
  let deck = [], discard = [], hand = [], flow = [];
  function init(){
    deck = makeBaseDeck();
    while (deck.length < 30) deck = deck.concat(makeBaseDeck()); // pad for big count
    discard = [];
    hand = deck.splice(0,5);
    flow = makeFlowDeck();
  }
  function draw(n=1){ while(n-- > 0 && deck.length){ hand.push(deck.shift()); } }
  function buyFromFlow(index){ const c = flow[index]; if(!c) return null; discard.push({...c}); return c; }
  function playFromHand(index){ const c = hand.splice(index,1)[0]; if(c) discard.push(c); return c; }
  function state(){ return {deck,discard,hand,flow,flowCosts:FLOW_COSTS}; }

  return {init, draw, buyFromFlow, playFromHand, state};
})();

// expose to window for index.js hooks
window.Game = Game;
