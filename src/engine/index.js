import { initialState } from './state.js';
import { reduce } from './rules.js';

export function createGame(opts){
  let state = initialState(opts);
  const subs = new Set();
  const emit = ()=> subs.forEach(fn=>fn(state));

  const api = {
    getState: ()=>state,
    subscribe(fn){ subs.add(fn); return ()=>subs.delete(fn); },
    dispatch(action){
      state = reduce(state, action);
      emit();
    }
  };
  return api;
}
