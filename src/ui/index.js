// src/ui/index.js — Mobile Unified v2.3.5+ (safe)
// Renders AI row, Aetherflow, Player row, and HUD Hand with animations.

import { newGame, CARD_TYPES } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import wireHandDrag from './drags.js';
import {
  stageNewDraws,            // deck -> hand
  animateAFBuyToDiscard,    // hand -> discard (buy/channeled)
  animateCardsToDiscard,    // board -> discard
  spotlightThenDiscard,
} from './animate.js';

const root = document.getElementById('app');

// -----------------------------
// Utility / tiny DOM helpers
// -----------------------------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const h = (tag, cls = '', attrs = {}) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  return el;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// -----------------------------
// Game state
// -----------------------------
let G = newGame();
let dispatching = false;

function dispatch(action) {
  if (dispatching) return;
  dispatching = true;
  try {
    G = reducer(G, action);
    scheduleRender();
  } finally {
    dispatching = false;
  }
}

let raf;
function scheduleRender() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(render);
}

// -----------------------------
// Layout skeleton
// -----------------------------
function ensureScaffold() {
  root.innerHTML = `
    <div id="container">
      <div id="decktag" class="ver-tag">${window.__THE_GREY_BUILD || ''}</div>
      <section class="board" data-board="AI">
        <div class="row head"></div>
        <div class="row aether"></div>
      </section>

      <section class="board" data-board="YOU">
        <div class="row head"></div>
        <div class="row aether"></div>
      </section>

      <div id="hud" class="hud">
        <div class="hud-foot">
          <button class="btn play" data-action="end">▶</button>
          <div class="hud-spacer" data-role="discard"></div>
          <button class="btn deck" data-role="deck">DECK</button>
        </div>
        <div class="hand" data-who="YOU"></div>
      </div>
    </div>
  `;
}

function rowHeader(side) {
  // Spec said we can hide spellweaver name/HP for now if it helps visually.
  // Keep invisible placeholders for consistent spacing.
  const wrap = h('div', 'side-head');
  wrap.innerHTML = `
    <div class="weaver" aria-hidden="true"></div>
  `;
  return wrap;
}

function slot(kind = 'spell') {
  const label = kind === 'glyph' ? 'Glyph Slot' : 'Spell Slot';
  const cls = kind === 'glyph' ? 'slot glyph' : 'slot';
  const s = h('div', cls);
  s.setAttribute('data-slot', kind);
  s.innerHTML = `<div class="slot-label">${label}</div>`;
  return s;
}

// -----------------------------
// Cards
// -----------------------------
function costPips(cost = 0) {
  if (!cost) return '';
  return `<div class="pips"><span class="icon">⚡</span> ${cost}</div>`;
}

function cardFace(c) {
  const t = (c?.type || 'Spell').toLowerCase();
  const cost = (c?.cost ?? 0);
  return `
    <div class="card-tag ${t}">${c?.type || 'Spell'}</div>
    <div class="card-name">${c?.name || ''}</div>
    <div class="card-bot">${costPips(cost)}</div>
  `;
}

function cardEl(c, who) {
  const el = h('div', 'card');
  el.setAttribute('data-type', (c?.type || 'Spell').toLowerCase());
  el.setAttribute('data-who', who);
  el.innerHTML = cardFace(c);
  return el;
}

// -----------------------------
// Press-and-hold preview
// -----------------------------
function enablePressHoldPreview(handRoot) {
  let holdTimer = null;
  let preview = null;

  function clearPreview() {
    if (preview) {
      preview.remove();
      preview = null;
    }
  }
  function cancel() {
    clearTimeout(holdTimer);
    holdTimer = null;
    clearPreview();
  }
  handRoot.addEventListener('touchstart', onStart, { passive: true });
  handRoot.addEventListener('mousedown', onStart);
  handRoot.addEventListener('touchend', cancel);
  handRoot.addEventListener('mouseup', cancel);
  handRoot.addEventListener('mouseleave', cancel);

  function onStart(e) {
    const target = e.target.closest('.card');
    if (!target) return;
    cancel();
    holdTimer = setTimeout(() => {
      // Build preview clone
      const r = target.getBoundingClientRect();
      preview = target.cloneNode(true);
      preview.classList.add('preview');
      Object.assign(preview.style, {
        position: 'fixed',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        transform: 'translate(0,-18px) scale(1.28)',
        zIndex: 9998,
      });
      document.body.appendChild(preview);
    }, 220); // MTG-ish hold threshold
  }
}

// -----------------------------
// Render
// -----------------------------
let firstPaint = true;

function render() {
  if (!$('#container', root)) ensureScaffold();

  const ai = $('[data-board="AI"]', root);
  const you = $('[data-board="YOU"]', root);
  const aiHead = $('.row.head', ai);
  const aiRow = $('.row.aether', ai);
  const youHead = $('.row.head', you);
  const youRow = $('.row.aether', you);
  const handEl = $('.hand[data-who="YOU"]', root);

  // Headers (hidden labels to keep spacing consistent)
  aiHead.replaceChildren(rowHeader('AI'));
  youHead.replaceChildren(rowHeader('YOU'));

  // --- Board rows (centered) ---
  aiRow.replaceChildren(slot('spell'), slot('spell'), slot('spell'), slot('glyph'));
  youRow.replaceChildren(slot('spell'), slot('spell'), slot('spell'), slot('glyph'));

  // Place board cards (Aetherflow middle lane in your state)
  // Safe fallback if structure differs — we just map by index.
  const mid = G?.board?.mid || [];
  const aiMid = mid.filter(x => x?.who === 'AI');
  const youMid = mid.filter(x => x?.who === 'YOU');

  [...aiMid].forEach((c, i) => {
    const s = aiRow.children[i] || aiRow.lastElementChild;
    if (c) s.appendChild(cardEl(c, 'AI'));
  });
  [...youMid].forEach((c, i) => {
    const s = youRow.children[i] || youRow.lastElementChild;
    if (c) s.appendChild(cardEl(c, 'YOU'));
  });

  // --- Hand (HUD layer; separate stacking context so it never clips) ---
  handEl.replaceChildren();
  const hand = G?.you?.hand || [];
  const newCardEls = [];
  hand.forEach(c => {
    const el = cardEl(c, 'YOU');
    handEl.appendChild(el);
    newCardEls.push(el);
  });

  if (firstPaint) {
    // Animate initial hand from deck once on first paint
    stageNewDraws(newCardEls).catch(() => {});
    // Drag wiring (no-op if module decides to bail)
    try { wireHandDrag?.(handEl, dispatch); } catch {}
    // Press-and-hold preview
    enablePressHoldPreview(handEl);
    firstPaint = false;
  }

  // --- HUD buttons
  const btnEnd = $('[data-action="end"]', root);
  btnEnd.onclick = () => dispatch({ type: A.END_TURN });

  // Keep version tag updated
  const tag = $('#decktag', root);
  tag.textContent = window.__THE_GREY_BUILD || '';
}

// Kick it off
scheduleRender();

// Expose a minimal API for debug (optional)
window.__TG__ = {
  get state() { return G; },
  dispatch,
  redraw: scheduleRender,
};
