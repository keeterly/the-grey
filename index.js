import {
  initState, serializePublic,
  playCardToSpellSlot, setGlyphFromHand, buyFromFlow
} from "./GameLogic.js";

/* ------- helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

/* elements */
const startBtn      = $("btn-start-turn");
const endBtn        = $("btn-end-turn");
const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");
const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");

/* preview / zoom */
const peekEl        = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl    = $("zoom-card");

/* SVGs */
const GEM_SVG = `<svg class="gem" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 8 20l8 32h32l8-32L32 4z"/></svg>`;
const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.01 21s-5.42-3.63-8.2-6.41C.74 11.52 1.54 6.9 5.24 6.1c1.9-.41 3.53.48 4.59 1.83 1.06-1.35 2.7-2.24 4.59-1.83 3.7.8 4.5 5.42 1.43 8.49-2.78 2.78-8.2 6.41-8.2 6.41z"/></svg>`;

/* state */
let state = initState({});

/* ------- toast ------- */
let toastEl;
function toast(msg, ms=1200){
  if (!toastEl){
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), ms);
}

/* ------- hand fanning ------- */
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 24, MIN_ANGLE = 6, MAX_SPREAD_PX = container.clientWidth * 0.72, LIFT_BASE = 42;
  const totalAngle = (N===1) ? 0 : clamp(MIN_ANGLE + (N-2)*2.6, MIN_ANGLE, MAX_ANGLE);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;
  const spread = Math.min(MAX_SPREAD_PX, 860);
  const stepX = (N===1) ? 0 : spread/(N-1), startX = -spread/2;

  cards.forEach((el,i)=>{
    const a = startAngle + step*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    const y = LIFT_BASE - Math.cos(rad) * (LIFT_BASE*0.8);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ------- preview / zoom ------- */
function closeZoom(){ if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open","false"); }
function fillCardShell(div, data){
  if (!div) return;
  data = data || {};
  const gemChip = (data.aetherValue && data.aetherValue>0)
    ? `<div class="aether-chip">${GEM_SVG}<span class="val">${data.aetherValue}</span></div>`
    : "";
  const pips = (data.pip && data.pip>0)
    ? `<div class="pip-track">${Array.from({length:data.pip}).map(()=>`<span class="pip"></span>`).join("")}</div>` : "";
  div.innerHTML = `
    <div class="title">${data.name||""}</div>
    <div class="type">${data.type||""}${(typeof data.price==='number'&&data.price>0)?` — Cost `:""}</div>
    <div class="textbox">${(data.text||"")}</div>
    ${gemChip}${pips}
  `;
}
let longPressTimer=null, pressStart={x:0,y:0};
const LONG_PRESS_MS=350, MOVE_CANCEL_PX=8;
function attachPeekAndZoom(el, data){
  if (peekEl){
    el.addEventListener("mouseenter", ()=>{ fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", ()=>{ peekEl.classList.remove("show"); });
  }
  const onDown = (ev)=>{
    if (longPressTimer) clearTimeout(longPressTimer);
    const t = ev.clientX!==undefined?ev:(ev.touches?.[0]??{clientX:0,clientY:0});
    pressStart = {x:t.clientX,y:t.clientY};
    longPressTimer = setTimeout(()=>{
      if (zoomOverlayEl && zoomCardEl){
        fillCardShell(zoomCardEl, data);
        zoomOverlayEl.setAttribute("data-open","true");
      }
    }, LONG_PRESS_MS);
  };
  const clearLP = ()=>{ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } };
  const onMove = (ev)=>{
    const t = ev.clientX!==undefined?ev:(ev.touches?.[0]??{clientX:0,clientY:0});
    if (Math.hypot(t.clientX-pressStart.x, t.clientY-pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };
  el.addEventListener("pointerdown", onDown, {passive:true});
  el.addEventListener("pointerup", clearLP, {passive:true});
  el.addEventListener("pointerleave", clearLP, {passive:true});
  el.addEventListener("pointercancel", clearLP, {passive:true});
  el.addEventListener("pointermove", onMove, {passive:true});
  el.addEventListener("dragstart", clearLP);
}
zoomOverlayEl?.addEventListener("click", closeZoom);

/* ------- drag + “hold to highlight” ------- */
function wireDesktopDrag(el, data){
  el.draggable = true;

  // highlight while holding (mobile & desktop)
  const holdOn = ()=> pulseDropTargets(data.type, true);
  const holdOff = ()=> pulseDropTargets(data.type, false);
  el.addEventListener("pointerdown", holdOn, {passive:true});
  el.addEventListener("pointerup", holdOff, {passive:true});
  el.addEventListener("pointerleave", holdOff, {passive:true});
  el.addEventListener("pointercancel", holdOff, {passive:true});

  // classic drag
  el.addEventListener("dragstart", (ev)=>{
    el.classList.add("dragging");
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    const ghost = el.cloneNode(true);
    ghost.style.position="fixed"; ghost.style.left="-9999px"; ghost.style.top="-9999px";
    document.body.appendChild(ghost);
    ev.dataTransfer?.setDragImage(ghost, ghost.clientWidth/2, ghost.clientHeight*0.9);
    setTimeout(()=> ghost.remove(), 0);
    pulseDropTargets(data.type, true);
  });
  el.addEventListener("dragend", ()=>{
    el.classList.remove("dragging");
    pulseDropTargets(data.type, false);
  });
}
function pulseDropTargets(cardType, on){
  const valids = [];
  if (cardType==="SPELL") valids.push(...document.querySelectorAll('#player-slots .slot.spell'));
  if (cardType==="GLYPH") valids.push(...document.querySelectorAll('#player-slots .slot.glyph'));
  const discardBtn = document.querySelector('[data-role="discard"]');
  if (discardBtn) { on ? discardBtn.classList.add('drop-ready') : discardBtn.classList.remove('drop-ready'); }
  valids.forEach(el=> on ? el.classList.add("drop-ready") : el.classList.remove("drop-ready"));
}

/* ------- slots ------- */
function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const slot = safe[i] || {hasCard:false, card:null};
    d.textContent = slot.hasCard ? (slot.card?.name || "Spell") : "Spell Slot";

    if (slot.hasCard && slot.card){
      attachPeekAndZoom(d, slot.card);
    }

    if (isPlayer){
      d.addEventListener("dragover", (ev)=> { 
        const t = ev.dataTransfer?.getData("text/card-type");
        if (t==="SPELL"){ ev.preventDefault(); d.classList.add("drop-ready"); }
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drop-ready"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drop-ready");
        const cardId   = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL") return;
        try { state = playCardToSpellSlot(state, "player", cardId, i); render(); }
        catch(err){ toast(err?.message || "Can't play"); }
      });
    }
    container.appendChild(d);
  }
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphSlot = safe[3] || {isGlyph:true, hasCard:false, card:null};
  g.textContent = glyphSlot.hasCard ? (glyphSlot.card?.name || "Glyph") : "Glyph Slot";

  if (glyphSlot.hasCard && glyphSlot.card){
    attachPeekAndZoom(g, glyphSlot.card);
  }

  if (isPlayer){
    g.addEventListener("dragover", (ev)=> {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH"){ ev.preventDefault(); g.classList.add("drop-ready"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drop-ready"));
    g.addEventListener("drop", (ev)=>{ 
      ev.preventDefault(); g.classList.remove("drop-ready"); 
      const cardId = ev.dataTransfer?.getData("text/card-id");
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t!=="GLYPH") return;
      try { state = setGlyphFromHand(state, "player", cardId); render(); }
      catch(err){ toast(err?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ------- flow ------- */
function cardHTML(c={}){
  const gemChip = (c.aetherValue && c.aetherValue>0)
    ? `<div class="aether-chip"><svg class="gem" viewBox="0 0 64 64"><path d="M32 4 8 20l8 32h32l8-32L32 4z"/></svg><span class="val">${c.aetherValue}</span></div>` : "";
  const pips = (c.pip && c.pip>0)
    ? `<div class="pip-track">${Array.from({length:c.pip}).map(()=>`<span class="pip"></span>`).join("")}</div>` : "";
  return `
    <div class="title">${c.name||""}</div>
    <div class="type">${c.type||""}${(typeof c.price==='number'&&c.price>0)?` — Cost `:""}</div>
    <div class="textbox">${c.text||""}</div>
    ${gemChip}${pips}
  `;
}
function renderFlow(flowArray){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  const COST_LABELS = [4,3,3,2,2];
  (flowArray || []).slice(0,5).forEach((raw, idx)=>{
    const c = raw || {}; // guard
    const li = document.createElement("li"); li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c);
    attachPeekAndZoom(card, c);

    card.addEventListener("click", ()=>{
      try{
        state = buyFromFlow(state, "player", idx);
        toast("Bought to discard");
        spotlightBuy(card);
      }catch(err){ toast(err?.message || "Cannot buy"); }
    });

    li.appendChild(card);
    const label = document.createElement("div");
    label.className = "price-label";
    label.textContent = `${COST_LABELS[idx]} to buy`;
    li.appendChild(label);

    flowRowEl.appendChild(li);
  });
}

/* spotlight buy animation */
function spotlightBuy(sourceEl){
  const rect = sourceEl.getBoundingClientRect();
  const clone = sourceEl.cloneNode(true);
  clone.style.position="fixed";
  clone.style.left = rect.left+"px"; clone.style.top = rect.top+"px";
  clone.style.transform = "none"; clone.style.zIndex = "9999";
  document.body.appendChild(clone);
  requestAnimationFrame(()=>{
    clone.style.transition = "transform .32s ease, opacity .32s ease";
    clone.style.transform = `translate(${window.innerWidth/2 - rect.left - rect.width/2}px, ${window.innerHeight/2 - rect.top - rect.height/2}px) scale(1.2)`;
    setTimeout(()=>{
      const discardBtn = document.querySelector('[data-role="discard"]') || {getBoundingClientRect:()=>({left:window.innerWidth-40,top:window.innerHeight-40})};
      const drect = discardBtn.getBoundingClientRect();
      clone.style.transform = `translate(${drect.left - rect.left}px, ${drect.top - rect.top}px) scale(.25) rotate(10deg)`;
      clone.style.opacity = "0";
      setTimeout(()=> clone.remove(), 360);
    }, 360);
  });
}

/* ------- portrait augments ------- */
function ensurePortraitAugments(){
  const pFig = playerPortrait?.closest(".portrait");
  const aiFig = aiPortrait?.closest(".portrait");
  [pFig, aiFig].forEach(fig=>{
    if (!fig) return;
    Array.from(fig.childNodes).forEach(n=>{
      if (n.nodeType===Node.TEXT_NODE && /trance/i.test(n.textContent||"")) n.remove();
      if (n.nodeType===Node.ELEMENT_NODE && /trance/i.test(n.textContent||"")) n.style.display="none";
    });
    if (!fig.querySelector(".hearts")) {
      const hearts = document.createElement("div"); hearts.className="hearts"; fig.appendChild(hearts);
    }
    if (!fig.querySelector(".aether-display")){
      const ad = document.createElement("div"); ad.className="aether-display";
      ad.innerHTML = `${GEM_SVG}<span class="val">0</span>`;
      fig.appendChild(ad);
    }
    if (!fig.querySelector(".trance-stack")){
      const ts = document.createElement("div"); ts.className="trance-stack";
      ts.innerHTML = `
        <div class="trance t1"><span class="diamond"></span><span>I</span></div>
        <div class="trance t2"><span class="diamond"></span><span>II</span></div>`;
      fig.appendChild(ts);
    }
  });
}
function drawHearts(container, n=5){
  if (!container) return;
  container.innerHTML = Array.from({length:n}).map(()=>HEART_SVG).join("");
}
function setAether(container, val){
  if (!container) return;
  const v = container.querySelector(".val"); if (v) v.textContent = String(val ?? 0);
}
function setTrance(fig, level=0){
  const t1 = fig.querySelector(".trance.t1"), t2 = fig.querySelector(".trance.t2");
  [t1,t2].forEach(el=> el && el.classList.remove("active"));
  if (level>=1 && t1) t1.classList.add("active");
  if (level>=2 && t2) t2.classList.add("active");
}

/* ------- turn animations ------- */
function animateDrawNewCards(){
  Array.from(handEl?.children||[]).forEach(el=> el.classList.add("draw-anim"));
  setTimeout(()=> Array.from(handEl?.children||[]).forEach(el=> el.classList.remove("draw-anim")), 450);
}
function animateDiscardHand(){
  Array.from(handEl?.children||[]).forEach((el,i)=>{
    setTimeout(()=> el.classList.add("discard-anim"), i*40);
  });
  setTimeout(()=> { Array.from(handEl?.children||[]).forEach(el=> el.classList.remove("discard-anim")); }, 600);
}

/* ------- safety / render ------- */
function ensureSafetyShape(s){
  if (!Array.isArray(s.flow) || s.flow.length===0){
    s.flow = [null,null,null,null,null];
  }
  if (!s.player) s.player = {vitality:5,aether:0,channeled:0,hand:[],slots:[]};
  if (!Array.isArray(s.player.slots) || s.player.slots.length<4){
    s.player.slots = [{hasCard:false,card:null},{hasCard:false,card:null},{hasCard:false,card:null},{isGlyph:true,hasCard:false,card:null}];
  }
  if (!s.ai) s.ai = {vitality:5,weaver:{name:"Opponent"},aether:0,channeled:0,slots:[{},{},{},{isGlyph:true}]};
  return s;
}

/* robust portrait loader with fallback */
function setPortrait(imgEl, primary, fallback, flipped=false){
  if (!imgEl) return;
  imgEl.onerror = ()=> { imgEl.onerror = null; imgEl.src = fallback; };
  imgEl.src = primary;
  imgEl.style.transform = flipped ? "scaleX(-1)" : "";
}

function render({drawAnimation=false}={}){
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  let s = ensureSafetyShape(serializePublic(state) || {});
  ensurePortraitAugments();

  // portraits with fallback to the existing jpgs
  setPortrait(playerPortrait, "./weaver_aria_Portrait.jpg", "./weaver_aria.jpg", false);
  setPortrait(aiPortrait,     "./weaver_morr_Portrait.jpg", "./weaver_morr.jpg", true);

  set(playerName, el=> el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,     el=> el.textContent = s.ai?.weaver?.name || "Opponent");

  // hearts & aether
  drawHearts(playerPortrait?.closest(".portrait")?.querySelector(".hearts"), s.player?.vitality ?? 5);
  drawHearts(aiPortrait?.closest(".portrait")?.querySelector(".hearts"),     s.ai?.vitality ?? 5);
  setAether(playerPortrait?.closest(".portrait")?.querySelector(".aether-display"), s.player?.aether ?? 0);
  setAether(aiPortrait?.closest(".portrait")?.querySelector(".aether-display"),     s.ai?.aether ?? 0);
  setTrance(playerPortrait.closest(".portrait"), s.player?.trance ?? 0);
  setTrance(aiPortrait.closest(".portrait"),     s.ai?.trance ?? 0);

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);
  renderFlow(s.flow);

  // hand
  if (handEl){
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c=>{
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const intrinsicCost = (c.cost || 0);
      const costGems = intrinsicCost>0 ? "🜂".repeat(intrinsicCost) : "";
      const gemChip = (c.aetherValue && c.aetherValue>0)
        ? `<div class="aether-chip">${GEM_SVG}<span class="val">${c.aetherValue}</span></div>` : "";
      const pips = (c.pip && c.pip>0)
        ? `<div class="pip-track">${Array.from({length:c.pip}).map(()=>`<span class="pip"></span>`).join("")}</div>` : "";

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="textbox">${c.text||""}</div>
        ${intrinsicCost? `<div class="cost">${costGems}</div>` : ""}
        ${gemChip}${pips}
      `;

      wireDesktopDrag(el, c);
      attachPeekAndZoom(el, c);
      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
    if (drawAnimation) animateDrawNewCards();
  }
}

/* wiring */
startBtn?.addEventListener("click", ()=>{ render({drawAnimation:true}); });
endBtn?.addEventListener("click", ()=>{
  animateDiscardHand();
  toast("End turn");
});

window.addEventListener("resize", ()=> layoutHand(handEl, Array.from(handEl?.children || [])));
document.addEventListener("keydown", (e)=> { if (e.key === "Escape") closeZoom(); });

document.addEventListener("DOMContentLoaded", ()=> render({drawAnimation:true}));
