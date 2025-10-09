// /src/engine/state.js — canonical initial state (no seeded slots)

import { STARTER, FLOW_POOL } from '../cards.js';
import { shuffle, uid } from '../rng.js';

export function makeStarterDeck() {
  return shuffle(STARTER.map(x => ({ ...x, id: uid() })));
}
export function makeFlowDeck() {
  return shuffle(FLOW_POOL.map(x => ({ ...x, id: uid() })));
}

export function initialState({ playerWeaver, aiWeaver } = {}) {
  const state = {
    hp: 5,
    ae: 0,
    deck: makeStarterDeck(),
    hand: [],
    disc: [],
    slots: [null, null, null],
    glyphs: [],

    ai: {
      hp: 5,
      ae: 0,
      deck: makeStarterDeck(),
      hand: [],
      disc: [],
      slots: [null, null, null],
      glyphs: [],
    },

    flowDeck: makeFlowDeck(),
    flowRow: [null, null, null, null, null], // start empty
    turn: 1,

    trance: {
      you: { cur: 0, cap: 6, weaver: playerWeaver ?? null },
      ai:  { cur: 0, cap: 6, weaver: aiWeaver ?? null },
    },

    freeAdvYou: 0, freeAdvAi: 0,
    youFrozen: 0,  aiFrozen: 0,
    _log: [],
  };

  return state;
}
