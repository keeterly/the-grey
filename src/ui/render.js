// =========================================================
// THE GREY — UI Render (structured DOM that your CSS expects)
// - Emits .card, .handCard, .marketCard, .slotCell, .glyph
// - Keeps rows fixed height (cards define height)
// - Typed drop hints via data-accept attributes
// =========================================================

let G = null;
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* cached roots (filled by cacheRoots) */
let elRibbon, elPlayerSlots, elGlyphTray, elAiSlots, elMarketCells;

export function setGame(game){ G = game; }

/* Cache DOM roots once (index.html’s structure) */
export function cacheRoots(){
  elRibbon      = $('.ribbon');
  elPlayerSlots = $('#playerSlots');
  elGlyphTray   = $('#glyphTray');
  elAiSlots     = $('#aiSlots');
  elMarketCells = $$('.marketCard');
}

/* Safe state view */
function S(){
  const s = G?.state || {};
  s.deck     = Array.isArray(s.deck)    ? s.deck    : [];
  s.disc     = Array.isArray(s.disc)    ? s.disc    : [];
  s.hand     = Array.isArray(s.hand)    ? s.hand    : [];
  s.glyphs   = Array.isArray(s.glyphs)  ? s.glyphs  : [];
  s.flowRow  = Array.isArray(s.flowRow) ? s.flowRow : [null,null,null,null,null];
  s.slots    = Array.isArray(s.slots)   ? s.slots   : [null,null,null];
  s.ai       = typeof s.ai==='object'   ? s.ai      : { slots:[null,null,null] };
  s.ai.slots = Array.isArray(s.ai.slots)? s.ai.slots: [null,null,null];
  return s;
}

/* Basic card element */
export function makeCardEl(card, variant){
  const el = document.createElement('div');
  el.className = 'card';
  if (variant === 'hand')   el.classList.add('handCard');
  if (variant === 'flow')   el.classList.add('marketCard');
  if (variant === 'slot')   el.classList.add('slotCard');
  if (variant === 'aiSlot') el.classList.add('slotCard');

  el.dataset.cid   = card?.id || '';
  el.dataset.ctype = card?.t  || '';
  el.dataset.cname = card?.n  || '';
  el.dataset.cost  = String(card?.p ?? 1);

  const name = card?.n || 'Card';
  const type = card?.t || '';
  const v    = Number.isFinite(card?.v) ? card.v : null;
  const p    = Number.isFinite(card?.p) ? card.p : null;

  el.innerHTML = `
    <div class="cHead">
      <div class="cName">${name}</div>
      <div class="cType">${type}</div>
    </div>
    <div class="cBody">
      ${card?.txt ? `<div class="cText">${card.txt}</div>` : ''}
    </div>
    <div class="cStats">
      ${v !== null ? `<span class="stat v">+${v}⚡</span>` : ''}
      ${p !== null ? `<span class="stat p">${p}↯</span>` : ''}
    </div>
  `;
  return el;
}

/* Market (Aetherflow) */
export function renderMarket(onBuy){
  const st = S();
  for (let i = 0; i < 5; i++) {
    const cell = elMarketCells[i];
    if (!cell) continue;
    cell.innerHTML = '';
    cell.dataset.flowIndex = String(i);

    const c = st.flowRow[i];
    if (!c) {
      const ghost = document.createElement('div');
      ghost.className = 'marketGhost';
      cell.appendChild(ghost);
      continue;
    }
    const cardEl = makeCardEl(c, 'flow');
    if (onBuy) cardEl.onclick = () => onBuy(i, cardEl);
    cell.appendChild(cardEl);
  }
}

/* Player hand (ribbon) */
export function renderHand(onPlayFromHand){
  const st = S();
  elRibbon.innerHTML = '';
  st.hand.forEach((c, idx) => {
    const cardEl = makeCardEl(c, 'hand');
    cardEl.dataset.handIndex = String(idx);
    if (onPlayFromHand) cardEl.onclick = (e)=>{ e.stopPropagation(); onPlayFromHand(c, idx, cardEl); };
    elRibbon.appendChild(cardEl);
  });
}

/* Player slots (3 spell + 1 glyph) */
export function renderPlayerSlots(onAdvance){
  const st = S();
  elPlayerSlots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell';
    cell.dataset.slotIndex = String(i);

    if (i === 3) { cell.classList.add('glyph'); cell.dataset.accept='Glyph'; }
    else         { cell.dataset.accept='Spell,Instant'; }

    const slot = (i < 3 ? st.slots[i] : null);
    if (slot && slot.c) cell.appendChild(makeCardEl(slot.c, 'slot'));
    else cell.innerHTML = `<div class="emptyCell">Empty</div>`;

    if (onAdvance && i<3 && st.slots[i]) cell.onclick = () => onAdvance(i);
    elPlayerSlots.appendChild(cell);
  }

  elGlyphTray.innerHTML = '';
  st.glyphs.forEach(() => {
    const face = document.createElement('div');
    face.className = 'card glyphCard faceDown';
    face.innerHTML = `
      <div class="cHead"><div class="cName">Glyph</div><div class="cType">Face Down</div></div>
      <div class="cBody"></div>
      <div class="cStats"></div>
    `;
    elGlyphTray.appendChild(face);
  });
}

/* AI slots (3 spell) */
export function renderAiSlots(){
  const st = S();
  elAiSlots.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const cell = document.createElement('div');
    cell.className = 'slotCell ai';
    cell.dataset.slotIndex = String(i);
    const slot = st.ai.slots[i];
    if (slot && slot.c) cell.appendChild(makeCardEl(slot.c, 'aiSlot'));
    else cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    elAiSlots.appendChild(cell);
  }
}

/* HUD counts */
export function renderCounts(){
  const st = S();
  const d = $('#deckCount');    if (d) d.textContent = String(st.deck.length);
  const c = $('#discardCount'); if (c) c.textContent = String(st.disc.length);
}

/* ONE CALL render */
export function renderAll({ onBuy, onPlayFromHand, onAdvance } = {}){
  renderMarket(onBuy);
  renderHand(onPlayFromHand);
  renderPlayerSlots(onAdvance);
  renderAiSlots();
  renderCounts();

  if (window.DragCards && typeof window.DragCards.refresh === 'function') {
    window.DragCards.refresh();
  }
}

/* Expose for other modules (used by animations) */
export const Roots = {
  get ribbon(){ return elRibbon; },
};
