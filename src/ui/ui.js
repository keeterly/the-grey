// /src/ui/ui.js — Clean drag & drop, correct offset, bigger preview, no placeholders

function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

let _gameRef = null;

/* ------------------ Slot utilities ------------------ */
function getBoardSlotsEl() { return document.querySelector('#yourBoard'); }
function getBoardSlotNodes() {
  const root = getBoardSlotsEl();
  return root ? Array.from(root.querySelectorAll('.boardSlot')) : [];
}
function markSlots(mode){
  getBoardSlotNodes().forEach(n => {
    n.classList.remove('drop-target','drop-accept');
    if (mode === 'target') n.classList.add('drop-target');
    if (mode === 'accept') n.classList.add('drop-accept');
  });
}
function slotIndexFromPoint(x, y){
  for (const [i,n] of getBoardSlotNodes().entries()){
    const r = n.getBoundingClientRect();
    if (x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return i;
  }
  return -1;
}

/* ------------------ Card template ------------------ */
function cardEl({ title='Card', subtype='', right='', classes='' } = {}) {
  const c = el('div', `card ${classes}`.trim());
  c.innerHTML = `
    <div class="cHead">
      <div class="cName">${title}</div>
      <div class="cType">${subtype}</div>
    </div>
    <div class="cBody"></div>
    <div class="cStats">${right}</div>
  `;
  return c;
}

/* ------------------ Board rendering ------------------ */
function renderSlots(container, slots) {
  if (!container) return;
  container.innerHTML = '';
  const list = Array.isArray(slots) && slots.length ? slots : [null, null, null];
  list.forEach((s, i) => {
    const wrap = el('div', 'boardSlot');
    wrap.dataset.slotIndex = String(i);
    if (s) wrap.appendChild(cardEl({
      title: s.name || s.title || 'Card',
      subtype: s.type || s.subtype || 'Spell'
    }));
    container.appendChild(wrap);
  });
}

function renderFlow(container, state) {
  if (!container) return;
  container.innerHTML = '';
  const row = Array.isArray(state?.flowRow) ? state.flowRow : [null, null, null, null, null];
  row.forEach(slot => {
    const wrap = el('div', 'boardSlot');
    if (slot) wrap.appendChild(cardEl({
      title: slot.name || 'Aether',
      subtype: slot.type || 'Instant'
    }));
    container.appendChild(wrap);
  });
}

/* ------------------ Hand layout ------------------ */
function layoutHand(ribbonEl) {
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;

  const anchor = document.querySelector('main.grid') || document.body;
  const anchorRect = anchor.getBoundingClientRect();
  const ribbonRect = ribbonEl.getBoundingClientRect();
  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = Math.max(1, fan.children.length);
  const preferred = 120;
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;
  const fanLeft = Math.round((anchorRect.left + anchorRect.width / 2) - (ribbonRect.left + stripW / 2));

  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;

  const centerIdx = (n - 1) / 2;
  fan.querySelectorAll('.cardWrap').forEach(w => (w.style.opacity = '0'));
  requestAnimationFrame(() => {
    fan.querySelectorAll('.cardWrap').forEach((wrap, idx) => {
      const x = Math.round(idx * spread);
      const tilt = (idx - centerIdx) * 10;
      const arcY = -2 * Math.abs(idx - centerIdx);
      wrap.style.left = `${x}px`;
      wrap.style.setProperty('--wrot', `${tilt}deg`);
      wrap.style.setProperty('--wy', `${arcY}px`);
      wrap.style.zIndex = String(100 + idx);
      wrap.style.transitionDelay = `${idx * 24}ms`;
      wrap.style.opacity = '1';
    });
  });
}

/* ------------------ Hand rendering ------------------ */
function renderHand(ribbonEl, state) {
  if (!ribbonEl) return;
  ribbonEl.innerHTML = '';
  const fan = el('div', 'fan');
  ribbonEl.appendChild(fan);

  const hand = Array.isArray(state?.hand) ? state.hand : [];
  hand.forEach((c, handIndex) => {
    const w = el('div', 'cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes: isInstant ? 'is-instant' : ''
    });
    w.appendChild(node);
    fan.appendChild(w);
    enableDnDForCard(w, handIndex);
    enablePreviewOnClick(w);
  });

  layoutHand(ribbonEl);
}

/* ------------------ Game Renderer ------------------ */
export function renderGame(state) {
  const setTxt = (sel, v) => { const n = $(sel); if (n) n.textContent = String(v); };
  setTxt('#hud-you-hp', state?.hp ?? 0);
  setTxt('#hud-you-ae', state?.ae ?? 0);
  setTxt('#hud-ai-hp', state?.ai?.hp ?? 0);
  setTxt('#hud-ai-ae', state?.ai?.ae ?? 0);

  renderSlots($('#aiBoard'), state?.ai?.slots);
  renderFlow($('#aetherflow'), state);
  renderSlots($('#yourBoard'), state?.slots);
  renderHand($('#ribbon'), state);

  setTxt('#count-deck', state?.deck?.length ?? 0);
  setTxt('#count-discard', state?.disc?.length ?? 0);
  setTxt('#count-ae', state?.ae ?? 0);
}

/* ------------------ Init ------------------ */
export function init(game) {
  _gameRef = game;
  window.renderGame = renderGame;

  $('#dock-end')?.addEventListener('click', () => game.dispatch({ type: 'END_TURN' }));
  renderGame(game.state);
  document.addEventListener('game:state', (ev) => renderGame(ev.detail?.state ?? game.state));

  const ribbon = $('#ribbon');
  const onResize = () => ribbon && layoutHand(ribbon);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
}

/* ------------------ Drag and Drop ------------------ */
function enableMouseDnDOnCard(wrap, handIndex){
  wrap.draggable = true;
  wrap.addEventListener('dragstart', (e) => {
    const rect = wrap.getBoundingClientRect();
    e.dataTransfer.setDragImage(wrap, e.clientX - rect.left, e.clientY - rect.top);
    wrap.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(handIndex));
    e.dataTransfer.effectAllowed = 'move';
    markSlots('target');
  });
  wrap.addEventListener('dragend', () => { wrap.classList.remove('dragging'); markSlots(''); });

  const board = getBoardSlotsEl();
  if (board && !board._dragListenersAdded){
    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      const i = slotIndexFromPoint(e.clientX, e.clientY);
      markSlots(i >= 0 ? 'accept' : 'target');
    });
    board.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData('text/plain'));
      const tgt = slotIndexFromPoint(e.clientX, e.clientY);
      markSlots('');
      if (tgt >= 0 && Number.isFinite(src))
        _gameRef?.dispatch?.({ type:'PLAY_FROM_HAND', handIndex: src, slot: tgt });
    });
    board._dragListenersAdded = true;
  }
}

function enableTouchDnDOnCard(wrap, handIndex){
  let dragging = false;
  const badge = document.querySelector('.dragBadge') || document.body.appendChild(el('div','dragBadge'));
  const onMove = (x,y) => {
    badge.style.transform = `translate(${x+12}px, ${y+12}px)`;
    const idx = slotIndexFromPoint(x,y);
    markSlots(idx >= 0 ? 'accept' : 'target');
  };
  const onUp = (x,y) => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    badge.style.transform = 'translate(-9999px,-9999px)';
    const tgt = slotIndexFromPoint(x,y);
    markSlots('');
    if (tgt >= 0)
      _gameRef?.dispatch?.({ type:'PLAY_FROM_HAND', handIndex, slot: tgt });
  };
  wrap.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    dragging = true;
    wrap.classList.add('dragging');
    badge.textContent = 'Drag to a slot';
    const t = ev.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });
  wrap.addEventListener('touchmove', (ev) => {
    if (!dragging) return;
    const t = ev.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });
  wrap.addEventListener('touchend', (ev) => onUp(ev.changedTouches[0].clientX, ev.changedTouches[0].clientY), { passive: true });
  wrap.addEventListener('touchcancel', () => { dragging=false; wrap.classList.remove('dragging'); badge.style.transform='translate(-9999px,-9999px)'; markSlots(''); }, { passive: true });
}

function enableDnDForCard(wrap, handIndex){
  enableMouseDnDOnCard(wrap, handIndex);
  enableTouchDnDOnCard(wrap, handIndex);
}

/* ------------------ Click-to-Preview (50% bigger) ------------------ */
function enablePreviewOnClick(wrap){
  wrap.addEventListener('click', () => {
    wrap.classList.toggle('is-preview');
    wrap.querySelector('.card').style.transform = wrap.classList.contains('is-preview')
      ? 'translateY(-100px) scale(1.5)'
      : '';
  });
}
