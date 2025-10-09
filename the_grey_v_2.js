# Project: the-grey-v2-clean

Below is a **drop‑in, from‑scratch rebuild** you can upload as a new branch (e.g., `v2.1-rebuild`).

Copy the whole tree into your repo root, commit, and push. It’s framework‑free (vanilla ES modules) and runs from a static host (GitHub Pages).

---

📁 **File tree**

```
.
├── index.html
├── README.md
├── /src
│   ├── /engine
│   │   ├── state.js
│   │   └── rules.js
│   ├── /ui
│   │   ├── animate.js
│   │   ├── drag.js
│   │   └── index.js
│   └── /styles
│       └── cards.css
└── /assets
    └── placeholder.txt
```

---

## index.html
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The Grey — v2.0 Clean Rebuild</title>
  <link rel="stylesheet" href="./src/styles/cards.css">
  <style>
    html,body{height:100%; margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, "Apple Color Emoji","Segoe UI Emoji"; color: #eee; background: radial-gradient(1200px 800px at 50% -10%, rgba(255,255,255,.07), transparent 70%), #0e0f12;}
    a{color:#b7f;}
    .container{max-width:1100px; margin:0 auto; padding:16px;}
    .titlebar{display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,.08)}
    .titlebar h1{font-size:18px; letter-spacing:.02em; margin:0; opacity:.9}
  </style>
</head>
<body>
  <div class="container">
    <div class="titlebar">
      <h1>The Grey — Prototype</h1>
      <div style="opacity:.65">v2.0 clean rebuild</div>
    </div>

    <div id="app"></div>

    <div class="tips">
      <p><strong>Tips:</strong> Long‑press a hand card to preview; drag onto <em>Spell Slot</em> or <em>Glyph Slot</em>. Use <em>Advance</em> to spend Aether on pips. <em>End Turn</em> discards your hand and lets the AI play/animate.</p>
    </div>
  </div>

  <script type="module" src="./src/ui/index.js"></script>
</body>
</html>
```

---

## README.md
```md
# The Grey — v2.0 Clean Rebuild

This is a from‑scratch, minimal, **stable** rebuild that restores the broken core loops:

- Drag & drop from hand → Player Spell Slot
- Dedicated **Glyph Slot**
- End‑turn hand discard (+1 Aether baseline to player; AI also accrues & spends)
- Base deck of 10 cards across **Instant / Spell / Glyph**
- Long‑press preview (slide‑up and zoom)
- Pips visible on slotted Spells; **Advance** spends Aether and animates
- AI plays with simple priorities and **animates** plays/advances/resolves

No build tooling required. Works on GitHub Pages.

## Run locally
Open `index.html` directly, or run a tiny static server:

```bash
npx http-server -p 8080
# or
python3 -m http.server 8080
```

## Extend points
- Hook artwork & final card template in `/src/ui/index.js > cardHtml()`.
- Implement real resolve effects in `/src/engine/rules.js > castIfComplete()`.
- UI palette, spacing, and arena layout in `/src/styles/cards.css`.
```

---

## /src/engine/state.js
```js
export const CARD_TYPES = { INSTANT:'INSTANT', SPELL:'SPELL', GLYPH:'GLYPH' };

export const makeCard = (id, name, type, {pips=0, aetherCost=0}={}) => ({
  id, name, type, pipsMax: pips, pips: 0, aetherCost,
});

export const BASE_DECK = [
  // 10 cards total: 4 Instants, 4 Spells (with pips), 2 Glyphs
  makeCard('I1','Flash Sigil', CARD_TYPES.INSTANT),
  makeCard('I2','Quick Ward',   CARD_TYPES.INSTANT),
  makeCard('I3','Rune Burst',   CARD_TYPES.INSTANT),
  makeCard('I4','Aether Jolt',  CARD_TYPES.INSTANT),

  makeCard('S1','Ember Weave',  CARD_TYPES.SPELL, {pips:3, aetherCost:1}),
  makeCard('S2','Frost Chain',  CARD_TYPES.SPELL, {pips:2, aetherCost:2}),
  makeCard('S3','Void Lattice', CARD_TYPES.SPELL, {pips:4, aetherCost:1}),
  makeCard('S4','Storm Script', CARD_TYPES.SPELL, {pips:3, aetherCost:2}),

  makeCard('G1','Glyph of Echo',   CARD_TYPES.GLYPH),
  makeCard('G2','Glyph of Thorns', CARD_TYPES.GLYPH),
];

const shuffle = arr => {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
};

export const newSide = (seedDeck=BASE_DECK) => ({
  draw: shuffle(seedDeck),
  hand: [],
  discard: [],
  slot: null,          // Spell slot
  glyphSlot: null,     // Dedicated glyph slot
  aether: 0,
});

export const newGame = () => ({
  you: newSide(),
  ai: newSide(),
  turn: 'YOU',
  animations: [],
});
```

---

## /src/engine/rules.js
```js
import { CARD_TYPES } from './state.js';

export const A = {
  START: 'START',
  DRAW: 'DRAW',
  PLAY_TO_SLOT: 'PLAY_TO_SLOT',
  PLAY_TO_GLYPH: 'PLAY_TO_GLYPH',
  ADVANCE_PIP: 'ADVANCE_PIP',
  END_TURN: 'END_TURN',
  AI_TURN: 'AI_TURN',
};

const drawN = (side, n=1) => {
  for (let i=0;i<n;i++){
    if (!side.draw.length) { side.draw = side.discard.splice(0).reverse(); }
    const c = side.draw.pop();
    if (c) side.hand.push(c);
  }
};

const discardHand = (side) => {
  side.discard.push(...side.hand);
  side.hand = [];
};

const castIfComplete = (side, card, who, animations) => {
  // TODO: Hook real effects here (damage, buffs, etc.)
  animations.push({ type:'RESOLVE', who, cardId: card.id });
};

export function reducer(state, action) {
  const s = structuredClone(state);
  const you = s.you, ai = s.ai;

  switch (action.type) {
    case A.START: {
      drawN(you, 5); drawN(ai, 5);
      return s;
    }
    case A.DRAW: {
      drawN(you, 1);
      return s;
    }
    case A.PLAY_TO_SLOT: {
      const { cardId, who='YOU' } = action;
      const tgt = who === 'YOU' ? you : ai;
      const idx = tgt.hand.findIndex(c=>c.id===cardId);
      if (idx<0) return s;
      const card = tgt.hand.splice(idx,1)[0];

      if (card.type === CARD_TYPES.INSTANT) {
        s.animations.push({type:'PLAY', who, cardId: card.id});
        castIfComplete(tgt, card, who, s.animations);
        tgt.discard.push(card);
        return s;
      }
      if (tgt.slot) tgt.discard.push(tgt.slot);
      card.pips = 0;
      tgt.slot = card;
      s.animations.push({type:'PLAY', who, cardId: card.id});
      return s;
    }
    case A.PLAY_TO_GLYPH: {
      const { cardId, who='YOU' } = action;
      const tgt = who === 'YOU' ? you : ai;
      const idx = tgt.hand.findIndex(c=>c.id===cardId);
      if (idx<0) return s;
      const card = tgt.hand.splice(idx,1)[0];
      if (card.type !== CARD_TYPES.GLYPH) { tgt.hand.push(card); return s; }
      if (tgt.glyphSlot) tgt.discard.push(tgt.glyphSlot);
      tgt.glyphSlot = card;
      s.animations.push({type:'PLAY_GLYPH', who, cardId: card.id});
      return s;
    }
    case A.ADVANCE_PIP: {
      const { who='YOU' } = action;
      const tgt = who === 'YOU' ? you : ai;
      const card = tgt.slot;
      if (!card || card.type !== CARD_TYPES.SPELL) return s;
      if (tgt.aether < card.aetherCost) return s;
      tgt.aether -= card.aetherCost;
      card.pips = Math.min(card.pips + 1, card.pipsMax);
      s.animations.push({type:'ADVANCE', who, cardId: card.id});
      if (card.pips === card.pipsMax) {
        castIfComplete(tgt, card, who, s.animations);
        tgt.discard.push(card);
        tgt.slot = null;
      }
      return s;
    }
    case A.END_TURN: {
      discardHand(you);
      you.aether += 1; // player baseline aether growth
      s.turn = 'AI';
      return s;
    }
    case A.AI_TURN: {
      const playFromHand = (pred, toGlyph=false)=>{
        const idx = ai.hand.findIndex(pred);
        if (idx>=0) {
          const card = ai.hand.splice(idx,1)[0];
          if (toGlyph) {
            if (ai.glyphSlot) ai.discard.push(ai.glyphSlot);
            ai.glyphSlot = card;
            s.animations.push({type:'PLAY_GLYPH', who:'AI', cardId: card.id});
          } else if (card.type === CARD_TYPES.INSTANT) {
            s.animations.push({type:'PLAY', who:'AI', cardId: card.id});
            castIfComplete(ai, card, 'AI', s.animations);
            ai.discard.push(card);
          } else { // SPELL
            if (ai.slot) ai.discard.push(ai.slot);
            card.pips = 0; ai.slot = card;
            s.animations.push({type:'PLAY', who:'AI', cardId: card.id});
          }
          return true;
        }
        return false;
      };

      if (!ai.glyphSlot) playFromHand(c=>c.type===CARD_TYPES.GLYPH, true);
      if (!ai.slot) playFromHand(c=>c.type===CARD_TYPES.SPELL);
      playFromHand(c=>c.type===CARD_TYPES.INSTANT);

      // AI aether accrues and it advances pips up to 3 times
      ai.aether += 1;
      for (let i=0;i<3;i++){
        const card = ai.slot;
        if (!card || card.type!==CARD_TYPES.SPELL) break;
        if (ai.aether < card.aetherCost) break;
        ai.aether -= card.aetherCost;
        card.pips = Math.min(card.pips+1, card.pipsMax);
        s.animations.push({type:'ADVANCE', who:'AI', cardId: card.id});
        if (card.pips === card.pipsMax) {
          castIfComplete(ai, card, 'AI', s.animations);
          ai.discard.push(card);
          ai.slot = null;
          break;
        }
      }

      // AI discard & return turn, then ensure player draws 5 if empty
      discardHand(ai);
      s.turn = 'YOU';
      if (!you.hand.length) drawN(you, 5);
      return s;
    }
    default: return s;
  }
}
```

---

## /src/ui/drag.js
```js
import { A } from '../engine/rules.js';

const LONGPRESS_MS = 220;
let pressTimer = null;
let dragging = null;

export function wireHandDrag(root, dispatch) {
  root.addEventListener('pointerdown', e=>{
    const cardEl = e.target.closest('[data-card-id][data-zone="hand"]');
    if (!cardEl) return;

    const cardId = cardEl.dataset.cardId;
    const startX = e.clientX, startY = e.clientY;

    // long press preview
    pressTimer = setTimeout(()=>{
      if (dragging) return;
      cardEl.classList.add('is-preview');
    }, LONGPRESS_MS);

    const onMove = (ev)=>{
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (!dragging && (dx>5 || dy>5)) {
        clearTimeout(pressTimer);
        cardEl.classList.remove('is-preview');
        dragging = { cardEl, cardId, dx, dy };
        cardEl.setPointerCapture(ev.pointerId);
        cardEl.classList.add('is-dragging');
      }
      if (dragging) {
        cardEl.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;
      }
    };

    const finish = (ev)=>{
      clearTimeout(pressTimer);
      if (dragging) {
        cardEl.classList.remove('is-dragging');
        cardEl.style.transform = '';
        const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
        const toMain = dropTarget?.closest('[data-drop="slot"]');
        const toGlyph = dropTarget?.closest('[data-drop="glyph"]');
        if (toGlyph) dispatch({type:A.PLAY_TO_GLYPH, cardId});
        else if (toMain) dispatch({type:A.PLAY_TO_SLOT, cardId});
      } else {
        // tap toggles preview
        cardEl.classList.toggle('is-preview');
      }
      dragging = null;
      cardEl.releasePointerCapture?.(ev.pointerId);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', finish);
      root.removeEventListener('pointercancel', finish);
    };

    root.addEventListener('pointermove', onMove, {passive:true});
    root.addEventListener('pointerup', finish, {passive:true});
    root.addEventListener('pointercancel', finish, {passive:true});
  }, {passive:true});
}
```

---

## /src/ui/animate.js
```js
export const runAnimations = async (root, anims=[])=>{
  for (const a of anims) {
    switch (a.type) {
      case 'PLAY': {
        const el = root.querySelector(`[data-card-id="${a.cardId}"]`);
        if (el) { el.classList.add('pulse-gold'); await wait(220); el.classList.remove('pulse-gold'); }
        break;
      }
      case 'PLAY_GLYPH': {
        const slot = root.querySelector('[data-drop="glyph"]');
        slot?.classList.add('slot-glow'); await wait(200); slot?.classList.remove('slot-glow');
        break;
      }
      case 'ADVANCE': {
        const pipWrap = root.querySelector(`[data-pips-for="${a.cardId}"]`);
        pipWrap?.classList.add('pip-tick'); await wait(140); pipWrap?.classList.remove('pip-tick');
        break;
      }
      case 'RESOLVE': {
        const board = root.querySelector(`[data-board="${a.who}"]`);
        board?.classList.add('resolve-flash'); await wait(260); board?.classList.remove('resolve-flash');
        break;
      }
    }
  }
};

const wait = (ms)=> new Promise(r=>setTimeout(r, ms));
```

---

## /src/ui/index.js
```js
import { newGame } from '../engine/state.js';
import { reducer, A } from '../engine/rules.js';
import { wireHandDrag } from './drag.js';
import { runAnimations } from './animate.js';

let state = newGame();

const root = document.getElementById('app');
const $ = s => root.querySelector(s);

function dispatch(action){
  state = reducer(state, action);
  render();
  runAnimations(root, state.animations);
  state.animations = [];
}

function cardHtml(c, zone){
  const pipBar = (c.pipsMax>0)
    ? `<div class="pips" data-pips-for="${c.id}">`+
      Array.from({length:c.pipsMax}, (_,i)=>`<span class="pip ${i < c.pips ? 'full':''}"></span>`).join('')+
      `</div>` : '';
  return `<div class="card" data-card-id="${c.id}" data-zone="${zone}">
    <div class="title">${c.name}</div>
    ${pipBar}
  </div>`;
}

function sideHtml(side, who){
  return `
  <section class="board" data-board="${who}">
    <div class="row">
      <div class="slot" data-drop="slot">${side.slot ? cardHtml(side.slot,'slot') : '<div class="slot-ghost">Spell Slot</div>'}</div>
      <div class="glyph-slot" data-drop="glyph">${side.glyphSlot ? cardHtml(side.glyphSlot,'slot') : '<div class="slot-ghost">Glyph Slot</div>'}</div>
      <div class="aether">Aether: ${side.aether}</div>
    </div>
    ${who==='YOU' ? `<div class="hand">${side.hand.map(c=>cardHtml(c,'hand')).join('')}</div>` : ''}
  </section>`;
}

function render(){
  root.innerHTML = `
    <div class="hud">
      <button id="btnDraw">Draw</button>
      <button id="btnAdvance">Advance</button>
      <button id="btnEnd">End Turn</button>
    </div>
    <div class="boards">
      ${sideHtml(state.ai,'AI')}
      ${sideHtml(state.you,'YOU')}
    </div>
  `;
  wireHandDrag(root, dispatch);
  $('#btnDraw').onclick = ()=> dispatch({type:A.DRAW});
  $('#btnAdvance').onclick = ()=> dispatch({type:A.ADVANCE_PIP});
  $('#btnEnd').onclick = ()=>{ dispatch({type:A.END_TURN}); dispatch({type:A.AI_TURN}); };
}

render();
// initial start draws
dispatch({type:A.START});
```

---

## /src/styles/cards.css
```css
/* Core board layout */
.board { margin: 12px auto; max-width: 980px; padding: 8px; border-radius: 16px; }
.board[data-board="AI"] { opacity: .92; }
.row { display:flex; align-items:center; gap:12px; }
.slot, .glyph-slot { width: 146px; height: 206px; border:1px dashed rgba(255,255,255,.25); border-radius: 12px; display:flex; align-items:center; justify-content:center; position:relative; }
.slot-ghost { color: rgba(255,255,255,.35); font-size: 12px; }
.slot-glow { box-shadow: 0 0 18px rgba(255,255,255,.35) inset; }

/* HUD */
.hud { position: sticky; top: 0; display:flex; gap:8px; padding:8px; background: rgba(0,0,0,.3); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(255,255,255,.08); z-index: 20; }
.aether { margin-left: auto; }

/* Hand: lowered so it doesn’t block view */
.hand { display:flex; gap:12px; padding: 16px 0 44px; transform: translateY(24px); }

/* Card base */
.card { width: 120px; height: 170px; border-radius: 12px; background: rgba(255,255,255,.06);
        backdrop-filter: blur(2px); border: 1px solid rgba(255,255,255,.12);
        position:relative; user-select:none; touch-action:none; transition: transform .12s ease; }
.card .title { position:absolute; top:6px; left:8px; right:8px; font-size:12px; text-align:center; }

/* Long-press preview */
.card.is-preview { transform: translateY(-18px) scale(1.15); z-index: 5; }

/* While dragging */
.card.is-dragging { cursor: grabbing; z-index: 9; }

/* Pip bar */
.pips { position:absolute; bottom:8px; left:0; right:0; display:flex; justify-content:center; gap:6px; }
.pip { width:10px; height:10px; border-radius:50%; border:1px solid rgba(255,255,255,.5); background: transparent; }
.pip.full { background: rgba(255,255,255,.85); }
.pip-tick { animation: pipTick .18s ease; }
@keyframes pipTick { from{ transform: scale(1.0);} 50%{transform:scale(1.2);} to{transform:scale(1.0);} }

/* Play/Resolve flair */
.pulse-gold { box-shadow: 0 0 18px rgba(255,215,0,.45); }
.resolve-flash { animation: resolve .26s ease; }
@keyframes resolve { from { background: rgba(255,255,150,.08);} to { background: transparent;} }
```

---

## /assets/placeholder.txt
```txt
(Place your art/fonts here. Not used by the minimal rebuild.)