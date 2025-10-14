// animations.js — v2.57 add-on
// Listens to Grey.* events (created by the small bridge in index.js)
// Uses Web Animations API; no external libs.

const q = sel => document.querySelector(sel);
const DECK   = () => q('#btn-deck-hud');
const DISCARD= () => q('#btn-discard-hud');
const HAND   = () => q('#hand');

function rect(el) {
  const r = el.getBoundingClientRect();
  return {x:r.left + window.scrollX, y:r.top + window.scrollY, w:r.width, h:r.height};
}
function translateFromTo(a, b) {
  return [
    { transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${a.w / b.w})`, opacity: 0.01 },
    { transform: 'translate(0,0) scale(1)', opacity: 1 }
  ];
}
function translateTo(targetRect, fromRect) {
  return [
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${targetRect.x - fromRect.x}px, ${targetRect.y - fromRect.y}px) scale(${targetRect.w / fromRect.w})`, opacity: 0.0 }
  ];
}

function cloneForFx(node) {
  const c = node.cloneNode(true);
  const r = rect(node);
  c.style.position = 'absolute';
  c.style.left = r.x + 'px';
  c.style.top  = r.y + 'px';
  c.style.width  = r.w + 'px';
  c.style.height = r.h + 'px';
  c.style.pointerEvents = 'none';
  c.style.zIndex = 9999;
  c.classList.add('fx-shadow');
  document.body.appendChild(c);
  return { clone:c, from:r };
}

function spotlight(node, {scale=1.05, ms=380} = {}) {
  const { clone } = cloneForFx(node);
  clone.classList.add('fx-spotlight');
  const a = clone.animate([
    { filter:'brightness(1.0)', transform:'scale(1)' },
    { filter:'brightness(1.35)', transform:`scale(${scale})` },
    { filter:'brightness(1.0)', transform:'scale(1)' }
  ], { duration: ms, easing:'ease-out' });
  return a.finished.finally(() => clone.remove());
}

/* ===== Event handlers ===== */

function onCardsDrawn(e) {
  const nodes = (e.detail?.nodes ?? []).filter(Boolean);
  if (!nodes.length) return;

  const deck = DECK();
  if (!deck) return;

  const deckRect = rect(deck);
  nodes.forEach((n, i) => {
    const { clone, from } = cloneForFx(n);
    const kf = translateFromTo(deckRect, from);
    clone.animate(kf, { duration: 420 + i*70, easing:'cubic-bezier(.16,.84,.3,1)' })
      .finished.then(() => clone.remove())
      .catch(() => clone.remove());
  });
}

function onCardsDiscard(e) {
  const nodes = (e.detail?.nodes ?? []).filter(Boolean);
  if (!nodes.length) return;

  const pile = DISCARD();
  if (!pile) return;

  const pileRect = rect(pile);
  nodes.forEach((n, i) => {
    const { clone, from } = cloneForFx(n);
    const kf = translateTo(pileRect, from);
    clone.animate(kf, { duration: 420 + i*60, easing:'cubic-bezier(.16,.84,.3,1)' })
      .finished.then(() => clone.remove())
      .catch(() => clone.remove());
  });
}

function onFlowReveal(e) {
  const node = e.detail?.node;
  if (!node) return;
  spotlight(node, { scale:1.08, ms:420 });
}

function onFlowFalloff(e) {
  const node = e.detail?.node;
  if (!node) return;

  const { clone } = cloneForFx(node);
  clone.animate([
    { transform:'translate(0,0)', opacity:1 },
    { transform:'translate(0,24px)', opacity:0 }
  ], { duration: 360, easing:'ease-out' })
  .finished.then(() => clone.remove())
  .catch(() => clone.remove());
}

function onFlowPurchase(e) {
  const node = e.detail?.node;
  if (!node) return;

  // 1) spotlight the card in place
  spotlight(node, { scale:1.08, ms:360 })
  .then(() => {
    // 2) then slide to discard
    const pile = DISCARD();
    if (!pile) return;
    const pileRect = rect(pile);
    const { clone, from } = cloneForFx(node);
    return clone.animate(translateTo(pileRect, from),
      { duration: 460, easing:'cubic-bezier(.16,.84,.3,1)' }).finished
      .finally(() => clone.remove());
  })
  .catch(()=>{ /* ignore */ });
}

/* ===== Wire up ===== */

document.addEventListener('cards:drawn',   onCardsDrawn);
document.addEventListener('cards:discard', onCardsDiscard);
document.addEventListener('flow:reveal',   onFlowReveal);
document.addEventListener('flow:falloff',  onFlowFalloff);
document.addEventListener('flow:purchase', onFlowPurchase);

// Nothing else here — the game can freely emit Grey.emit(...)