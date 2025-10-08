// /src/engine/rules.js — browser-safe reducer with DRAW + opening hand
if (typeof window !== "undefined" && typeof window.process === "undefined") {
  window.process = { env: { NODE_ENV: "production" } };
}
const IS_DEV = typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";

export const Action = {
  INIT: "INIT",
  ENSURE_MARKET: "ENSURE_MARKET",
  START_TURN: "START_TURN",
  END_TURN: "END_TURN",
  DRAW: "DRAW",
  PLAY_CARD: "PLAY_CARD",
  DISCARD: "DISCARD",
  GAIN_AETHER: "GAIN_AETHER",
  SET_MODE: "SET_MODE",
};

function clone(x){ if (typeof structuredClone === "function") return structuredClone(x); return JSON.parse(JSON.stringify(x)); }
function normState(s) {
  const n = { ...s };
  n.deck  = Array.isArray(s.deck)  ? s.deck  : [];
  n.hand  = Array.isArray(s.hand)  ? s.hand  : [];
  n.disc  = Array.isArray(s.disc)  ? s.disc  : [];
  n.slots = Array.isArray(s.slots) ? s.slots : [null,null,null];
  n.glyphs= Array.isArray(s.glyphs)? s.glyphs: [];
  const ai = { ...(s.ai||{}) };
  ai.deck  = Array.isArray(ai.deck)  ? ai.deck  : [];
  ai.hand  = Array.isArray(ai.hand)  ? ai.hand  : [];
  ai.disc  = Array.isArray(ai.disc)  ? ai.disc  : [];
  ai.slots = Array.isArray(ai.slots) ? ai.slots : [null,null,null];
  ai.glyphs= Array.isArray(ai.glyphs)? ai.glyphs: [];
  n.ai = ai;
  n.flowDeck = Array.isArray(s.flowDeck) ? s.flowDeck : [];
  n.flowRow  = Array.isArray(s.flowRow)  ? s.flowRow  : [null,null,null,null,null];
  n._log = Array.isArray(s._log) ? s._log : [];
  n.turn = Number.isFinite(s.turn) ? s.turn : 1;
  n.mode = s.mode || "main";
  n.hp = Number.isFinite(s.hp) ? s.hp : 5;
  n.ae = Number.isFinite(s.ae) ? s.ae : 0;
  if (!n.ai.hp) n.ai.hp = 5;
  if (!Number.isFinite(n.ai.ae)) n.ai.ae = 0;
  return n;
}

function ensureMarket(s) {
  const n = clone(normState(s));
  n.flowRow = n.flowRow.map(v => v ?? { id:`af_${Math.random().toString(36).slice(2)}`, name:'Aether', type:'Instant' });
  return n;
}

// --- Deck helpers (very simple placeholders) ---
function ensureDeck(n) {
  const base = [
    { name:'Ember', type:'Spell' },
    { name:'Meditate', type:'Instant' },
    { name:'Apprentice Bolt', type:'Spell' },
    { name:'Ward Sigil', type:'Glyph' },
    { name:'Frost Bolt', type:'Spell' },
  ];
  if (!Array.isArray(n.deck) || n.deck.length === 0) {
    n.deck = Array.from({ length: 12 }, (_, i) => clone(base[i % base.length]));
  }
  return n;
}
function drawN(n, who='you', amount=1) {
  const side = (who === 'ai') ? n.ai : n;
  for (let i=0; i<amount; i++){
    if (!side.deck.length) break;
    side.hand.push(side.deck.shift());
  }
  return n;
}

function startTurn(s, { first=false }={}) {
  let n = clone(normState(s));
  n.mode = "main";
  n = ensureDeck(n);
  if (first && (!n.hand || n.hand.length === 0)) {
    n = drawN(n, 'you', 5);
  }
  return n;
}

function endTurn(s) {
  const n = clone(normState(s));
  n.turn = (n.turn || 1) + 1;
  n.mode = "main";
  return n;
}

function gainAether(s, who='you', amount=1) {
  const n = clone(normState(s));
  if (who === "ai") n.ai.ae = Math.max(0, (n.ai.ae||0) + amount);
  else n.ae = Math.max(0, (n.ae||0) + amount);
  return n;
}

function setMode(s, mode='main'){ const n = clone(normState(s)); n.mode = mode; return n; }

export function reduce(state, action){
  const a = action || {};
  const t = a.type || "";
  let n = state;

  switch (t) {
    case Action.INIT:
    case "INIT":
      return normState(state);

    case Action.ENSURE_MARKET:
    case "ENSURE_MARKET":
      return ensureMarket(state);

    case Action.START_TURN:
    case "START_TURN":
      return startTurn(state, { first: !!a.first });

    case Action.END_TURN:
    case "END_TURN":
      return endTurn(state);

    case Action.DRAW:
    case "DRAW": {
      n = clone(normState(state));
      n = ensureDeck(n);
      const amt = Number(a.amount ?? 1) || 1;
      return drawN(n, a.who === 'ai' ? 'ai' : 'you', amt);
    }

    case Action.GAIN_AETHER:
    case "GAIN_AETHER":
      return gainAether(state, a.who || "you", Number(a.amount ?? 1) || 1);

    case Action.SET_MODE:
    case "SET_MODE":
      return setMode(state, a.mode || "main");

    case "PLAY_CARD":
    case "DISCARD":
      // placeholders; wire real rules when ready
      return normState(state);

    default:
      if (IS_DEV && t) console.warn("[rules.reduce] Unknown action:", t, a);
      return normState(state);
  }
}
