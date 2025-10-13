// index.js — v2.51 UI Patch
(() => {
  const { initState, buyFromFlow } = window.GameLogic || {};
  let state = initState ? initState() : { flow:[], player:{}, ai:{} };

  // ==== Elements
  const flowRowEl   = document.getElementById("flow-row");
  const handEl      = document.getElementById("hand");
  const aiSlotsEl   = document.getElementById("ai-slots");
  const plSlotsEl   = document.getElementById("player-slots");
  const toastsEl    = document.getElementById("toasts");
  const btnEndTurn  = document.getElementById("btn-endturn-hud");

  // ==== Helpers
  function toast(msg){
    if (!toastsEl) return;
    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = msg;
    toastsEl.appendChild(div);
    setTimeout(()=> div.remove(), 1600);
  }

  function getAetherValue(card){
    return (typeof card?.aetherValue === "number") ? card.aetherValue : 0;
  }
  function getPipRequirement(card){
    const t = (card?.text || "").toString();
    const m = t.match(/Advance\s+(\d+)/i);
    const n = m ? parseInt(m[1], 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }
  function pipTrackHTML(req, cur=0){
    if (!req || req < 1) return "";
    const safeCur = Math.max(0, Math.min(cur|0, req));
    let dots = "";
    for (let i=0;i<req;i++){
      const filled = i < safeCur ? "filled" : "";
      dots += `<span class="pip ${filled}"></span>`;
    }
    return `<div class="pip-track" aria-label="Pip track (${safeCur}/${req})">${dots}</div>`;
  }
  function aetherChipHTML(val){
    if (!val || val < 1) return "";
    return `<div class="aether-chip" title="Aether gained when discarded">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L22 21H2L12 3Z" fill="currentColor"/></svg>
      <span class="val">${val}</span></div>`;
  }

  // Card shell
  function cardHTML(c){
    const price = (typeof c.price === "number") ? c.price : 0;
    const gems = "🜂".repeat(price);
    const aetherVal = getAetherValue(c);
    const pipReq = getPipRequirement(c);
    const pipCur = c.currentPips || 0; // engine may set later
    return `
      <div class="title">${c.name || "Unnamed"}</div>
      <div class="type">${c.type || ""}${price?` — Cost Æ ${price}`:""}</div>
      <div class="textbox">${c.text||""}</div>
      <div class="cost">${gems}</div>
      ${aetherChipHTML(aetherVal)}
      ${pipTrackHTML(pipReq, pipCur)}
    `;
  }

  function renderFlow(flowArray){
    if (!flowRowEl) return;
    flowRowEl.replaceChildren();
    (flowArray || []).slice(0,5).forEach((c, idx)=>{
      const li = document.createElement("li"); li.className = "flow-card";
      const card = document.createElement("article");
      card.className = "card market";
      card.dataset.flowIndex = String(idx);
      card.innerHTML = cardHTML(c);

      // click to buy
      card.addEventListener("click", (e)=>{
        if (e.target.closest(".card")){
          try{
            state = buyFromFlow(state, "player", idx);
            toast("Bought to discard");
            renderAll();
          }catch(err){
            toast(err?.message || "Cannot buy");
          }
        }
      });

      li.appendChild(card);
      // numeric label beneath card
      const label = document.createElement("div");
      label.className = "price-label";
      label.textContent = `Æ ${c.price ?? 0} to buy`;
      li.appendChild(label);
      flowRowEl.appendChild(li);
    });
  }

  function renderSlots(el, slots){
    el.replaceChildren();
    (slots||[]).forEach((c, i)=>{
      const slot = document.createElement("div");
      slot.className = "card slot";
      if (c){
        slot.innerHTML = cardHTML(c);
      }else{
        slot.innerHTML = `
          <div class="title" style="opacity:.6">Empty</div>
          <div class="type">SPELL/GLYPH</div>`;
      }
      el.appendChild(slot);
    });
  }

  function renderHand(hand){
    handEl.replaceChildren();
    (hand||[]).forEach(c=>{
      const el = document.createElement("div");
      el.className = "card in-hand";
      el.innerHTML = cardHTML(c);
      handEl.appendChild(el);
    });
  }

  function renderAll(){
    renderFlow(state.flow);
    renderSlots(aiSlotsEl, state.ai.slots);
    renderSlots(plSlotsEl, state.player.slots);
    renderHand(state.player.hand);
  }

  // ==== HUD
  btnEndTurn?.addEventListener("click", ()=>{
    state.turn += 1;
    state.active = (state.active === "player") ? "ai" : "player";
    toast(`End Turn → Turn ${state.turn} — ${state.active}`);
  });

  // Boot
  renderAll();
})();
