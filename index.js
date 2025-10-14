import {
  initState, snapshot, startOfTurn, endOfTurn,
  buyFromFlow, playCardToSpellSlot, setGlyphFromHand, discardForAether
} from "./GameLogic.js";

/* ------- helpers ------- */
const $ = (id)=> document.getElementById(id);
const el = (sel,root=document)=> root.querySelector(sel);

/* UI refs */
const aiSlotsEl      = $("ai-slots");
const playerSlotsEl  = $("player-slots");
const flowRowEl      = $("flow-row");
const flowCostRail   = $("flow-cost-rail");
const handEl         = $("hand");
const zoomOverlayEl  = $("zoom-overlay");
const zoomCardEl     = $("zoom-card");
const peekEl         = $("peek-card");

const playerGemCount = $("player-gem-count");
const aiGemCount     = $("ai-gem-count");
const playerHearts   = $("player-hearts");
const aiHearts       = $("ai-hearts");

const hudDiscard     = $("btn-discard-hud");
const hudDeck        = $("btn-deck-hud");
const hudDiscardCount= $("hud-discard-count");
const hudDeckCount   = $("hud-deck-count");

/* ------- state ------- */
let state = initState();
state = startOfTurn(state);

/* ------- icons ------- */
const gemSVG = '<svg viewBox="0 0 24 24" width="14" height="14" class="i-gem"><path fill="currentColor" d="M12 2l6 6-6 14L6 8l6-6z"/></svg>';
const heartSVG = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#f1a9a9" d="M12 21s-6.7-4.35-9.33-8.05C1.18 11.1 1 9.86 1 8.9 1 6.2 3.2 4 5.9 4c1.6 0 3.1.77 4.1 1.97C11 4.77 12.5 4 14.1 4 16.8 4 19 6.2 19 8.9c0 .96-.18 2.2-1.67 4.05C18.7 16.65 12 21 12 21z"/></svg>';

/* ------- utility ------- */
function renderHearts(container, n=5){
  container.replaceChildren();
  for (let i=0;i<n;i++){ const d=document.createElement("div"); d.innerHTML=heartSVG; container.appendChild(d.firstChild); }
}
function cardHTML(c){
  // replace :GEM: with inline icon
  const text = (c.text||"").replaceAll(":GEM:", `<span class="inline-gem">${gemSVG}</span>`);
  // pip dots
  const pips = c.pip? `<div class="pip-track">${Array.from({length:c.pip}).map(()=>'<span class="pip"></span>').join("")}</div>` : "";
  const aether = c.aetherValue>0 ? `<div class="aether-chip">${gemSVG}<span class="val">${c.aetherValue}</span></div>` : "";
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${c.cost?` — Cost ${gemSVG} ${c.cost}`:""}</div>
    <div class="textbox">${text}</div>
    ${pips}
    ${aether}
  `;
}

/* ------- layout hand (fan) ------- */
function layoutHand(){
  const cards = Array.from(handEl.children);
  const N = cards.length; if (!N) return;
  const MAX_ANGLE=24, MIN_ANGLE=6;
  const totalAngle = (N===1)?0:Math.min(MAX_ANGLE, MIN_ANGLE + (N-2)*2.4);
  const step = (N===1)?0: totalAngle/(N-1), startAngle=-totalAngle/2;
  const spread = Math.min(handEl.clientWidth*0.70, 880);
  const stepX = (N===1)?0: spread/(N-1), startX = -spread/2;
  cards.forEach((el,i)=>{
    const a = startAngle+step*i;
    const rad = a*Math.PI/180; const LIFT=34;
    const x = startX + stepX*i;
    const y = LIFT - Math.cos(rad)*(LIFT*0.78);
    el.style.setProperty('--tx',`${x}px`);
    el.style.setProperty('--ty',`${y}px`);
    el.style.setProperty('--rot',`${a}deg`);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
    el.style.zIndex = String(400+i);
  });
}

/* ------- drag & preview ------- */
let longPressTimer=null, pressStart={x:0,y:0};
const LONG_MS=350, MOVE_CANCEL=8;
function attachPeekAndZoom(el, card){
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ peekEl.innerHTML=cardHTML(card); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const t = ev.touches?.[0] || ev;
    pressStart={x:t.clientX,y:t.clientY};
    longPressTimer=setTimeout(()=>{
      if (zoomOverlayEl && zoomCardEl){
        zoomCardEl.innerHTML = cardHTML(card);
        zoomOverlayEl.setAttribute("data-open","true");
      }
    }, LONG_MS);
  };
  const cancel=()=>{ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } };
  const onMove=(ev)=>{ const t = ev.touches?.[0] || ev; if (Math.hypot(t.clientX-pressStart.x, t.clientY-pressStart.y)>MOVE_CANCEL) cancel(); };
  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", cancel, {passive:true});
  el.addEventListener("pointerleave", cancel, {passive:true});
  el.addEventListener("pointercancel", cancel, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
}
zoomOverlayEl?.addEventListener("click", ()=> zoomOverlayEl.setAttribute("data-open","false"));

function makeDraggable(el, card){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", card.id);
    ev.dataTransfer?.setData("text/card-type", card.type);
    const ghost = el.cloneNode(true); ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
    // pulse valid targets
    document.querySelectorAll(".slot").forEach(s=>{
      const ok = (card.type==="SPELL" && s.classList.contains("spell")) ||
                 (card.type==="GLYPH" && s.classList.contains("glyph"));
      if (ok) s.classList.add("pulse");
    });
    hudDiscard.classList.add("pulse","drop-ready");
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    document.querySelectorAll(".slot").forEach(s=> s.classList.remove("pulse","drag-over"));
    hudDiscard.classList.remove("pulse","drop-ready");
  });
}

/* ------- render pieces ------- */
function renderFlow(s){
  flowRowEl.replaceChildren();
  s.flowSlots.forEach((c,idx)=>{
    const li = document.createElement("li"); li.className="flow-card";
    const cardEl = document.createElement("article"); cardEl.className="card market";
    if (c){ cardEl.innerHTML = cardHTML(c); }
    else { cardEl.innerHTML = `<div class="title">Empty</div><div class="type">— Cost</div>`; }
    li.appendChild(cardEl);
    flowRowEl.appendChild(li);

    // click to buy
    cardEl.addEventListener("click", ()=>{
      try{
        state = buyFromFlow(state, "player", idx);
        // spotlight then bump discard counter
        cardEl.classList.add("spotlight");
        setTimeout(()=>{ render(); }, 160);
      }catch(err){ toast(err.message||"Can't buy"); }
    });
  });

  // cost rail
  flowCostRail.replaceChildren();
  (s.flowCosts||[]).forEach(cost=>{
    const c = document.createElement("div"); c.className="cell"; c.innerHTML = `${gemSVG} ${cost} to buy`; flowCostRail.appendChild(c);
  });
}

function renderSlots(container, slots, isPlayer){
  container.replaceChildren();
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell"; d.textContent="Spell Slot";
    if (isPlayer){
      d.addEventListener("dragover", (ev)=>{
        const t=ev.dataTransfer?.getData("text/card-type"); if (t==="SPELL"){ ev.preventDefault(); d.classList.add("drag-over"); }
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
        const id = ev.dataTransfer?.getData("text/card-id");
        const t  = ev.dataTransfer?.getData("text/card-type");
        if (t!=="SPELL") return;
        try{ state = playCardToSpellSlot(state,"player",id,i); render(); }
        catch(err){ toast(err.message||"Can't play"); }
      });
    }
    container.appendChild(d);
  }
  const g = document.createElement("div");
  g.className = "slot glyph"; g.textContent = "Glyph Slot";
  if (isPlayer){
    g.addEventListener("dragover", (ev)=>{ const t=ev.dataTransfer?.getData("text/card-type"); if (t==="GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); }});
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{
      ev.preventDefault(); g.classList.remove("drag-over");
      const id = ev.dataTransfer?.getData("text/card-id");
      const t  = ev.dataTransfer?.getData("text/card-type");
      if (t!=="GLYPH") return;
      try{ state = setGlyphFromHand(state,"player",id); render(); }
      catch(err){ toast(err.message||"Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

function renderHand(s){
  handEl.replaceChildren();
  const els=[];
  (s.players.player.hand||[]).forEach(card=>{
    const a = document.createElement("article"); a.className="card draw-in";
    a.dataset.cardId=card.id; a.dataset.cardType=card.type;
    a.innerHTML = cardHTML(card);
    attachPeekAndZoom(a, card);
    makeDraggable(a, card);
    handEl.appendChild(a); els.push(a);
  });
  layoutHand();
}

/* HUD discard / deck drop */
hudDiscard.addEventListener("dragover",(ev)=>{ ev.preventDefault(); hudDiscard.classList.add("drag-over"); });
hudDiscard.addEventListener("dragleave",()=> hudDiscard.classList.remove("drag-over"));
hudDiscard.addEventListener("drop",(ev)=>{
  ev.preventDefault(); hudDiscard.classList.remove("drag-over");
  const id = ev.dataTransfer?.getData("text/card-id");
  try{ state = discardForAether(state,"player",id); render(); }
  catch(err){ toast(err.message||"Can't discard"); }
});

/* ------- toast ------- */
let toastEl;
function toast(msg, ms=1100){
  if (!toastEl){ toastEl=document.createElement("div"); toastEl.className="toast"; document.body.appendChild(toastEl); }
  toastEl.textContent=msg; toastEl.classList.add("show"); setTimeout(()=> toastEl.classList.remove("show"), ms);
}

/* ------- main render ------- */
function render(){
  const s = snapshot(state);

  // portraits
  playerGemCount.textContent = String(s.players.player.aether||0);
  aiGemCount.textContent     = String(s.players.ai.aether||0);
  renderHearts(playerHearts, s.players.player.vitality);
  renderHearts(aiHearts,     s.players.ai.vitality);

  $("player-portrait").src = s.players.player.weaver.portrait;
  $("ai-portrait").src     = s.players.ai.weaver.portrait;
  $("player-name").textContent = s.players.player.weaver.name || "Player";
  $("ai-name").textContent     = s.players.ai.weaver.name || "Opponent";

  renderSlots(playerSlotsEl, s.players.player.slots, true);
  renderSlots(aiSlotsEl,     s.players.ai.slots, false);
  renderFlow(s);
  renderHand(s);

  // HUD counts
  hudDeckCount.textContent    = String(s.players.player.deckCount||0);
  hudDiscardCount.textContent = String(s.players.player.discardCount||0);
}

/* ------- turn wiring ------- */
$("btn-endturn-hud").addEventListener("click", ()=>{
  // animate hand discard
  Array.from(handEl.children).forEach(c=> c.classList.add("drop-void"));
  setTimeout(()=>{
    state = endOfTurn(state);
    state = startOfTurn(state);
    render();
  }, 320);
});

/* ------- init ------- */
window.addEventListener("resize", layoutHand);
document.addEventListener("DOMContentLoaded", render);
document.addEventListener("keydown", (e)=> { if (e.key==="Escape") zoomOverlayEl?.setAttribute("data-open","false"); });
