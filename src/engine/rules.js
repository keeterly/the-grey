// /src/engine/rules.js
// ---------------------------------------------------------
// Browser-safe reducer (no Node “process” dependency)
// ---------------------------------------------------------

// If running in the browser, define a minimal process shim *only* if missing.
// Prevents “ReferenceError: process is not defined” when hosted on GitHub Pages.
if (typeof window !== "undefined" && typeof window.process === "undefined") {
  window.process = { env: { NODE_ENV: "production" } };
}

// Safe dev flag (works in Node or browser)
const IS_DEV =
  typeof process !== "undefined" &&
  process?.env?.NODE_ENV !== "production";

// ---- Action constants (exported for convenience) ----
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


// -------- Utility helpers (pure) --------
function clone(x) {
  if (typeof structuredClone === "function") return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

function withDefaultArrays(s) {
  // Ensure expected arrays exist so we never throw during boot
  const next = { ...s };

  // player side
  next.deck = Array.isArray(s.deck) ? s.deck : [];
  next.hand = Array.isArray(s.hand) ? s.hand : [];
  next.disc = Array.isArray(s.disc) ? s.disc : [];
  next.slots = Array.isArray(s.slots) ? s.slots : [null, null, null];
  next.glyphs = Array.isArray(s.glyphs) ? s.glyphs : [];

  // ai side
  const ai = { ...(s.ai || {}) };
  ai.deck = Array.isArray(ai.deck) ? ai.deck : [];
  ai.hand = Array.isArray(ai.hand) ? ai.hand : [];
  ai.disc = Array.isArray(ai.disc) ? ai.disc : [];
  ai.slots = Array.isArray(ai.slots) ? ai.slots : [null, null, null];
  ai.glyphs = Array.isArray(ai.glyphs) ? ai.glyphs : [];
  next.ai = ai;

  // aetherflow
  next.flowDeck = Array.isArray(s.flowDeck) ? s.flowDeck : [];
  next.flowRow = Array.isArray(s.flowRow) ? s.flowRow : [null, null, null, null, null];

  // misc
  next._log = Array.isArray(s._log) ? s._log : [];
  next.turn = Number.isFinite(s.turn) ? s.turn : 1;
  next.mode = s.mode || "main";

  // trance meta (just keep shape)
  const tz = s.trance || {};
  next.trance = {
    you: tz.you || { cur: 0, cap: 6, weaver: "Stormbinder" },
    ai: tz.ai || { cur: 0, cap: 6, weaver: "Stormbinder" },
  };

  // stats
  next.hp = Number.isFinite(s.hp) ? s.hp : 5;
  next.ae = Number.isFinite(s.ae) ? s.ae : 0;

  if (!next.ai.hp) next.ai.hp = 5;
  if (!next.ai.ae && next.ai.ae !== 0) next.ai.ae = 0;

  return next;
}

// Fill the aether market/row if there are holes (placeholder logic)
function ensureMarket(s) {
  const next = clone(withDefaultArrays(s));
  next.flowRow = next.flowRow.map(v => (v == null ? { id: `af_${Math.random().toString(36).slice(2)}` } : v));
  return next;
}

// Start of turn housekeeping (placeholder: just sets mode and could draw, etc.)
function startTurn(s, { first = false } = {}) {
  const next = clone(withDefaultArrays(s));
  next.mode = "main";
  // Opening hand draw could happen here if desired.
  // Example (no-op by default to avoid surprising behavior):
  // if (first && next.hand.length === 0) { /* draw X cards */ }
  return next;
}

function endTurn(s) {
  const next = clone(withDefaultArrays(s));
  next.turn = (next.turn || 1) + 1;
  next.mode = "main";
  return next;
}

function gainAether(s, who = "you", amount = 1) {
  const next = clone(withDefaultArrays(s));
  if (who === "ai") next.ai.ae = Math.max(0, (next.ai.ae || 0) + amount);
  else next.ae = Math.max(0, (next.ae || 0) + amount);
  return next;
}

function setMode(s, mode = "main") {
  const next = clone(withDefaultArrays(s));
  next.mode = mode;
  return next;
}

// ---- The reducer (pure) ----
export function reduce(state, action) {
  const a = action || {};
  const type = a.type || "";

  switch (type) {
    case Action.INIT:
    case "INIT":
      // Leave state as-is; useful for logging/metrics
      return withDefaultArrays(state);

    case Action.ENSURE_MARKET:
    case "ENSURE_MARKET":
      return ensureMarket(state);

    case Action.START_TURN:
    case "START_TURN":
      return startTurn(state, { first: !!a.first });

    case Action.END_TURN:
    case "END_TURN":
      return endTurn(state);

    case Action.GAIN_AETHER:
    case "GAIN_AETHER":
      return gainAether(state, a.who || "you", Number(a.amount ?? 1) || 1);

    case Action.SET_MODE:
    case "SET_MODE":
      return setMode(state, a.mode || "main");

    // Placeholder no-ops to avoid crashes; wire your real logic later
    case Action.DRAW:
    case "DRAW":
    case Action.PLAY_CARD:
    case "PLAY_CARD":
    case Action.DISCARD:
    case "DISCARD":
      return withDefaultArrays(state);

    default:
      if (IS_DEV && type) {
        // Safe in browser (no process ReferenceError)
        console.warn("[rules.reduce] Unknown action:", type, a);
      }
      return withDefaultArrays(state);
  }
}
