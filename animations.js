// animations.js — v2.571 foundation
// Intentionally minimal: only sets up listeners; does nothing unless you emit.
// You can later fill these handlers with animations.

function noop() {}

document.addEventListener('cards:drawn',   noop);
document.addEventListener('cards:discard', noop);
document.addEventListener('flow:reveal',   noop);
document.addEventListener('flow:falloff',  noop);
document.addEventListener('flow:purchase', noop);

// Leave this file in place; we'll expand handlers in Step 2+.
