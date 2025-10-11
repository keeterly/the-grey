// ensure these are declared in the file:
export function initState(opts = {}) { /* ... */ }
export function serializePublic(state) { /* ... */ }

// if you already have the functions but not exported, append:
export { initState, serializePublic };
