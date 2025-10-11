// GameLogic.js — v2.3 with confirmed 10-card base deck + full Flow pool and glyph triggers

export const HAND_SIZE = 5;
export const STARTING_VITALITY = 5;
export const STARTING_AETHER = 0;
export const MAX_SLOTS = 3;
export const FLOW_SIZE = 5;
export const FLOW_COSTS = [4,3,2,2,2];

function mulberry32(seed){ let t = seed>>>0; return ()=>{ t += 0x6D2B79F5; let r = Math.imul(t ^ (t>>>15), 1|t); r ^= r + Math.imul(r ^ (r>>>7), 61|r); return ((r ^ (r>>>14))>>>0)/4294967296; }; }
function shuffle(arr, rng){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j = Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

export const Cards = {
  PulseOfTheGrey: ()=>({ id:'c:pulse', name:'Pulse of the Grey', type:'SPELL', cost:{aether:0}, aetherValue:0, advance:{maxSteps:1, costPerStep:{aether:1}} }),
  WispformSurge: ()=>({ id:'c:wisp', name:'Wispform Surge', type:'SPELL', cost:{aether:0}, aetherValue:0, advance:{maxSteps:1, costPerStep:{aether:1}} }),
  GreyfireBloom: ()=>({ id:'c:greyfire', name:'Greyfire Bloom', type:'SPELL', cost:{aether:1}, aetherValue:0, advance:{maxSteps:1, costPerStep:{aether:1}} }),
  EchoingReservoir: ()=>({ id:'c:echo', name:'Echoing Reservoir', type:'SPELL', cost:{aether:0}, aetherValue:2, advance:{maxSteps:1, costPerStep:{aether:2}} }),
  DormantCatalyst: ()=>({ id:'c:catalyst', name:'Dormant Catalyst', type:'SPELL', cost:{aether:0}, aetherValue:1, advance:{maxSteps:1, costPerStep:{aether:1}} }),
  AshenFocus: ()=>({ id:'c:ashen', name:'Ashen Focus', type:'SPELL', cost:{aether:0}, aetherValue:1, advance:{maxSteps:1, costPerStep:{aether:2}} }),
  SurgeOfAsh: ()=>({ id:'c:surgeAsh', name:'Surge of Ash', type:'INSTANT', cost:{aether:1}, aetherValue:0 }),
  VeilOfDust: ()=>({ id:'c:veil', name:'Veil of Dust', type:'INSTANT', cost:{aether:1}, aetherValue:0 }),
  GlyphRemnantLight: ()=>({ id:'c:glyphRemnant', name:'Glyph of Remnant Light', type:'GLYPH', cost:{aether:0}, aetherValue:0 }),
  GlyphReturningEcho: ()=>({ id:'c:glyphEcho', name:'Glyph of Returning Echo', type:'GLYPH', cost:{aether:0}, aetherValue:0 }),
};

// Starter: 6 Spells / 2 Instants / 2 Glyphs
export function buildStarterDeckExact10(){
  return [
    Cards.PulseOfTheGrey(), Cards.PulseOfTheGrey(), // 2x Pulse
    Cards.WispformSurge(),                           // 1x Wisp
    Cards.GreyfireBloom(),                           // 1x Greyfire
    Cards.EchoingReservoir(),                        // 1x Echo (channeler)
    Cards.PulseOfTheGrey(),                          // +1 Pulse = 6 spells
    Cards.SurgeOfAsh(), Cards.VeilOfDust(),          // Instants
    Cards.GlyphRemnantLight(), Cards.GlyphReturningEcho(), // Glyphs
  ];
}

// === Full Flow (Instants 5, Spells 6, Glyphs 4) ===
export const FlowCards = [
  // Instants
  { id:'f:surgeCinders', name:'Surge of Cinders', type:'INSTANT', cost:{aether:2}, aetherValue:0, effect:'deal2' },
  { id:'f:pulseFeedback', name:'Pulse Feedback', type:'INSTANT', cost:{aether:3}, aetherValue:0, effect:'advanceAllSpells1' },
  { id:'f:refractedWill', name:'Refracted Will', type:'INSTANT', cost:{aether:2}, aetherValue:0, effect:'counterInstantOrNegateGlyph' },
  { id:'f:aetherImpel', name:'Aether Impel', type:'INSTANT', cost:{aether:4}, aetherValue:0, effect:'gain3AetherNow' },
  { id:'f:cascadeInsight', name:'Cascade Insight', type:'INSTANT', cost:{aether:3}, aetherValue:0, effect:'draw2Discard1' },

  // Spells
  { id:'f:resonantChorus', name:'Resonant Chorus', type:'SPELL', cost:{aether:0}, aetherValue:1, advance:{maxSteps:1, costPerStep:{aether:1}}, onResolve:'gain2AetherChannel1' },
  { id:'f:emberlinePulse', name:'Emberline Pulse', type:'SPELL', cost:{aether:1}, aetherValue:0, advance:{maxSteps:1, costPerStep:{aether:1}}, onResolve:'deal2Draw1' },
  { id:'f:fracturedMemory', name:'Fractured Memory', type:'SPELL', cost:{aether:0}, aetherValue:0, advance:{maxSteps:2, costPerStep:{aether:1}}, onResolve:'draw2' },
  { id:'f:obsidianVault', name:'Obsidian Vault', type:'SPELL', cost:{aether:0}, aetherValue:1, advance:{maxSteps:1, costPerStep:{aether:2}}, onResolve:'channel2Gain1' },
  { id:'f:mirrorCascade', name:'Mirror Cascade', type:'SPELL', cost:{aether:1}, aetherValue:0, advance:{maxSteps:1, costPerStep:{aether:2}}, onResolve:'copyNextInstant' },
  { id:'f:sanguineFlow', name:'Sanguine Flow', type:'SPELL', cost:{aether:2}, aetherValue:0, advance:{maxSteps:1, costPerStep:{aether:1}}, onResolve:'lose1Gain3Aether' },

  // Glyphs
  { id:'f:glyphWithering', name:'Glyph of Withering Light', type:'GLYPH', cost:{aether:0}, aetherValue:0, glyph:'oppPlaysSpellLose1Aether' },
  { id:'f:glyphVigilant', name:'Glyph of Vigilant Echo', type:'GLYPH', cost:{aether:0}, aetherValue:0, glyph:'endOfYourTurnChannel1' },
  { id:'f:glyphBuriedHeat', name:'Glyph of Buried Heat', type:'GLYPH', cost:{aether:0}, aetherValue:0, glyph:'discardForAetherPlus1' },
  { id:'f:glyphSoulglass', name:'Glyph of Soulglass', type:'GLYPH', cost:{aether:0}, aetherValue:0, glyph:'onBuyFlowDraw1' },
];

function computeTranceStage(vitality, w){ if (vitality <= w.thresholds.stage2) return 2; if (vitality <= w.thresholds.stage1) return 1; return 0; }
export const Weavers = [
  { id:'aria', name:'Aria, Runesurge Adept', thresholds:{stage1:4, stage2:2} },
  { id:'enoch', name:'Enoch, Stillmind Scribe', thresholds:{stage1:3, stage2:1} },
  { id:'morr', name:'Morr, Gravecurrent Binder', thresholds:{stage1:4, stage2:1} },
  { id:'veyra', name:'Veyra, Spiral Sage', thresholds:{stage1:4, stage2:2} },
  { id:'kareth', name:'Kareth, Ember Architect', thresholds:{stage1:3, stage2:1} },
];

export function getWeaver(id){ const w = Weavers.find(w=>w.id===id); if(!w) throw new Error('Unknown weaver id: '+id); return w; }

export function initState(opts={}){
  const rng = mulberry32(opts.seed ?? 123456789);
  const makeBoard = (weaverId)=> ({
    vitality: STARTING_VITALITY, aether: STARTING_AETHER, channeled: 0,
    deck: shuffle(buildStarterDeckExact10(), rng), hand: [], discard: [],
    slots: new Array(MAX_SLOTS).fill(0).map(()=>({ card:null, progress:0, advancedThisTurn:false, isGlyph:false, glyphArmed:false })),
    weaver: getWeaver(weaverId), tranceStage: 0, perTurn:{},
  });
  const player = makeBoard(opts.playerWeaverId ?? 'aria');
  const ai = makeBoard(opts.aiWeaverId ?? 'enoch');

  const flowDeckShuffled = shuffle(FlowCards.slice(), rng);
  const flowRow = flowDeckShuffled.splice(0, FLOW_SIZE);

  const s = { rng, turn:1, activePlayer:'player', players:{player, ai}, flowRow, flowDeck:flowDeckShuffled, flowTrash:[] };
  drawToHandSize(s, 'player'); drawToHandSize(s, 'ai');
  updateTranceStages(s);
  return s;
}

function draw(state, pid, n){
  const P = state.players[pid];
  for (let i=0;i<n;i++){
    if (P.deck.length===0){
      if (P.discard.length===0) break;
      P.deck = shuffle(P.discard, state.rng); P.discard = [];
    }
    P.hand.push(P.deck.shift());
  }
}
function drawToHandSize(state, pid){ const P = state.players[pid]; const need = Math.max(0, HAND_SIZE - P.hand.length); draw(state, pid, need); }
function payAether(P, cost){ if (P.aether >= cost){ P.aether -= cost; return true; } const short = cost - P.aether; if (P.channeled >= short){ P.channeled -= short; P.aether = 0; return true; } return false; }
function placeIntoSlot(P, card, slotIndex, isGlyph){ const slot = P.slots[slotIndex]; if (!slot || slot.card) throw new Error('Slot occupied or invalid'); slot.card=card; slot.isGlyph=isGlyph; slot.glyphArmed=isGlyph; slot.progress=0; slot.advancedThisTurn=false; }
function hasGlyph(P, glyphKey){ return P.slots.some(s => s.isGlyph && s.card && s.card.glyph === glyphKey); }

function resolveSpellIfComplete(state, pid, slotIndex){
  const slot = state.players[pid].slots[slotIndex]; if (!slot.card || slot.isGlyph) return;
  const card = slot.card; if (!card.advance) return;
  if (slot.progress >= card.advance.maxSteps){
    const P = state.players[pid];
    switch(card.onResolve || card.id){
      case 'gain2AetherChannel1': P.aether += 2; P.channeled += 1; break;
      case 'deal2Draw1': /* damage hook */ draw(state, pid, 1); break;
      case 'draw2': draw(state, pid, 2); break;
      case 'channel2Gain1': P.channeled += 2; P.aether += 1; break;
      case 'copyNextInstant': /* hook */ break;
      case 'lose1Gain3Aether': P.vitality = Math.max(0, P.vitality-1); P.aether += 3; break;

      // Starter names for compatibility:
      case 'c:pulse': P.aether += 1; draw(state, pid, 1); break;
      case 'c:wisp': break;
      case 'c:greyfire': break;
      case 'c:echo': P.channeled += 1; break;
      case 'c:catalyst': P.channeled += 2; break;
      case 'c:ashen': P.channeled += 1; draw(state, pid, 1); break;
      default: break;
    }
    state.players[pid].discard.push(card);
    slot.card=null; slot.progress=0; slot.advancedThisTurn=false; slot.isGlyph=false; slot.glyphArmed=false;
  }
}
function updateTranceStages(state){ ['player','ai'].forEach(pid=>{ const P = state.players[pid]; P.tranceStage = computeTranceStage(P.vitality, P.weaver); }); }
function resetPerTurnFlags(P){ P.perTurn = {}; P.slots.forEach(s=>s.advancedThisTurn=false); }
function riverAdvance(state){
  if (state.flowRow.length===0) return;
  const removed = state.flowRow.shift(); state.flowTrash.push(removed);
  if (state.flowDeck.length===0){ state.flowDeck = shuffle(state.flowTrash, state.rng); state.flowTrash = []; }
  if (state.flowDeck.length>0) state.flowRow.push(state.flowDeck.shift());
}

export function reducer(state, action){
  switch(action.type){
    case 'RESET_GAME': return initState({ seed: action.seed, playerWeaverId: action.playerWeaverId, aiWeaverId: action.aiWeaverId });
    case 'START_TURN': {
      const P = state.players[action.player]; state.activePlayer = action.player;
      P.aether = STARTING_AETHER; resetPerTurnFlags(P); drawToHandSize(state, action.player); riverAdvance(state); updateTranceStages(state); return state;
    }
    case 'END_TURN': {
      const P = state.players[action.player];
      while(P.hand.length) P.discard.push(P.hand.shift());
      // Glyph of Vigilant Echo — Channel 1 at end of YOUR turn
      if (hasGlyph(P, 'endOfYourTurnChannel1')) P.channeled += 1;
      P.aether = 0;
      if (action.player==='player') state.activePlayer='ai'; else { state.activePlayer='player'; state.turn += 1; }
      updateTranceStages(state); return state;
    }
    case 'DRAW': { draw(state, action.player, action.amount); return state; }
    case 'DISCARD_HAND': { const P = state.players[action.player]; while(P.hand.length) P.discard.push(P.hand.shift()); return state; }
    case 'DISCARD_FOR_AETHER': {
      const P = state.players[action.player]; const idx = P.hand.findIndex(c=>c.id===action.cardId);
      if (idx<0) throw new Error('Card not in hand'); const [c]=P.hand.splice(idx,1);
      let gained = (c.aetherValue||0);
      if (hasGlyph(P, 'discardForAetherPlus1')) gained += 1; // Glyph of Buried Heat bonus
      P.aether += gained; P.discard.push(c); return state;
    }
    case 'BUY_FROM_FLOW': {
      const P = state.players[action.player]; const i = action.flowIndex;
      if (i<0 || i>=state.flowRow.length) throw new Error('Invalid flow index');
      const price = FLOW_COSTS[i]; if (!payAether(P, price)) throw new Error('Cannot afford');
      const [card] = state.flowRow.splice(i,1); P.discard.push(card);
      // Glyph of Soulglass — draw 1 when you buy
      if (hasGlyph(P, 'onBuyFlowDraw1')) draw(state, action.player, 1);
      while(state.flowRow.length < FLOW_SIZE){
        if (state.flowDeck.length===0){ state.flowDeck = shuffle(state.flowTrash, state.rng); state.flowTrash=[]; if (state.flowDeck.length===0) break; }
        state.flowRow.push(state.flowDeck.shift());
      }
      return state;
    }
    case 'PLAY_CARD_TO_SLOT': {
      const P = state.players[action.player]; const EID = action.player === 'player' ? 'ai' : 'player';
      const idx = P.hand.findIndex(c=>c.id===action.cardId);
      if (idx<0) throw new Error('Card not in hand'); const [card]=P.hand.splice(idx,1);
      if (card.type!=='SPELL') throw new Error('Only Spells go to slots');
      if (!payAether(P, card.cost?.aether ?? 0)) throw new Error('Insufficient Aether');
      placeIntoSlot(P, card, action.slotIndex, false);
      // Opponent's Glyph of Withering Light — when you play a Spell, lose 1 Aether
      const Opp = state.players[EID];
      if (hasGlyph(Opp, 'oppPlaysSpellLose1Aether')) P.aether = Math.max(0, P.aether - 1);
      return state;
    }
    case 'SET_GLYPH': {
      const P = state.players[action.player]; const idx = P.hand.findIndex(c=>c.id===action.cardId);
      if (idx<0) throw new Error('Card not in hand'); const [card]=P.hand.splice(idx,1);
      if (card.type!=='GLYPH') throw new Error('Only Glyphs can be set');
      if ((card.cost?.aether ?? 0) > 0){ if (!payAether(P, card.cost.aether)) throw new Error('Insufficient Aether'); }
      placeIntoSlot(P, card, action.slotIndex, true); return state;
    }
    case 'ADVANCE_SPELL': {
      const P = state.players[action.player]; const slot = P.slots[action.slotIndex];
      if (!slot || !slot.card) throw new Error('Empty slot'); if (slot.isGlyph) throw new Error('Cannot advance a Glyph');
      if (slot.advancedThisTurn) throw new Error('This spell already advanced this turn');
      const card = slot.card; if (!card.advance) throw new Error('Card has no advance spec');
      const cost = card.advance.costPerStep.aether; if (!payAether(P, cost)) throw new Error('Not enough Aether to advance');
      slot.progress += 1; slot.advancedThisTurn = true; resolveSpellIfComplete(state, action.player, action.slotIndex); updateTranceStages(state); return state;
    }
    case 'CAST_INSTANT_ADVANCE_SLOT': {
      const P = state.players[action.player]; const idx = P.hand.findIndex(c=>c.id===action.cardId);
      if (idx<0) throw new Error('Card not in hand'); const [card]=P.hand.splice(idx,1);
      if (card.type!=='INSTANT') throw new Error('Not an instant'); if (!payAether(P, card.cost?.aether ?? 0)) throw new Error('Insufficient Aether');
      // Starter Surge targets a slot; Flow instants handled by card.effect
      if (card.id === 'c:surgeAsh'){
        const slot = P.slots[action.slotIndex]; if (!slot||!slot.card||slot.isGlyph) throw new Error('Target slot must contain a Spell'); if (!slot.card.advance) throw new Error('Target spell has no advance spec');
        slot.progress += 1;
      } else {
        switch(card.effect){
          case 'gain3AetherNow': P.aether += 3; break;
          case 'draw2Discard1': draw(state, action.player, 2); {
            const hand = state.players[action.player].hand;
            if (hand.length){ let best = 0; for (let i=1;i<hand.length;i++){ if ((hand[i].aetherValue||0) > (hand[best].aetherValue||0)) best=i; }
              state.players[action.player].discard.push(hand.splice(best,1)[0]);
            }
          } break;
          case 'advanceAllSpells1': {
            P.slots.forEach((s,idx)=>{ if (s.card && !s.isGlyph && s.card.advance){ s.progress += 1; resolveSpellIfComplete(state, action.player, idx); } });
          } break;
          case 'deal2': /* damage hook */ break;
          case 'counterInstantOrNegateGlyph': /* reaction timing hook */ break;
          default: break;
        }
      }
      P.discard.push(card);
      updateTranceStages(state);
      return state;
    }
    default: return state;
  }
}

export function serializePublic(state){
  return {
    turn: state.turn, activePlayer: state.activePlayer,
    flow: state.flowRow.map((c,i)=>({ id:c.id, name:c.name, type:c.type, price: FLOW_COSTS[i] })),
    player: snapshotBoard(state.players.player),
    ai: snapshotBoard(state.players.ai),
  };
}
function snapshotBoard(P){
  return {
    vitality: P.vitality, aether: P.aether, channeled: P.channeled,
    deckCount: P.deck.length,
    hand: P.hand.map(c=>({ id:c.id, name:c.name, type:c.type, aetherValue:c.aetherValue })),
    discardCount: P.discard.length,
    slots: P.slots.map(s=>({ hasCard: !!s.card, card: s.card ? { id:s.card.id, name:s.card.name, type:s.card.type } : null, progress:s.progress, isGlyph:s.isGlyph })),
    weaver: { id: P.weaver.id, name: P.weaver.name, stage: P.tranceStage },
  };
}
