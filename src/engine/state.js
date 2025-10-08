import { STARTER, FLOW_POOL } from './cards.js';
import { shuffle, uid } from './rng.js';

const PLAYER_SLOTS = 3;
const AI_SLOTS = 3;
const FLOW_SLOTS = 5;

const withIds = (arr) => arr.map(x => ({ ...x, id: uid() }));

export function makeStarterDeck() { return shuffle(withIds(STARTER)); }
export function makeFlowDeck()    { return shuffle(withIds(FLOW_POOL)); }

export function initialState({ playerWeaver, aiWeaver }) {
  return {
    hp: 5,
    ae: 0,
    deck: makeStarterDeck(),
    hand: [],
    disc: [],
    slots: Array(PLAYER_SLOTS).fill(null),   // empty player slots
    glyphs: [],

    ai: {
      hp: 5,
      ae: 0,
      deck: makeStarterDeck(),
      hand: [],
      disc: [],
      slots: Array(AI_SLOTS).fill(null),     // empty AI slots
      glyphs: [],
    },

    flowDeck: makeFlowDeck(),
    flowRow: Array(FLOW_SLOTS).fill(null),   // empty aetherflow
    turn: 1,

    trance: {
      you: { cur: 0, cap: 6, weaver: playerWeaver },
      ai:  { cur: 0, cap: 6, weaver: aiWeaver },
    },

    freeAdvYou: 0,
    freeAdvAi: 0,
    youFrozen: 0,
    aiFrozen: 0,
    _log: [],
  };
}
