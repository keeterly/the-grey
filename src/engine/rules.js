// rules.js — pure reducer, no global `state` references

// ---- Initial State (adjust to your game) ----
export const initialState = {
  turn: 1,
  player: { hp: 20, aether: 0, hand: [], board: [], glyphs: [] },
  ai:      { hp: 20, aether: 0, hand: [], board: [], glyphs: [] },
  aetherflow: [],
  mode: 'main', // 'main' | 'combat' | etc.
};

// ---- Action Types ----
// e.g. { type: 'END_TURN' }
// e.g. { type: 'PLAY_CARD', cardId, slot }
export const Action = {
  END_TURN: 'END_TURN',
  DRAW: 'DRAW',
  PLAY_CARD: 'PLAY_CARD',
  DISCARD: 'DISCARD',
  GAIN_AETHER: 'GAIN_AETHER',
  SET_MODE: 'SET_MODE',
};

// ---- Pure helpers (example implementations) ----
// IMPORTANT: These functions must take `s` and return a NEW state.
// If you already have versions, ensure they accept `s` and return next state.

function clone(s) { return structuredClone ? structuredClone(s) : JSON.parse(JSON.stringify(s)); }

export function applyEndTurn(s) {
  const next = clone(s);
  next.turn += 1;
  // Example: advance aetherflow each turn
  // next.aetherflow = advanceAether(next.aetherflow);
  next.mode = 'main';
  return next;
}

export function draw(s, payload = { who: 'player', n: 1 }) {
  const { who, n } = payload;
  const next = clone(s);
  // Implement your deck logic; below is a placeholder:
  // for (let i = 0; i < n; i++) next[who].hand.push(dealCard(next, who));
  return next;
}

export function playCard(s, payload = { who: 'player', cardId: null, slot: 0 }) {
  const { who, cardId, slot } = payload;
  const next = clone(s);
  // Remove from hand and place on board; placeholder:
  // const idx = next[who].hand.findIndex(c => c.id === cardId);
  // if (idx >= 0) next[who].board[slot] = next[who].hand.splice(idx, 1)[0];
  return next;
}

export function discard(s, payload = { who: 'player', cardId: null }) {
  const { who, cardId } = payload;
  const next = clone(s);
  // Remove from hand; placeholder
  return next;
}

export function gainAether(s, payload = { who: 'player', amount: 1 }) {
  const { who, amount } = payload;
  const next = clone(s);
  next[who].aether = Math.max(0, (next[who].aether ?? 0) + amount);
  return next;
}

export function setMode(s, payload = { mode: 'main' }) {
  const next = clone(s);
  next.mode = payload.mode;
  return next;
}

// ---- The reducer (pure) ----
export function reduce(state, action) {
  const s = state ?? initialState; // never undefined

  switch (action?.type) {
    case Action.END_TURN:
    case 'END_TURN':
      return applyEndTurn(s);

    case Action.DRAW:
    case 'DRAW':
      return draw(s, action);

    case Action.PLAY_CARD:
    case 'PLAY_CARD':
      return playCard(s, action);

    case Action.DISCARD:
    case 'DISCARD':
      return discard(s, action);

    case Action.GAIN_AETHER:
    case 'GAIN_AETHER':
      return gainAether(s, action);

    case Action.SET_MODE:
    case 'SET_MODE':
      return setMode(s, action);

    default:
      // Unknown action: return state unchanged (and log once)
      if (process?.env?.NODE_ENV !== 'production' && action?.type) {
        // eslint-disable-next-line no-console
        console.warn('[rules.reduce] Unknown action:', action.type, action);
      }
      return s;
  }
}

// ---- Optional runtime shim (prevents crashes if some legacy helpers still read global `state`)
// This exposes a temporary global getter during reduce. Prefer fixing helpers instead.
let __current;
export function withGlobalStateShim(fn, s) {
  const hasDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'state');
  try {
    __current = s;
    if (!hasDescriptor) {
      Object.defineProperty(globalThis, 'state', { get: () => __current, configurable: true });
    }
    return fn(s);
  } finally {
    __current = undefined;
    if (!hasDescriptor) delete globalThis.state;
  }
}
