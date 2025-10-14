import {
  initState, serializePublic, startTurn, endTurn,
  playCardToSpellSlot, setGlyphFromHand, buyFromFlow, discardForAether
} from "./GameLogic.js";

/* ------- dom helpers ------- */
const $ = id => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

/* ------- mount points ------- */
const aiSlotsEl     = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl     = $("flow-row");
const handEl        = $("hand");
const playerPortrait= $("player-portrait");
const aiPortrait    = $("ai-portrait");
const playerName    = $("player-name");
const aiName        = $("ai-name");
const playerHUD     = $("player-hud");
const aiHUD         = $("ai-hud");
const turnBtn       = $("btn-end-turn");

/* ------- state ------- */
let state = initState();
state = startTurn(state); // reveal first flow card on load

/* ------- icons ------- */
const GEM_SVG = `<svg viewBox="0 0 24 24" class="gem"><path d="M12 2 3 9l9 13 9-13-9-7Z"/></svg>`;
const HEART_RUNE = `❤`;

/* ------- text helpers (inline gem replace) ------- */
function withInlineGem(str=""){
  return (str||"").replaceAll(":GEM:", GEM_SVG);
}

/* ------- card shell ------- */
function cardHTML(c){
  if (!c) return `<div class="card empty"><div class="type">Empty</div></div>`;
  const price = (typeof c.cost === "number") ? c.cost : 0;
  const pip = Math.max(0, c.pip || 0);
  const aether = Math.max(0, c.aetherValue || 0);
  const pips = pip ? `<div class="pip-track">${Array(pip).fill(0).map(()=>`<span class="pip"></span>`).join("")}</div>` : "";
  const chip = aether ? `<div class="aether-chip">${GEM_SVG}<span class="val">${aether}</span></div>` : "";
  return `
    <div class="title">${c.name}</div>
    <div class="type">${c.type}${price?` — Cost ${GEM_SVG} ${price}`:""}</div>
    <div class="textbox">${withInlineGem(c.text)}</div>
    ${pips}${chip}
  `;
}

/* ------- hand fanning (MTGArena-style tighter fan) ------- */
function layoutHand(container) {
  const cards = Array.from(container?.children || []);
  const N = cards.length; if (!N) return;
  const MAX_ANGLE = 18;
  const totalAngle = (N===1) ? 0 : Math.min(MAX_ANGLE, 4 + (N-2)*2);
  const step = (N===1) ? 0 : totalAngle/(N-1), startAngle = -totalAngle/2;

  const spread = Math.min(container.clientWidth*0.72, 620);
  const stepX = (N===1) ? 0 : spread/(N-1), startX = -spread/2;
  const baseLift = 42;

  cards.forEach((el,i)=>{
    const a = startAngle + step*i;
    const rad = a*Math.PI/180;
    const x = startX + stepX*i;
    const y = baseLift - Math.cos(rad) * (baseLift*0.78);
    el.style.zIndex = String(400+i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ------- pulse highlight helpers ------- */
let draggingType = null;
function setPulseTargets(on) {
  document.querySelectorAll(".slot").forEach(el=>{
    const isGlyph = el.classList.contains("glyph");
    const ok = (draggingType==="SPELL" && !isGlyph) || (draggingType==="GLYPH" && isGlyph);
    if (on && ok) el.classList.add("pulse"); else el.classList.remove("pulse");
  });
  const discardBtn = document.querySelector("[data-role='discard']");
  if (discardBtn) {
    if (on && draggingType) discardBtn.classList.add("drop-ready");
    else discardBtn.classList.remove("drop-ready");
  }
}

/* ------- drag helpers ------- */
function wireDrag(el, data){
  el.draggable = true;
  el.addEventListener("dragstart", (ev)=>{
    draggingType = data.type;
    setPulseTargets(true);
    ev.dataTransfer?.setData("text/card-id", data.id);
    ev.dataTransfer?.setData("text/card-type", data.type);
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", ()=>{
    draggingType = null;
    setPulseTargets(false);
    el.classList.remove("dragging");
  });
}

/* ------- slots (player/ai) ------- */
function renderSlots(container, snapshot, isPlayer){
  if (!container) return;
  container.replaceChildren();
  const safe = Array.isArray(snapshot) ? snapshot : [];
  // 3 spell + 1 glyph
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);
    const slot = safe[i] || {hasCard:false, card:null};
    if (slot.hasCard && slot.card){
      d.classList.add("occupied");
      d.innerHTML = `<article class="card">${cardHTML(slot.card)}</article>`;
    } else {
      d.textContent = "Spell Slot";
    }

    if (isPlayer){
      d.addEventListener("dragover", (ev)=> {
        const t = ev.dataTransfer?.getData("text/card-type");
        if (t==="SPELL"){ ev.preventDefault(); d.classList.add("drag-over"); }
      });
      d.addEventListener("dragleave", ()=> d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev)=>{
        ev.preventDefault(); d.classList.remove("drag-over");
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
  if (glyphSlot.hasCard && glyphSlot.card){
    g.classList.add("occupied");
    g.innerHTML = `<article class="card">${cardHTML(glyphSlot.card)}</article>`;
  } else {
    g.textContent = "Glyph Slot";
  }

  if (isPlayer){
    g.addEventListener("dragover", (ev)=> {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t==="GLYPH"){ ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", ()=> g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev)=>{
      ev.preventDefault(); g.classList.remove("drag-over");
      const cardId   = ev.dataTransfer?.getData("text/card-id");
      const t        = ev.dataTransfer?.getData("text/card-type");
      if (t!=="GLYPH") return;
      try { state = setGlyphFromHand(state, "player", cardId); render(); }
      catch(err){ toast(err?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ------- flow row ------- */
function renderFlow(flowArray){
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flowArray || new Array(5).fill(null)).slice(0,5).forEach((c, idx)=>{
    const li = document.createElement("li"); li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = c ? cardHTML(c) : `<div class="type">Empty</div>`;

    if (c){
      card.addEventListener("click", ()=>{
        const cost = (serializePublic(state).flowCosts||[])[idx]||0;
        try {
          const res = buyFromFlow(state, "player", idx);
          state = res.state;
          toast(`Bought for ${cost}`);
          render();
        } catch (e) {
          toast(e.message || "Can't buy");
        }
      });
    }

    const price = (serializePublic(state).flowCosts||[])[idx]||0;
    const priceLbl = document.createElement("div");
    priceLbl.className = "price-label";
    priceLbl.innerHTML = `${GEM_SVG} ${price} to buy`;

    li.appendChild(card);
    li.appendChild(priceLbl);
    flowRowEl.appendChild(li);
  });
}

/* ------- hand render ------- */
function renderHand(cards){
  if (!handEl) return;
  handEl.replaceChildren();
  (cards||[]).forEach(c=>{
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.cardId = c.id; el.dataset.cardType = c.type;
    el.innerHTML = cardHTML(c);
    wireDrag(el, c);
    handEl.appendChild(el);
  });
  layoutHand(handEl);
}

/* ------- HUD (hearts / gem / trance) ------- */
function renderHUD(sideEl, P, flipped=false){
  if (!sideEl || !P) return;
  sideEl.innerHTML = `
    <div class="hearts">${Array(STARTING_VITALITY).fill(0).map((_,i)=>`<span class="heart ${i<P.vitality?"on":""}">${HEART_RUNE}</span>`).join("")}</div>
    <div class="hud-gem">${GEM_SVG}<span>${P.aether|0}</span></div>
    <div class="trance-stack">
      <div class="diamond ${P.trance?.level>=1?"on":""}">I</div>
      <div class="diamond ${P.trance?.level>=2?"on":""}">II</div>
    </div>
  `;
  if (flipped) sideEl.classList.add("flip");
  else sideEl.classList.remove("flip");
}

/* ------- toast ------- */
let toastEl;
function toast(msg, ms=1100){
  if (!toastEl){
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), ms);
}

/* ------- discard drop target ------- */
(function wireDiscard(){
  const discardBtn = document.querySelector("[data-role='discard']");
  if (!discardBtn) return;
  discardBtn.addEventListener("dragover",(ev)=>{ ev.preventDefault(); discardBtn.classList.add("drag-over"); });
  discardBtn.addEventListener("dragleave",()=> discardBtn.classList.remove("drag-over"));
  discardBtn.addEventListener("drop",(ev)=>{
    ev.preventDefault(); discardBtn.classList.remove("drag-over");
    const cardId = ev.dataTransfer?.getData("text/card-id");
    if (!cardId) return;
    try {
      const { gain } = discardForAether(state, "player", cardId);
      toast(`+${gain} Aether`);
      render();
    } catch (e) { toast(e.message||"Can't discard"); }
  });
})();

/* ------- render root ------- */
function render(){
  const s = serializePublic(state);

  set(playerPortrait, el => el.src = s.player?.weaver?.portrait || "./weaver_aria_Portrait.jpg");
  set(aiPortrait,     el => el.src = s.ai?.weaver?.portrait     || "./weaver_morr_Portrait.jpg");
  set(playerName,     el => el.textContent = s.player?.weaver?.name || "Player");
  set(aiName,         el => el.textContent = s.ai?.weaver?.name || "Opponent");

  renderSlots(playerSlotsEl, s.player?.slots || [], true);
  renderSlots(aiSlotsEl,     s.ai?.slots     || [], false);
  renderFlow(s.flow);
  renderHand(s.player?.hand || []);
  renderHUD(playerHUD, s.player, false);
  renderHUD(aiHUD, s.ai, true);
}

/* ------- controls ------- */
turnBtn?.addEventListener("click", ()=>{
  // player end → river shift → AI (stub) → player start reveal
  state = endTurn(state);
  // AI stub can be extended later
  state = endTurn(state); // switch back to player
  state = startTurn(state); // reveal new card into flow
  render();
});

/* ------- init ------- */
document.addEventListener("DOMContentLoaded", render);
window.addEventListener("resize", ()=> layoutHand(handEl));
