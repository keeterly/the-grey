// =========================================================
// THE GREY — UI Renderer (compat DOM)
// =========================================================
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

let G=null;
let elRibbon, elPlayerSlots, elGlyphTray, elAiSlots, elMarketCells;

/* ---------- card element ---------- */
function makeCardEl(card, variant) {
  const el = document.createElement('div');
  el.className = 'card';
  if (variant==='hand') el.classList.add('handCard');
  if (variant==='slot' || variant==='aiSlot') el.classList.add('slotCard');
  if (variant==='flow') el.classList.add('marketCard');

  el.dataset.cid   = card.id || '';
  el.dataset.ctype = card.t || '';
  el.dataset.cname = card.n || '';

  el.innerHTML = `
    <div class="cHead"><div class="cName">${card.n||'Card'}</div><div class="cType">${card.t||''}</div></div>
    <div class="cBody">${card.txt?`<div class="cText">${card.txt}</div>`:''}</div>
    <div class="cStats">
      ${('v' in card)? `<span class="stat v">+${card.v||0}⚡</span>`:''}
      ${('p' in card)? `<span class="stat p">${card.p||1}↯</span>`:''}
    </div>
  `;
  return el;
}

/* ---------- animations (simple WAAPI) ---------- */
function fly(el, from, to, ms=420, ease='cubic-bezier(.2,.7,.2,1)'){
  return el.animate([
    { transform: `translate(${from.x}px,${from.y}px) scale(${from.s||1})`, opacity: from.o ?? 0.01 },
    { transform: `translate(${to.x}px,${to.y}px) scale(${to.s||1})`,       opacity: to.o   ?? 1 }
  ], { duration: ms, easing: ease, fill: 'forwards' }).finished.catch(()=>{});
}
async function animateDrawHand() {
  const ribbon = elRibbon;
  const cards = [...ribbon.children];
  const center = ribbon.getBoundingClientRect();
  // fan in
  await Promise.all(cards.map((c,i)=>{
    const r = c.getBoundingClientRect();
    const from = { x: (center.width*.5 - (r.width*.5)) - (r.left - center.left), y: 60, s:.85, o:0 };
    const to   = { x: 0, y: 0, s:1, o:1 };
    c.style.transform = 'translate(0,0)'; // ensure final
    return fly(c, from, to, 380 + i*45);
  }));
}
async function animateDiscardHand() {
  const ribbon = elRibbon;
  const cards = [...ribbon.children];
  // arc out
  await Promise.all(cards.map((c,i)=>{
    const to   = { x: 0, y: 80, s:.85, o:0 };
    return fly(c, {x:0,y:0,s:1,o:1}, to, 320 + i*40);
  }));
}

/* ---------- market ---------- */
function renderMarket(){
  for (let i=0;i<5;i++){
    const host = elMarketCells[i]; if(!host) continue;
    host.innerHTML='';
    const c = G.state.flowRow[i]; if(!c) continue;
    const cardEl = makeCardEl(c,'flow');
    cardEl.onclick = ()=>{
      G.dispatch({ type:'BUY_FLOW', index:i });
      renderAll();
    };
    host.appendChild(cardEl);
  }
}

/* ---------- hand (ribbon) ---------- */
function renderHand(){
  elRibbon.innerHTML='';
  G.state.hand.forEach((c, idx)=>{
    const cardEl = makeCardEl(c,'hand');
    cardEl.onclick = (e)=>{
      e.stopPropagation();
      if (c.t==='Instant'){
        G.dispatch({ type:'CHANNEL_FROM_HAND', index: idx });
      } else {
        const s=G.state.slots.findIndex(x=>!x);
        G.dispatch({ type:'PLAY_FROM_HAND', index: idx, slot: (s>=0?s:null) });
      }
      renderAll();
    };
    elRibbon.appendChild(cardEl);
  });
}

/* ---------- player board ---------- */
function renderPlayerSlots(){
  elPlayerSlots.innerHTML='';
  for (let i=0;i<4;i++){
    const cell = document.createElement('div');
    cell.className='slotCell';
    if (i===3) cell.classList.add('glyph');
    const slot = (i<3? G.state.slots[i] : null);
    if (slot && slot.c) cell.appendChild(makeCardEl(slot.c,'slot'));
    else cell.innerHTML = `<div class="emptyCell">Empty</div>`;
    cell.onclick = ()=>{
      if (i<3 && G.state.slots[i]){
        G.dispatch({ type:'ADVANCE', slot:i }); renderAll();
      }
    };
    elPlayerSlots.appendChild(cell);
  }
  elGlyphTray.innerHTML='';
  G.state.glyphs.forEach(()=>{ // face down glyphs
    const d=document.createElement('div');
    d.className='card glyphCard faceDown';
    d.innerHTML=`<div class="cHead"><div class="cName">Glyph</div><div class="cType">Face Down</div></div>`;
    elGlyphTray.appendChild(d);
  });
}

/* ---------- AI board ---------- */
function renderAiSlots(){
  elAiSlots.innerHTML='';
  for (let i=0;i<3;i++){
    const cell=document.createElement('div');
    cell.className='slotCell ai';
    const slot=G.state.ai.slots[i];
    if (slot && slot.c) cell.appendChild(makeCardEl(slot.c,'aiSlot'));
    else cell.innerHTML='<div class="emptyCell">Empty</div>';
    elAiSlots.appendChild(cell);
  }
}

/* ---------- counts ---------- */
function renderCounts(){
  $('#deckCount').textContent    = String(G.state.deck.length);
  $('#discardCount').textContent = String(G.state.disc.length);
}

/* ---------- full redraw ---------- */
function renderAll(){
  renderMarket();
  renderHand();
  renderPlayerSlots();
  renderAiSlots();
  renderCounts();
}

/* ---------- buttons ---------- */
function wireButtons(){
  $('#btnDraw')?.addEventListener('click', ()=>{ G.dispatch({type:'DRAW'}); renderAll(); });

  $('#btnEnd')?.addEventListener('click', async ()=>{
    await animateDiscardHand();
    G.dispatch({type:'END_TURN'});        // your reducer handles auto-discard / market slide
    // AI split turn
    G.dispatch({ type:'AI_DRAW' });
    G.dispatch({ type:'AI_PLAY_SPELL' });
    G.dispatch({ type:'AI_CHANNEL' });
    G.dispatch({ type:'AI_ADVANCE' });
    G.dispatch({ type:'AI_BUY' });
    G.dispatch({ type:'AI_SPEND_TRANCE' });
    // back to player
    G.dispatch({type:'START_TURN'});
    renderAll();
    await animateDrawHand();
  });

  $('#btnReset')?.addEventListener('click', ()=>{
    if (window.GameEngine?.create){
      window.game = G = window.GameEngine.create();
      renderAll();
    }
  });

  // deck / discard quick peeks (your modals can hook these IDs)
  $('#chipDeck')?.addEventListener('click', ()=>console.log('[Deck]', G.state.deck));
  $('#chipDiscard')?.addEventListener('click', ()=>console.log('[Discard]', G.state.disc));
}

/* ---------- init ---------- */
export function init(game){
  G = game;
  elRibbon      = $('.ribbon');
  elPlayerSlots = $('#playerSlots');
  elGlyphTray   = $('#glyphTray');
  elAiSlots     = $('#aiSlots');
  elMarketCells = $$('.marketCard');

  wireButtons();
  renderAll();

  // tell drag layer we’re ready
  if (window.DragCards?.refresh) window.DragCards.refresh();

  // hide boot check if present
  const boot = document.querySelector('.bootCheck'); if (boot) boot.style.display='none';

  console.log('[UI] v3.9+ — animations restored, typed highlights, fixed rows');
}

// Expose animation helpers for your classic boot if needed
window.animateDrawHand = animateDrawHand;
window.animateDiscardHand = animateDiscardHand;
