// GameLogic.js
// v2.55 logic foundation (pip update + pulse support)

/////////////////////////////
// Constants & Helpers
/////////////////////////////

export const FLOW_COSTS = [4, 3, 3, 2, 2];
export const STARTING_HAND = 5;
export const STARTING_VITALITY = 5;

export const AE_GEM_SVG =
  '<svg class="gem-inline" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M12 2l6 6-6 14-6-14 6-6z" fill="currentColor"/></svg>';

export function withAetherText(s = "") {
  return String(s).replaceAll("Æ", AE_GEM_SVG);
}

function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/////////////////////////////
// Card Pools (Data)
/////////////////////////////

const BASE_DECK_LIST = [
  { name: "Pulse of the Grey", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Draw 1, Gain 1 Æ", aetherValue: 0, role: "Starter draw/flow", qty: 3 },
  { name: "Wispform Surge", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Advance another Spell for free", aetherValue: 0, role: "Chain enabler", qty: 1 },
  { name: "Greyfire Bloom", type: "SPELL", cost: 1, pip: 1, text: "On Resolve: Advance another Spell for free", aetherValue: 0, role: "Aggro chain", qty: 1 },
  { name: "Echoing Reservoir", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Channel 1", aetherValue: 2, role: "Aether generator", qty: 2 },
  { name: "Dormant Catalyst", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Channel 2", aetherValue: 1, role: "Ramp starter", qty: 1 },
  { name: "Ashen Focus", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Channel 1 and Draw 1", aetherValue: 1, role: "Draw + Aether hybrid", qty: 1 },
  { name: "Surge of Ash", type: "INSTANT", cost: 1, pip: 0, text: "Target Spell advances 1 step free", aetherValue: 0, role: "Tempo burst", qty: 1 },
  { name: "Veil of Dust", type: "INSTANT", cost: 1, pip: 0, text: "Prevent 1 damage or negate a hostile Instant", aetherValue: 0, role: "Reactive defense", qty: 1 },
  { name: "Glyph of Remnant Light", type: "GLYPH", cost: 0, pip: 0, text: "When a Spell resolves → Gain 1 Æ", aetherValue: 0, role: "Passive economy", qty: 1 },
  { name: "Glyph of Returning Echo", type: "GLYPH", cost: 0, pip: 0, text: "When you Channel Aether → Draw 1 card", aetherValue: 0, role: "Draw engine", qty: 1 },
];

const AETHERFLOW_LIST = [
  { name: "Surge of Cinders", type: "INSTANT", cost: 2, pip: 0, text: "Deal 2 damage to any target", aetherValue: 0, role: "Early aggression", qty: 1 },
  { name: "Pulse Feedback", type: "INSTANT", cost: 3, pip: 0, text: "Advance all Spells you control by 1", aetherValue: 0, role: "Momentum burst", qty: 1 },
  { name: "Refracted Will", type: "INSTANT", cost: 2, pip: 0, text: "Counter an Instant or negate a Glyph trigger", aetherValue: 0, role: "Defensive answer", qty: 1 },
  { name: "Aether Impel", type: "INSTANT", cost: 4, pip: 0, text: "Gain 3 Æ this turn", aetherValue: 0, role: "Temporary boost", qty: 1 },
  { name: "Cascade Insight", type: "INSTANT", cost: 3, pip: 0, text: "Draw 2 cards, then discard 1", aetherValue: 0, role: "Hand filter", qty: 1 },
  { name: "Resonant Chorus", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Gain 2 Æ and Channel 1", aetherValue: 1, role: "Hybrid economy", qty: 1 },
  { name: "Emberline Pulse", type: "SPELL", cost: 1, pip: 1, text: "On Resolve: Deal 2 damage and Draw 1", aetherValue: 0, role: "Core tempo", qty: 1 },
  { name: "Fractured Memory", type: "SPELL", cost: 0, pip: 2, text: "On Resolve: Draw 2 cards", aetherValue: 0, role: "Card advantage", qty: 1 },
  { name: "Obsidian Vault", type: "SPELL", cost: 0, pip: 1, text: "On Resolve: Channel 2 and Gain 1 Æ", aetherValue: 1, role: "Long-term economy", qty: 1 },
  { name: "Mirror Cascade", type: "SPELL", cost: 1, pip: 1, text: "On Resolve: Copy the next Instant you play this turn", aetherValue: 0, role: "Combo tool", qty: 1 },
  { name: "Sanguine Flow", type: "SPELL", cost: 2, pip: 1, text: "On Resolve: Lose 1 Vitality, Gain 3 Æ", aetherValue: 0, role: "Risk/reward burst", qty: 1 },
  { name: "Glyph of Withering Light", type: "GLYPH", cost: 0, pip: 0, text: "When an opponent plays a Spell → They lose 1 Æ", aetherValue: 0, role: "Tempo tax", qty: 1 },
  { name: "Glyph of Vigilant Echo", type: "GLYPH", cost: 0, pip: 0, text: "At end of your turn → Channel 1", aetherValue: 0, role: "Slow engine", qty: 1 },
  { name: "Glyph of Buried Heat", type: "GLYPH", cost: 0, pip: 0, text: "When you discard a card for Æ → Gain 1 extra Æ", aetherValue: 0, role: "Economy reward", qty: 1 },
  { name: "Glyph of Soulglass", type: "GLYPH", cost: 0, pip: 0, text: "When you buy a card from Aether Flow → Draw 1 card", aetherValue: 0, role: "Deck-growth loop", qty: 1 },
];

function expandList(list) {
  const out = [];
  list.forEach(c => {
    for (let i = 0; i < (c.qty || 1); i++) {
      out.push({
        id: uid(),
        name: c.name,
        type: c.type,
        cost: c.cost || 0,
        pip: c.pip || 0,
        text: c.text || "",
        aetherValue: c.aetherValue || 0,
        role: c.role || "",
        price: c.cost || 0,
        progress: 0,
        canAdvance: false,
      });
    }
  });
  return out;
}

/////////////////////////////
// State Init
/////////////////////////////

export function initState(seed) {
  const playerDeck = shuffle(expandList(BASE_DECK_LIST));
  const aiDeck = shuffle(expandList(BASE_DECK_LIST));
  const flowDraw = shuffle(expandList(AETHERFLOW_LIST));

  const handP = [];
  const handAI = [];
  for (let i = 0; i < STARTING_HAND && playerDeck.length; i++) handP.push(playerDeck.shift());
  for (let i = 0; i < STARTING_HAND && aiDeck.length; i++) handAI.push(aiDeck.shift());

  const flow = [null, null, null, null, null];
  if (flowDraw.length) flow[0] = { ...flowDraw.shift() };

  return {
    turn: 1,
    activePlayer: "player",
    flow,
    flowDraw,
    players: {
      player: {
        vitality: STARTING_VITALITY,
        aether: 0,
        channeled: 0,
        deck: playerDeck, hand: handP, discard: [],
        slots: [
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { isGlyph: true, hasCard: false, card: null },
        ],
        weaver: { id: "aria", name: "Aria, Runesurge Adept", portrait: "./weaver_aria.jpg" },
      },
      ai: {
        vitality: STARTING_VITALITY,
        aether: 0,
        channeled: 0,
        deck: aiDeck, hand: handAI, discard: [],
        slots: [
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { hasCard: false, card: null },
          { isGlyph: true, hasCard: false, card: null },
        ],
        weaver: { id: "morr", name: "Morr, Gravecurrent Binder", portrait: "./weaver_morr.jpg" },
      }
    }
  };
}

/////////////////////////////
// PIP ADVANCEMENT FIX
/////////////////////////////

export function advanceSpellAt(state, playerId, slotIndex) {
  const P = state.players[playerId];
  const slot = P.slots[slotIndex];
  if (!slot?.card) return state;

  const c = slot.card;
  if (c.progress == null) c.progress = 0;
  const maxPips = c.pip || 0;

  // Check if player can afford
  if ((P.aether || 0) <= 0) return state;

  // Spend aether immediately
  P.aether -= 1;
  // Advance immediately and mark
  c.progress = Math.min(maxPips, c.progress + 1);

  // Mark for pulse if not yet resolved
  c.canAdvance = (c.progress < maxPips && P.aether > 0);

  // Return new state
  return state;
}

/////////////////////////////
// AI + Turn (unchanged)
/////////////////////////////

export function aiTakeTurn(state) { return state; }
export function startTurn(state) { return state; }
export function endTurn(state) { return state; }