/* The Grey – restorative build (v2.53 baseline + fixes)
   – Restores prior look/feel
   – Aetherflow river: costs [4,3,3,2,2]
   – Draw & discard animations
   – Drag/drop with slot pulsing
   – Spotlight on purchase → fly to discard
   – Portrait HUD (hearts, big gem, Trance I/II)
   IMPORTANT: No text substitution; we DO NOT touch your Æ text anymore.
*/
(() => {
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  const wait = (ms)=>new Promise(r=>setTimeout(r,ms));
  const rand = (n)=>Math.floor(Math.random()*n);

  // SVGs (inline)
  const ICONS = {
    gem: `<svg viewBox="0 0 24 24" class="gem" aria-hidden="true"><path d="M12 2l5 4-5 16L7 6l5-4zM2 9l5-3 5 16-10-13zm20 0l-5-3-5 16 10-13z"/></svg>`,
    heart:`<svg viewBox="0 0 24 24"><path d="M12 21s-6.7-4.4-9.3-7C-0.7 11.1 1 6.3 5 6.3c2 0 3.4 1.1 4 2 0.6-0.9 2-2 4-2 4 0 5.7 4.8 2.3 7.7-2.6 2.6-9.3 7-9.3 7z"/></svg>`,
    dot:`<svg viewBox="0 0 8 8" class="pip"><circle cx="4" cy="4" r="3"/></svg>`
  };

  // ---------- Card Data (exactly as you specified earlier) ----------
  const BASE = [
    {n:"Pulse of the Grey",t:"SPELL",c:0,p:1,x:"On Resolve: Draw 1, Gain 1 Aether",av:0,q:3},
    {n:"Wispform Surge",t:"SPELL",c:0,p:1,x:"On Resolve: Advance another Spell for free",av:0,q:1},
    {n:"Greyfire Bloom",t:"SPELL",c:1,p:1,x:"On Resolve: Advance another Spell for free",av:0,q:1},
    {n:"Echoing Reservoir",t:"SPELL",c:0,p:1,x:"On Resolve: Channel 1",av:2,q:2},
    {n:"Dormant Catalyst",t:"SPELL",c:0,p:1,x:"On Resolve: Channel 2",av:1,q:1},
    {n:"Ashen Focus",t:"SPELL",c:0,p:1,x:"On Resolve: Channel 1 and Draw 1",av:1,q:1},
    {n:"Surge of Ash",t:"INSTANT",c:1,p:0,x:"Target Spell advances 1 step free",av:0,q:1},
    {n:"Veil of Dust",t:"INSTANT",c:1,p:0,x:"Prevent 1 damage or negate a hostile Instant",av:0,q:1},
    {n:"Glyph of Remnant Light",t:"GLYPH",c:0,p:0,x:"When a Spell resolves → Gain 1 Aether",av:0,q:1},
    {n:"Glyph of Returning Echo",t:"GLYPH",c:0,p:0,x:"When you Channel Aether → Draw 1 card",av:0,q:1},
  ];
  const FLOW = [
    {n:"Surge of Cinders",t:"INSTANT",c:2,p:0,x:"Deal 2 damage to any target",av:0},
    {n:"Pulse Feedback",t:"INSTANT",c:3,p:0,x:"Advance all Spells you control by 1",av:0},
    {n:"Refracted Will",t:"INSTANT",c:2,p:0,x:"Counter an Instant or negate a Glyph trigger",av:0},
    {n:"Aether Impel",t:"INSTANT",c:4,p:0,x:"Gain 3 Aether this turn",av:0},
    {n:"Cascade Insight",t:"INSTANT",c:3,p:0,x:"Draw 2 cards, then discard 1",av:0},
    {n:"Resonant Chorus",t:"SPELL",c:0,p:1,x:"On Resolve: Gain 2 Aether and Channel 1",av:1},
    {n:"Emberline Pulse",t:"SPELL",c:1,p:1,x:"On Resolve: Deal 2 damage and Draw 1",av:0},
    {n:"Fractured Memory",t:"SPELL",c:0,p:2,x:"On Resolve: Draw 2 cards",av:0},
    {n:"Obsidian Vault",t:"SPELL",c:0,p:1,x:"On Resolve: Channel 2 and Gain 1 Aether",av:1},
    {n:"Mirror Cascade",t:"SPELL",c:1,p:1,x:"On Resolve: Copy the next Instant you play this turn",av:0},
    {n:"Sanguine Flow",t:"SPELL",c:2,p:1,x:"On Resolve: Lose 1 Vitality, Gain 3 Aether",av:0},
    {n:"Glyph of Withering Light",t:"GLYPH",c:0,p:0,x:"When an opponent plays a Spell → They lose 1 Aether",av:0},
    {n:"Glyph of Vigilant Echo",t:"GLYPH",c:0,p:0,x:"At end of your turn → Channel 1",av:0},
    {n:"Glyph of Buried Heat",t:"GLYPH",c:0,p:0,x:"When you discard a card for Aether → Gain 1 extra Aether",av:0},
    {n:"Glyph of Soulglass",t:"GLYPH",c:0,p:0,x:"When you buy a card from Aether Flow → Draw 1 card",av:0},
  ];

  const expand = (L)=>L.flatMap(o=>Array.from({length:o.q??1},()=>({...o})));
  const shuffle = (a)=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};

  const S = {
    flow:[null,null,null,null,null],
    flowCosts:[4,3,3,2,2],
    flowDeck:[],
    player:{
      deck:[],hand:[],discard:[],aether:0,hearts:5,trance:0
    },
    ai:{
      deck:[],hand:[],discard:[],aether:0,hearts:5,trance:0
    },
    dragging:null
  };

  // ---------- Setup ----------
  function init(){
    S.player.deck = shuffle(expand(BASE));
    S.ai.deck     = shuffle(expand(BASE));
    S.flowDeck    = shuffle(FLOW.map(c=>({...c})));

    // Start flow with 1 card revealed
    revealNextFlow(true);
    draw(S.player,5,true);
    renderAll();

    $('#btn-endturn-hud')?.addEventListener('click', endTurn);
    document.addEventListener('pointerup', ()=>closePeek());
  }

  // ---------- Flow (river) ----------
  function revealNextFlow(initial=false){
    if(initial){ if(!S.flow[0]) S.flow[0] = drawFrom(S.flowDeck); return; }
    for(let i=0;i<S.flow.length;i++) if(!S.flow[i]){ S.flow[i] = drawFrom(S.flowDeck); break; }
  }
  function slideRiver(){
    for(let i=0;i<S.flow.length-1;i++) S.flow[i]=S.flow[i+1];
    S.flow[S.flow.length-1]=null;
  }

  // ---------- Draw / Discard ----------
  function drawFrom(deck){ return deck.length?deck.pop():null; }
  function draw(who,n,animate=false){
    for(let i=0;i<n;i++){
      if(!who.deck.length) who.deck=shuffle(who.discard.splice(0));
      const c = who.deck.pop(); if(!c) break;
      who.hand.push(c); if(animate) animateDraw(c);
    }
  }
  async function discardHand(who){
    $$('#hand .card').forEach(el=>el.classList.add('fall-fade'));
    await wait(280);
    who.discard.push(...who.hand.splice(0));
  }
  function animateDraw(card){
    const ghost = createCardEl(card,'ghost',0);
    ghost.classList.add('draw-arc');
    document.body.appendChild(ghost);
    setTimeout(()=>ghost.remove(),520);
  }

  // ---------- Turn flow ----------
  async function endTurn(){
    await discardHand(S.player);
    slideRiver();
    revealNextFlow();
    // simple AI tick
    draw(S.ai,1,false);
    S.ai.discard.push(...S.ai.hand.splice(0));
    // back to player
    draw(S.player,5,true); revealNextFlow();
    renderAll();
  }

  // ---------- Render ----------
  function renderAll(){
    renderPortraits();
    renderFlow();
    renderSlots('#player-slots',false);
    renderSlots('#ai-slots',true);
    renderHand();
  }

  function renderPortraits(){
    const sew = (row,who)=>{
      const host = $(`${row} .portrait`);
      if(!host) return;
      let hud = host.nextElementSibling;
      if(!hud || !hud.classList.contains('portrait-hud')){
        hud = document.createElement('div');
        hud.className='portrait-hud';
        host.after(hud);
      }
      hud.innerHTML = `
        <div class="hearts">${ICONS.heart.repeat(who.hearts)}</div>
        <div class="aether-display"><span class="gem-wrap">${ICONS.gem}</span><span class="val">${who.aether}</span></div>
        <div class="trance">
          <div class="tier ${who.trance>=1?'on':''}">I</div>
          <div class="tier ${who.trance>=2?'on':''}">II</div>
        </div>
      `;
    };
    sew('section.row.player', S.player);
    sew('section.row.ai', S.ai);
  }

  function renderSlots(sel,isAI){
    const row = $(sel); if(!row) return; row.innerHTML='';
    for(let i=0;i<3;i++) row.appendChild(makeSlot('Spell Slot','spell'));
    row.appendChild(makeSlot('Glyph Slot','glyph'));
    function makeSlot(label,kind){
      const d = document.createElement('div');
      d.className='slot'; d.dataset.slot=kind;
      d.innerHTML = `<div class="slot-label">${label}</div>`;
      d.addEventListener('dragenter',slotDragEnter);
      d.addEventListener('dragover',slotDragOver);
      d.addEventListener('dragleave',slotDragLeave);
      d.addEventListener('drop',slotDrop);
      return d;
    }
  }

  function renderFlow(){
    const row = $('#flow-row'); if(!row) return; row.innerHTML='';
    S.flow.forEach((c,i)=>{
      const wrap = document.createElement('div'); wrap.className='flow-card';
      if(!c){
        const e = document.createElement('div'); e.className='flow-empty';
        e.innerHTML = `<div class="slot-card">Empty<br><span class="muted">— Cost</span></div>`;
        wrap.appendChild(e);
      }else{
        wrap.appendChild(createCardEl(c,'flow',i));
        const bar = document.createElement('div'); bar.className='price-label';
        bar.innerHTML = `${ICONS.gem} ${S.flowCosts[i]} to buy`; // no stray characters
        wrap.appendChild(bar);
      }
      row.appendChild(wrap);
    });
  }

  function renderHand(){
    const area = $('#hand'); if(!area) return; area.innerHTML='';
    S.player.hand.forEach((c,idx)=> area.appendChild(createCardEl(c,'hand',idx)));
    fan(area);
  }

  // ---------- Cards ----------
  function createCardEl(card,zone,index){
    const el = document.createElement('div'); el.className='card';
    el.dataset.zone=zone; el.dataset.index=index;

    const pips = (card.p|0)>0 ? `<div class="pip-row">${Array(card.p).fill(ICONS.dot).join('')}</div>` : '';

    const chip = card.av>0 ? `
      <div class="aether-chip">
        ${ICONS.gem}<span class="val">${card.av}</span>
      </div>` : '';

    el.innerHTML = `
      <div class="title">${card.n}</div>
      <div class="type">${card.t}${card.c>0?` — Cost ${card.c}`:''}</div>
      <div class="separator"></div>
      ${pips}
      <div class="textbox">${card.x||''}</div>
      ${chip}
    `;

    if(zone==='hand'){
      el.setAttribute('draggable','true');
      el.addEventListener('dragstart',e=>cardDragStart(e,card,el));
      el.addEventListener('dragend',cardDragEnd);
      el.addEventListener('pointerdown',()=>peekTimer=window.setTimeout(()=>openPeek(card),350));
      el.addEventListener('pointerup',()=>{clearTimeout(peekTimer);closePeek();});
      el.addEventListener('pointerleave',()=>{clearTimeout(peekTimer);closePeek();});
    }else if(zone==='flow'){
      el.classList.add('clickable');
      el.addEventListener('click',()=>buyFromFlow(index,el,card));
    }
    return el;
  }

  // ---------- Peek ----------
  let peekTimer=null;
  function openPeek(card){
    let z = $('#zoom-overlay');
    if(!z){ z=document.createElement('div'); z.id='zoom-overlay'; document.body.appendChild(z); }
    z.innerHTML=''; const c = createCardEl(card,'peek',0); c.classList.add('zoom'); z.appendChild(c);
    z.dataset.open='true'; z.addEventListener('click',closePeek,{once:true});
  }
  function closePeek(){ const z=$('#zoom-overlay'); if(z) z.dataset.open='false'; }

  // ---------- Fan layout ----------
  function fan(container){
    const cards = $$('.card[data-zone="hand"]',container); const N=cards.length;
    if(!N) return;
    const spread = Math.min(40, 16+N*2), step = spread/Math.max(N-1,1), start=-spread/2;
    cards.forEach((el,i)=>{ const a=start+step*i; el.style.setProperty('--rot',`${a}deg`); el.style.zIndex=100+i; })
  }

  // ---------- Drag & Drop ----------
  function cardDragStart(e,card,el){
    S.dragging={card,el};
    el.classList.add('dragging');
    const targets = (card.t==='GLYPH') ? $$('.slot[data-slot="glyph"]') : $$('.slot[data-slot="spell"]');
    targets.forEach(t=>t.classList.add('drop-ready'));
    try{ e.dataTransfer.setData('text/plain',card.n); }catch{}
  }
  function cardDragEnd(){
    if(S.dragging) S.dragging.el.classList.remove('dragging');
    $$('.slot.drop-ready').forEach(s=>s.classList.remove('drop-ready'));
    S.dragging=null;
  }
  function slotDragEnter(e){ if(this.classList.contains('drop-ready')){e.preventDefault(); this.classList.add('drag-over');} }
  function slotDragOver(e){ if(this.classList.contains('drop-ready')) e.preventDefault(); }
  function slotDragLeave(){ this.classList.remove('drag-over'); }
  function slotDrop(e){
    e.preventDefault(); this.classList.remove('drag-over');
    if(!S.dragging) return;
    const {card}=S.dragging, kind=this.dataset.slot;
    if((card.t==='GLYPH' && kind!=='glyph') || (card.t!=='GLYPH' && kind!=='spell')) return;
    // play = remove from hand
    const i=S.player.hand.indexOf(card); if(i>=0) S.player.hand.splice(i,1);
    this.classList.add('slotted'); setTimeout(()=>this.classList.remove('slotted'),600);
    renderHand();
    cardDragEnd();
  }

  // ---------- Buying from Flow ----------
  async function buyFromFlow(i,el,card){
    const price=S.flowCosts[i]; if(S.player.aether<price) return;
    S.player.aether-=price; flashAether();
    el.classList.add('spotlight'); await wait(420); el.classList.add('fly-to-discard'); await wait(300);
    S.player.discard.push(card); S.flow[i]=null; renderPortraits(); renderFlow();
  }
  function flashAether(){
    const wrap=$('section.row.player .aether-display'); if(!wrap) return;
    wrap.classList.remove('flash'); void wrap.offsetWidth; wrap.classList.add('flash');
  }

  // ---------- Boot ----------
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
