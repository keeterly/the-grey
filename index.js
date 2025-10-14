/* The Grey – v2.53+ restorative build
 * - Restores clean card formatting and fan spread
 * - River (Aether Flow) 5 slots with costs 4,3,3,2,2
 * - Draw animation (arc + overshoot), discard to void
 * - Spotlight on purchase → fly-to-discard
 * - Drag+drop with legal target pulsing
 * - Portrait HUD: hearts, aether gem, Trance I/II
 */

(() => {
  // ------------------------------
  // Utilities
  // ------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // Shuffle
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // SVG icons (inline)
  const ICONS = {
    gem: `<svg viewBox="0 0 24 24" class="gem" aria-hidden="true"><path d="M12 2l5 4-5 16L7 6l5-4zM2 9l5-3 5 16-10-13zm20 0l-5-3-5 16 10-13z"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" class="heart"><path d="M12 21s-6.7-4.4-9.3-7C-0.7 11.1 1 6.3 5 6.3c2 0 3.4 1.1 4 2 0.6-0.9 2-2 4-2 4 0 5.7 4.8 2.3 7.7-2.6 2.6-9.3 7-9.3 7z"/></svg>`,
    dot: `<svg viewBox="0 0 8 8" class="pip"><circle cx="4" cy="4" r="3"/></svg>`
  };

  // ------------------------------
  // Card database (v2.53 tables)
  // ------------------------------
  // Base deck (shared starter)
  const BASE_DECK_LIST = [
    {name:"Pulse of the Grey", type:"SPELL", cost:0, pip:1, text:"On Resolve: Draw 1, gain ", aetherValue:0, qty:3},
    {name:"Wispform Surge", type:"SPELL", cost:0, pip:1, text:"On Resolve: Advance another Spell 1 (free)", aetherValue:0, qty:1},
    {name:"Greyfire Bloom", type:"SPELL", cost:1, pip:1, text:"On Resolve: Advance another Spell 1 (free)", aetherValue:0, qty:1},
    {name:"Echoing Reservoir", type:"SPELL", cost:0, pip:1, text:"On Resolve: Channel 1", aetherValue:2, qty:2},
    {name:"Dormant Catalyst", type:"SPELL", cost:0, pip:1, text:"On Resolve: Channel 2", aetherValue:1, qty:1},
    {name:"Ashen Focus", type:"SPELL", cost:0, pip:1, text:"On Resolve: Channel 1 and Draw 1", aetherValue:1, qty:1},
    {name:"Surge of Ash", type:"INSTANT", cost:1, pip:0, text:"Target Spell advances 1 step free", aetherValue:0, qty:1},
    {name:"Veil of Dust", type:"INSTANT", cost:1, pip:0, text:"Prevent 1 damage or negate a hostile Instant", aetherValue:0, qty:1},
    {name:"Glyph of Remnant Light", type:"GLYPH", cost:0, pip:0, text:"When a Spell resolves → Gain 1 ", aetherValue:0, qty:1},
    {name:"Glyph of Returning Echo", type:"GLYPH", cost:0, pip:0, text:"When you Channel → Draw 1", aetherValue:0, qty:1},
  ];

  // Aetherflow market deck
  const FLOW_DECK_LIST = [
    {name:"Surge of Cinders", type:"INSTANT", cost:2, pip:0, text:"Deal 2 damage to any target", aetherValue:0},
    {name:"Pulse Feedback", type:"INSTANT", cost:3, pip:0, text:"Advance all Spells you control by 1", aetherValue:0},
    {name:"Refracted Will", type:"INSTANT", cost:2, pip:0, text:"Counter an Instant or negate a Glyph trigger", aetherValue:0},
    {name:"Aether Impel", type:"INSTANT", cost:4, pip:0, text:"Gain 3 this turn", aetherValue:0},
    {name:"Cascade Insight", type:"INSTANT", cost:3, pip:0, text:"Draw 2 cards, then discard 1", aetherValue:0},
    {name:"Resonant Chorus", type:"SPELL", cost:0, pip:1, text:"On Resolve: Gain 2  and Channel 1", aetherValue:1},
    {name:"Emberline Pulse", type:"SPELL", cost:1, pip:1, text:"On Resolve: Deal 2 damage and Draw 1", aetherValue:0},
    {name:"Fractured Memory", type:"SPELL", cost:0, pip:2, text:"On Resolve: Draw 2 cards", aetherValue:0},
    {name:"Obsidian Vault", type:"SPELL", cost:0, pip:1, text:"On Resolve: Channel 2 and Gain 1 ", aetherValue:1},
    {name:"Mirror Cascade", type:"SPELL", cost:1, pip:1, text:"On Resolve: Copy the next Instant you play this turn", aetherValue:0},
    {name:"Sanguine Flow", type:"SPELL", cost:2, pip:1, text:"On Resolve: Lose 1 Vitality, Gain 3 ", aetherValue:0},
    {name:"Glyph of Withering Light", type:"GLYPH", cost:0, pip:0, text:"When an opponent plays a Spell → They lose 1 ", aetherValue:0},
    {name:"Glyph of Vigilant Echo", type:"GLYPH", cost:0, pip:0, text:"At end of your turn → Channel 1", aetherValue:0},
    {name:"Glyph of Buried Heat", type:"GLYPH", cost:0, pip:0, text:"When you discard for  → Gain +1 extra", aetherValue:0},
    {name:"Glyph of Soulglass", type:"GLYPH", cost:0, pip:0, text:"When you buy from Aether Flow → Draw 1", aetherValue:0},
  ];

  // Expand qty for base deck
  function expand(list) {
    const out = [];
    for (const c of list) {
      const times = c.qty ?? 1;
      for (let i=0;i<times;i++) {
        out.push({...c});
      }
    }
    return out;
  }

  // ------------------------------
  // Game State
  // ------------------------------
  const state = {
    player: {
      deck: [],
      hand: [],
      discard: [],
      slots: { spells:[null,null,null], glyph:null },
      hearts: 5,
      aether: 0,
      trance: 0
    },
    ai: {
      deck: [],
      hand: [],
      discard: [],
      slots: { spells:[null,null,null], glyph:null },
      hearts: 5,
      aether: 0,
      trance: 0
    },
    flow: [null,null,null,null,null],
    flowCosts: [4,3,3,2,2],
    flowDeck: [],
    dragging: null,
    turn: "player",
    started: false
  };

  // ------------------------------
  // Init / Start of game
  // ------------------------------
  function init() {
    state.player.deck = shuffle(expand(BASE_DECK_LIST));
    state.ai.deck = shuffle(expand(BASE_DECK_LIST));
    state.flowDeck = shuffle(FLOW_DECK_LIST.map(c => ({...c})));

    // First flow reveal: slot 0
    refillFlow(true);

    // Draw opening hand (5) with animation
    drawCards(state.player, 5, {animate:true});

    renderAll();
    state.started = true;

    // End Turn
    const endBtn = $('#btn-endturn-hud');
    if (endBtn) endBtn.addEventListener('click', onEndTurn);

    // Global pointer cancel safety for drag
    document.addEventListener('pointerup', onGlobalPointerUp);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') cancelDrag();
    });
  }

  // ------------------------------
  // Flow (river) logic
  // ------------------------------
  function refillFlow(initial = false) {
    // At start of turn, we reveal the leftmost empty (only one if initial)
    if (initial) {
      if (!state.flow[0]) state.flow[0] = drawFrom(state.flowDeck);
      return;
    }
    for (let i=0;i<state.flow.length;i++) {
      if (!state.flow[i]) {
        state.flow[i] = drawFrom(state.flowDeck);
        break;
      }
    }
  }

  function riverAdvance() {
    // End of turn: shift down – leftmost card falls off (if any),
    // everything shifts left by one position.
    for (let i=1;i<state.flow.length;i++) {
      if (state.flow[i-1] == null && state.flow[i] != null) {
        // This passes naturally in refill approach below
      }
    }
    // Move cards left by one slot
    for (let i=0;i<state.flow.length-1;i++) {
      state.flow[i] = state.flow[i+1];
    }
    state.flow[state.flow.length-1] = null;
  }

  // ------------------------------
  // Draw / Discard
  // ------------------------------
  function drawFrom(deck) {
    if (!deck.length) return null;
    return deck.pop();
  }

  function drawCards(who, n, {animate=false}={}) {
    for (let i=0;i<n;i++) {
      if (!who.deck.length) {
        // reshuffle
        who.deck = shuffle(who.discard.splice(0));
      }
      const c = who.deck.pop();
      if (!c) break;
      who.hand.push(c);
      if (animate) animateDrawToHand(c);
    }
  }

  async function discardHand(who) {
    const handEls = $$('.card[data-zone="hand"]');
    for (const el of handEls) {
      el.classList.add('fall-fade');
    }
    await wait(300);
    who.discard.push(...who.hand.splice(0));
  }

  // ------------------------------
  // Turn flow
  // ------------------------------
  async function onEndTurn() {
    // Discard hand → river advance → start of AI turn (stub) → back to player
    await discardHand(state.player);

    riverAdvance();
    refillFlow(); // reveal next

    renderAll();

    // AI stub – could be extended; draw 1 and discard
    drawCards(state.ai, 1);
    state.ai.discard.push(...state.ai.hand.splice(0));

    // Back to player: draw 5 fresh cards
    drawCards(state.player, 5, {animate:true});
    refillFlow();

    renderAll();
  }

  // ------------------------------
  // Rendering
  // ------------------------------
  function renderAll() {
    renderPortraitBars();
    renderFlowRow();
    renderSlots('#player-slots', state.player);
    renderSlots('#ai-slots', state.ai, true);
    renderHand();
  }

  function renderPortraitBars() {
    const playerSec = $('section.row.player');
    const aiSec = $('section.row.ai');
    if (!playerSec || !aiSec) return;

    const pWrap = playerSec;
    const aWrap = aiSec;

    const pHUD = pWrap.querySelector('.portrait-hud') || pWrap.appendChild(document.createElement('div'));
    pHUD.className = 'portrait-hud';
    pHUD.innerHTML = `
      <div class="hearts">${ICONS.heart.repeat(state.player.hearts)}</div>
      <div class="aether-display"><span class="gem-wrap">${ICONS.gem}</span><span class="val">${state.player.aether}</span></div>
      <div class="trance">
        <div class="tier ${state.player.trance>=1?'on':''}">I</div>
        <div class="tier ${state.player.trance>=2?'on':''}">II</div>
      </div>
    `;

    const aHUD = aWrap.querySelector('.portrait-hud') || aWrap.appendChild(document.createElement('div'));
    aHUD.className = 'portrait-hud';
    aHUD.innerHTML = `
      <div class="hearts">${ICONS.heart.repeat(state.ai.hearts)}</div>
      <div class="aether-display"><span class="gem-wrap">${ICONS.gem}</span><span class="val">${state.ai.aether}</span></div>
      <div class="trance">
        <div class="tier ${state.ai.trance>=1?'on':''}">I</div>
        <div class="tier ${state.ai.trance>=2?'on':''}">II</div>
      </div>
    `;
  }

  function renderSlots(sel, who, isAI=false) {
    const row = $(sel);
    if (!row) return;
    row.innerHTML = '';
    // 3 spell slots + 1 glyph slot
    for (let i=0;i<3;i++) {
      row.appendChild(slotEl('Spell Slot', `spell-${isAI?'ai':'pl'}-${i}`, 'spell'));
    }
    row.appendChild(slotEl('Glyph Slot', `glyph-${isAI?'ai':'pl'}`, 'glyph'));
  }

  function slotEl(label, id, kind) {
    const d = document.createElement('div');
    d.className = 'slot';
    d.dataset.slot = kind;
    d.id = id;
    d.innerHTML = `<div class="slot-label">${label}</div>`;
    // Drop handlers
    d.addEventListener('dragenter', onSlotDragEnter);
    d.addEventListener('dragover', onSlotDragOver);
    d.addEventListener('dragleave', onSlotDragLeave);
    d.addEventListener('drop', onSlotDrop);
    return d;
  }

  function renderFlowRow() {
    const row = $('#flow-row');
    if (!row) return;
    row.innerHTML = '';
    for (let i=0;i<state.flow.length;i++) {
      const c = state.flow[i];
      const w = document.createElement('div');
      w.className = 'flow-card';
      if (c) {
        w.appendChild(cardEl(c, {zone:'flow', index:i}));
        const price = state.flowCosts[i];
        const bar = document.createElement('div');
        bar.className = 'price-label';
        bar.innerHTML = `<span class="gem small">${ICONS.gem}</span> ${price} to buy`;
        w.appendChild(bar);
      } else {
        // Empty placeholder
        const ph = document.createElement('div');
        ph.className = 'flow-empty';
        ph.innerHTML = `<div class="slot-card">Empty<br><span class="muted">— Cost</span></div>`;
        w.appendChild(ph);
      }
      row.appendChild(w);
    }
  }

  function renderHand() {
    const area = $('#hand');
    if (!area) return;
    area.innerHTML = '';
    const hand = state.player.hand;
    hand.forEach((c, idx) => {
      const el = cardEl(c, {zone:'hand', index:idx});
      area.appendChild(el);
    });
    layoutFan(area);
  }

  // ------------------------------
  // Card Element
  // ------------------------------
  function cardEl(card, {zone,index}) {
    const el = document.createElement('div');
    el.className = 'card';
    el.setAttribute('draggable', zone === 'hand' ? 'true' : 'false');
    el.dataset.zone = zone;
    el.dataset.index = index;

    const gemInline = `<span class="gem-inline">${ICONS.gem}</span>`;
    const aVal = card.aetherValue && card.aetherValue>0 ? `
      <div class="aether-chip">
        ${ICONS.gem}<span class="val">${card.aetherValue}</span>
      </div>` : '';

    const pips = (card.pip|0) > 0 ? 
      `<div class="pip-row">${Array(card.pip).fill(ICONS.dot).join('')}</div>` : '';

    el.innerHTML = `
      <div class="title">${card.name}</div>
      <div class="type">${card.type}${card.cost>0?` — Cost ${gemInline} ${card.cost}`:''}</div>
      <div class="separator"></div>
      ${pips}
      <div class="textbox">${injectGems(card.text||'')}</div>
      ${aVal}
    `;

    // Hand interactions
    if (zone === 'hand') {
      el.addEventListener('dragstart', e => onCardDragStart(e, card, el));
      el.addEventListener('dragend', onCardDragEnd);
      // long-press preview on touch
      let lpTimer = null;
      el.addEventListener('pointerdown', () => {
        lpTimer = setTimeout(() => openPeek(card), 350);
      });
      el.addEventListener('pointerup', () => {
        clearTimeout(lpTimer);
        closePeek();
      });
      el.addEventListener('pointerleave', () => {
        clearTimeout(lpTimer);
        closePeek();
      });
    }

    // Flow purchase
    if (zone === 'flow') {
      el.classList.add('clickable');
      el.addEventListener('click', () => onBuyFromFlow(index, el, card));
    }

    return el;
  }

  function injectGems(text) {
    // Replace occurrences of " " placeholders with inline gem
    // We look for patterns: " gain ", " Gain ", " Channel " not replaced
    return (text||'').replaceAll(' ', ' ').replace(/(\s|^)→?\s?Gain 1\s?$/,'$1→ Gain 1 ');
  }

  // ------------------------------
  // Hand fan layout
  // ------------------------------
  function layoutFan(container) {
    const cards = $$('.card[data-zone="hand"]', container);
    const N = cards.length;
    if (!N) return;
    const spread = clamp(16 + N*2, 20, 40); // total degrees
    const step = spread / Math.max(N-1,1);
    const start = -spread/2;
    const radius = 34; // px translateY arc
    cards.forEach((el,i) => {
      const a = start + step*i;
      el.style.setProperty('--rot', `${a}deg`);
      el.style.setProperty('--ty', `${Math.abs(a)/2}px`);
      el.style.zIndex = 100 + i;
    });
  }

  // ------------------------------
  // Peek (zoom) overlay
  // ------------------------------
  function openPeek(card) {
    let z = $('#zoom-overlay');
    if (!z) {
      z = document.createElement('div');
      z.id = 'zoom-overlay';
      z.innerHTML = `<div id="zoom-card" class="card zoom"></div>`;
      document.body.appendChild(z);
    }
    const inner = $('#zoom-card', z);
    inner.replaceWith(cardEl(card, {zone:'peek', index:0}).classList.add('zoom'));
    const c = cardEl(card, {zone:'peek', index:0});
    c.classList.add('zoom');
    $('#zoom-overlay').innerHTML = '';
    $('#zoom-overlay').appendChild(c);
    z.dataset.open = 'true';
    z.addEventListener('click', closePeek, {once:true});
  }
  function closePeek() {
    const z = $('#zoom-overlay');
    if (z) z.dataset.open = 'false';
  }

  // ------------------------------
  // Drag and Drop
  // ------------------------------
  function onCardDragStart(e, card, el) {
    state.dragging = { card, el };
    el.classList.add('dragging');
    markPossibleSlots(card);
    // needed for Firefox
    try{ e.dataTransfer.setData('text/plain', card.name); }catch{}
  }
  function onCardDragEnd() {
    if (state.dragging) state.dragging.el.classList.remove('dragging');
    clearSlotHighlights();
    state.dragging = null;
  }

  function markPossibleSlots(card) {
    const type = card.type.toLowerCase();
    const targets = type === 'glyph'
      ? $$('.slot[data-slot="glyph"]')
      : $$('.slot[data-slot="spell"]');
    targets.forEach(t => t.classList.add('drop-ready'));
  }
  function clearSlotHighlights() { $$('.slot.drop-ready').forEach(s=>s.classList.remove('drop-ready')); }

  function onSlotDragEnter(e){ e.preventDefault(); if(this.classList.contains('drop-ready')) this.classList.add('drag-over'); }
  function onSlotDragOver(e){ if(this.classList.contains('drop-ready')) e.preventDefault(); }
  function onSlotDragLeave(){ this.classList.remove('drag-over'); }
  function onSlotDrop(e){
    e.preventDefault();
    this.classList.remove('drag-over');
    if (!state.dragging) return;
    const {card} = state.dragging;
    const slotKind = this.dataset.slot;
    if ((card.type === 'GLYPH' && slotKind!=='glyph') || (card.type!=='GLYPH' && slotKind!=='spell')) return;
    // Play from hand (remove)
    const idx = state.player.hand.indexOf(card);
    if (idx>=0) state.player.hand.splice(idx,1);
    // For demo we just place a copy visually (no persistent board card rendering yet)
    // but we’ll show as "played" by adding a quick glow
    this.classList.add('slotted');
    setTimeout(()=>this.classList.remove('slotted'), 600);
    // Gain aether if discarded to gem? (handled by dropping to discard HUD; see below)
    renderHand();
    clearSlotHighlights();
    state.dragging = null;
  }
  function onGlobalPointerUp(){ closePeek(); }

  function cancelDrag(){
    if (state.dragging) { state.dragging.el.classList.remove('dragging'); }
    clearSlotHighlights();
    state.dragging = null;
  }

  // ------------------------------
  // Buying from Flow
  // ------------------------------
  async function onBuyFromFlow(i, el, card) {
    const price = state.flowCosts[i];
    if (state.player.aether < price || !card) return;
    // pay
    state.player.aether -= price;

    // Spotlight animation on the card in row
    el.classList.add('spotlight');
    await wait(420);

    // Fly to discard
    el.classList.add('fly-to-discard');
    await wait(300);

    // Move to discard pile
    state.player.discard.push(card);
    state.flow[i] = null;

    // River will refill next turn start; for immediate feedback you can refill here
    renderPortraitBars();
    renderFlowRow();
  }

  // ------------------------------
  // Discard-for-Aether
  // ------------------------------
  // If user drags a hand card over a discard HUD button (#hud-discard),
  // card is removed from hand and its aetherValue added.
  const discardHUD = $('#hud-discard');
  if (discardHUD) {
    discardHUD.addEventListener('dragenter', e => { e.preventDefault(); discardHUD.classList.add('drop-ready'); });
    discardHUD.addEventListener('dragover', e => e.preventDefault());
    discardHUD.addEventListener('dragleave', () => discardHUD.classList.remove('drop-ready'));
    discardHUD.addEventListener('drop', () => {
      discardHUD.classList.remove('drop-ready');
      if (!state.dragging) return;
      const {card} = state.dragging;
      // Remove from hand
      const idx = state.player.hand.indexOf(card);
      if (idx>=0) state.player.hand.splice(idx,1);
      state.player.discard.push(card);
      // Gain aether equal to card.aetherValue
      const gain = card.aetherValue|0;
      if (gain>0) {
        state.player.aether += gain;
        flashAether();
      }
      renderAll();
      state.dragging = null;
    });
  }

  function flashAether() {
    const wrap = $('section.row.player .aether-display');
    if (!wrap) return;
    wrap.classList.remove('flash');
    // force reflow
    void wrap.offsetWidth;
    wrap.classList.add('flash');
  }

  // ------------------------------
  // Animations helpers
  // ------------------------------
  function animateDrawToHand(card) {
    // Attach a hidden temp card that arcs in; purely cosmetic—hand render will place real card
    const temp = cardEl(card, {zone:'hand', index:0});
    temp.classList.add('draw-arc');
    document.body.appendChild(temp);
    // Remove after finished
    setTimeout(()=> temp.remove(), 520);
  }

  // ------------------------------
  // Boot
  // ------------------------------
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
