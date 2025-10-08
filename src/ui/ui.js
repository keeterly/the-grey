// /src/ui/ui.js — Fan strip layout (centered, smooth, Safari-safe)
function $(q, r = document) { return r.querySelector(q); }
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

/* ---------- Card template ---------- */
function cardEl({ title = 'Card', subtype = '', right = '', classes = '' } = {}) {
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

/* ---------- Boards / Flow ---------- */
function renderSlots(container, slots, fallbackTitle = 'Empty') {
  if (!container) return;
  container.innerHTML = '';
  const list = Array.isArray(slots) && slots.length ? slots : [null, null, null];
  for (const s of list) {
    if (!s) container.appendChild(cardEl({ title: fallbackTitle, subtype: '—' }));
    else container.appendChild(cardEl({ title: s.name || s.title || 'Card', subtype: s.type || s.subtype || 'Spell' }));
  }
}

function renderFlow(container, state) {
  if (!container) return;
  container.innerHTML = '';
  const row = Array.isArray(state?.flowRow) ? state.flowRow : [null, null, null, null, null];
  row.forEach((slot, i) => {
    if (!slot) container.appendChild(cardEl({ title: 'Empty', subtype: '—' }));
    else container.appendChild(cardEl({ title: slot.name || 'Aether', subtype: 'Instant', right: String(i + 1) }));
  });
}

/* ---------- Hand math ---------- */
function layoutHand(ribbonEl){
  const fan = ribbonEl.querySelector('.fan');
  if (!fan) return;

  // anchor = same centered column your boards use
  const anchor = document.querySelector('main.grid') || document.body;

  // the fan will be positioned relative to the ribbon itself
  const ribbonRect = ribbonEl.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();

  // card & spread
  const cardW = parseFloat(getComputedStyle(ribbonEl).getPropertyValue('--card-w')) || 180;
  const n = fan.children.length || 1;
  const preferred = 120;
  const maxSpread = Math.max(58, (anchorRect.width - cardW) / Math.max(1, n - 1));
  const spread = Math.min(preferred, maxSpread);
  const stripW = (n - 1) * spread + cardW;

  // center the fan to the anchor center in ribbon coords
  const fanLeft = Math.round(
    (anchorRect.left + anchorRect.width / 2) - (ribbonRect.left + stripW / 2)
  );
  fan.style.left = `${fanLeft}px`;
  fan.style.width = `${stripW}px`;

  // arc / tilt / fade-in
  const centerIdx = (n - 1) / 2;
  fan.querySelectorAll('.cardWrap').forEach(w => (w.style.opacity = '0'));
  requestAnimationFrame(() => {
    fan.querySelectorAll('.cardWrap').forEach((wrap, idx) => {
      const x    = Math.round(idx * spread);
      const tilt = (idx - centerIdx) * 10;          // -… +…
      const arcY = -2 * Math.abs(idx - centerIdx);  // small arc

      wrap.style.left = `${x}px`;
      wrap.style.setProperty('--wrot', `${tilt}deg`);
      wrap.style.setProperty('--wy', `${arcY}px`);
      wrap.style.zIndex = String(100 + idx);
      wrap.style.transitionDelay = `${idx * 24}ms`;
      wrap.style.opacity = '1';
    });
  });
}

/* ---------- Hand renderer ---------- */
function attachMobilePeekHandlers(wrap){
  // Single-finger press previews; tap outside to clear
  let pressed = false, timer = null;

  const add = () => { wrap.classList.add('is-peek'); };
  const clear = () => { wrap.classList.remove('is-peek'); pressed = false; };

  wrap.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    pressed = true;
    timer = setTimeout(() => pressed && add(), 70);   // small delay feels better
  }, { passive:true });

  wrap.addEventListener('touchend', () => { clearTimeout(timer); clear(); }, { passive:true });
  wrap.addEventListener('touchcancel', () => { clearTimeout(timer); clear(); }, { passive:true });

  // tap anywhere else to drop preview
  document.addEventListener('touchstart', (ev) => {
    if (!wrap.contains(ev.target)) clear();
  }, { passive:true });
}

function renderHand(ribbonEl, state) {
  if (!ribbonEl) return;
  ribbonEl.innerHTML = ''; // reset shell

  // build/append the centered fan strip
  const fan = el('div', 'fan');
  ribbonEl.appendChild(fan);

  const hand = Array.isArray(state?.hand) ? state.hand : [];

  if (hand.length === 0) {
    const w = el('div', 'cardWrap');
    const ph = cardEl({ title: '—', classes: 'is-phantom' });
    w.appendChild(ph);
    fan.appendChild(w);
    layoutHand(ribbonEl);
    return;
  }

  hand.forEach(c => {
    const w = el('div', 'cardWrap');
    const isInstant = (c.type || c.subtype) === 'Instant';
    const node = cardEl({
      title: c.name || c.title || 'Card',
      subtype: c.type || c.subtype || 'Spell',
      classes:
