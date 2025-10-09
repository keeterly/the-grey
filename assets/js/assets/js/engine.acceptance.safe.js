// Compatibility shim for incorrect dynamic import path.
// If boot-debug.js imports "./assets/js/engine.acceptance.safe.js" from /assets/js/,
// the network request resolves to /assets/js/assets/js/engine.acceptance.safe.js.
// This file re-exports from the correct module (two levels up).
export * from '../../engine.acceptance.js';
