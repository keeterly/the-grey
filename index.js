// index.js — v2.5 (glyph-enabled UI)

import { initState, serializePublic, reducer } from "./GameLogic.js";

/* ------- small DOM helpers ------- */
const $ = (id) => document.getElementById(id);
const set = (el, fn) => { if (el) fn(el); };

const startBtn = $("btn-start-turn");
const endBtn = $("btn-end-turn");
const aiSlotsEl = $("ai-slots");
const playerSlotsEl = $("player-slots");
const flowRowEl = $("flow-row");
const handEl = $("hand");
const turnIndicator = $("turn-indicator");
const aetherReadout = $("aether-readout");

const playerPortrait = $("player-portrait");
const aiPortrait = $("ai-portrait");
const playerName = $("player-name");
const aiName = $("ai-name");

const peekEl = $("peek-card");
const zoomOverlayEl = $("zoom-overlay");
const zoomCardEl = $("zoom-card");

let state = initState();

let toastEl;
function toast(msg, ms = 1200) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), ms);
}

/* ========== Hand layout (fan) ========== */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function layoutHand(container, cards) {
  const N = cards.length; if (!N || !container) return;
  const MAX_ANGLE = 24, MIN_ANGLE = 6, MAX_SPREAD_PX = container.clientWidth * 0.92, LIFT_BASE = 42;
  const totalAngle = (N === 1) ? 0 : clamp(MIN_ANGLE + (N - 2) * 3.0, MIN_ANGLE, MAX_ANGLE);
  const step = (N === 1) ? 0 : totalAngle / (N - 1), startAngle = -totalAngle / 2;
  const spread = Math.min(MAX_SPREAD_PX, 900);
  const stepX = (N === 1) ? 0 : spread / (N - 1), startX = -spread / 2;

  cards.forEach((el, i) => {
    const a = startAngle + step * i;
    const rad = a * Math.PI / 180;
    const x = startX + stepX * i;
    const y = LIFT_BASE - Math.cos(rad) * (LIFT_BASE * 0.75);
    el.style.setProperty("--tx", `${x}px`);
    el.style.setProperty("--ty", `${y}px`);
    el.style.setProperty("--rot", `${a}deg`);
    el.style.zIndex = String(400 + i);
    el.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  });
}

/* ========== Slots (3 spell + 1 glyph) ========== */
function renderSlots(container, snapshot, isPlayer) {
  if (!container) return;
  container.replaceChildren();

  // Spell bays
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("div");
    d.className = "slot spell";
    d.dataset.slotIndex = String(i);

    const has = snapshot?.[i]?.hasCard;
    d.textContent = has ? (snapshot[i].card?.name || "Spell") : "Spell Slot";
    if (has) d.classList.add("has-card");

    if (isPlayer) {
      d.addEventListener("dragover", (ev) => { ev.preventDefault(); d.classList.add("drag-over"); });
      d.addEventListener("dragleave", () => d.classList.remove("drag-over"));
      d.addEventListener("drop", (ev) => {
        ev.preventDefault(); d.classList.remove("drag-over");
        const cardId = ev.dataTransfer?.getData("text/card-id");
        const cardType = ev.dataTransfer?.getData("text/card-type");
        if (!cardId || cardType !== "SPELL") return;
        playSpellIfPossible(cardId, i);
      });
    }
    container.appendChild(d);
  }

  // Glyph bay
  const g = document.createElement("div");
  g.className = "slot glyph";
  const glyphLabel = snapshot?.glyphSlot?.hasGlyph ? snapshot.glyphSlot.card?.name || "Glyph" : "Glyph Slot";
  g.textContent = glyphLabel;

  if (snapshot?.glyphSlot?.hasGlyph) g.classList.add("has-card");

  if (isPlayer) {
    g.addEventListener("dragover", (ev) => {
      const t = ev.dataTransfer?.getData("text/card-type");
      if (t === "GLYPH") { ev.preventDefault(); g.classList.add("drag-over"); }
    });
    g.addEventListener("dragleave", () => g.classList.remove("drag-over"));
    g.addEventListener("drop", (ev) => {
      ev.preventDefault(); g.classList.remove("drag-over");
      const cardId = ev.dataTransfer?.getData("text/card-id");
      const cardType = ev.dataTransfer?.getData("text/card-type");
      if (!cardId || cardType !== "GLYPH") return;
      try {
        state = reducer(state, { type: "SET_GLYPH_FROM_HAND", player: "player", cardId });
        render();
      } catch (e) { toast(e?.message || "Can't set glyph"); }
    });
  }
  container.appendChild(g);
}

/* ========== Flow row ========== */
function cardHTML(c) {
  const price = Number(c.price || 0);
  return `<div class="title">${c.name}</div>
          <div class="type">${c.type} — Cost Æ ${price}</div>
          <div class="textbox"></div>
          <div class="actions"><button class="btn" data-buy="1">Buy (Æ ${price})</button></div>`;
}
function renderFlow(flow) {
  if (!flowRowEl) return;
  flowRowEl.replaceChildren();
  (flow || []).slice(0, 5).forEach((c, idx) => {
    const li = document.createElement("li");
    li.className = "flow-card";
    const card = document.createElement("article");
    card.className = "card market";
    card.dataset.flowIndex = String(idx);
    card.innerHTML = cardHTML(c);

    // preview support (hover + long press)
    attachPeekAndZoom(card, c);

    card.querySelector("[data-buy]")?.addEventListener("click", () => {
      try {
        state = reducer(state, { type: "BUY_FROM_FLOW", player: "player", flowIndex: idx });
        render();
      } catch (err) { toast(err?.message || "Cannot buy"); }
    });
    li.appendChild(card);
    flowRowEl.appendChild(li);
  });
}

/* ========== Preview / Zoom ========== */
function closeZoom() { if (zoomOverlayEl) zoomOverlayEl.setAttribute("data-open", "false"); }
function fillCardShell(div, data) {
  if (!div) return;
  const price = data.price != null ? ` — Cost Æ ${data.price}` : "";
  const body = data.text ? `<div class="textbox">${data.text}</div>` : `<div class="textbox"></div>`;
  div.innerHTML = `
    <div class="title">${data.name}</div>
    <div class="type">${data.type}${price}</div>
    ${body}
    <div class="actions" style="opacity:.6"><span>Preview</span></div>
  `;
}
let longPressTimer = null;
let pressStart = { x: 0, y: 0 };
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;

function attachPeekAndZoom(el, data) {
  if (peekEl) {
    el.addEventListener("mouseenter", () => { fillCardShell(peekEl, data); peekEl.classList.add("show"); });
    el.addEventListener("mouseleave", () => { peekEl.classList.remove("show"); });
  }
  const onDown = (ev) => {
    if (longPressTimer) clearTimeout(longPressTimer);
    const touch = ev.clientX !== undefined ? ev : (ev.touches?.[0] ?? { clientX: 0, clientY: 0 });
    pressStart = { x: touch.clientX, y: touch.clientY };
    longPressTimer = setTimeout(() => {
      if (zoomOverlayEl && zoomCardEl) {
        fillCardShell(zoomCardEl, data);
        zoomOverlayEl.setAttribute("data-open", "true");
      }
    }, LONG_PRESS_MS);
  };
  const clearLP = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  const onMove = (ev) => {
    const t = ev.clientX !== undefined ? ev : (ev.touches?.[0] ?? { clientX: 0, clientY: 0 });
    if (Math.hypot(t.clientX - pressStart.x, t.clientY - pressStart.y) > MOVE_CANCEL_PX) clearLP();
  };
  el.addEventListener("pointerdown", onDown, { passive: true });
  el.addEventListener("pointerup", clearLP, { passive: true });
  el.addEventListener("pointerleave", clearLP, { passive: true });
  el.addEventListener("pointercancel", clearLP, { passive: true });
  el.addEventListener("pointermove", onMove, { passive: true });
  el.addEventListener("dragstart", clearLP);
}

/* ========== Touch/Mouse drag (hand) ========== */
function installTouchDrag(cardEl, cardData) {
  let dragging = false;
  let ghost = null;
  let start = { x: 0, y: 0 };
  let last = { x: 0, y: 0 };
  let tickPending = false;

  function pt(e) {
    const t = e.clientX !== undefined ? e : (e.touches?.[0] ?? { clientX: 0, clientY: 0 });
    return { x: t.clientX, y: t.clientY };
  }

  const rAFMove = () => {
    tickPending = false;
    if (ghost) ghost.style.transform =
      `translate(${last.x - ghost.clientWidth / 2}px, ${last.y - ghost.clientHeight * 0.9}px)`;
  };

  const DOWN = (e) => {
    start = last = pt(e);
    dragging = false;
    cardEl.setPointerCapture?.(e.pointerId || 0);
  };

  const MOVE = (e) => {
    const p = pt(e);
    if (dragging) e.preventDefault();

    if (!dragging) {
      if (Math.hypot(p.x - start.x, p.y - start.y) > 10) {
        dragging = true;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

        ghost = cardEl.cloneNode(true);
        ghost.classList.add("dragging");
        ghost.style.position = "fixed";
        ghost.style.left = "0"; ghost.style.top = "0";
        ghost.style.transform = `translate(${p.x - ghost.clientWidth / 2}px, ${p.y - ghost.clientHeight * 0.9}px)`;
        ghost.style.zIndex = "99999";
        document.body.appendChild(ghost);
      }
    } else {
      last = p;
      if (!tickPending) { tickPending = true; requestAnimationFrame(rAFMove); }

      document.querySelectorAll(".slot.drag-over").forEach(s => s.classList.remove("drag-over"));
      const el = document.elementFromPoint(p.x, p.y);
      const slotTarget = el?.closest?.(".slot.spell, .slot.glyph");
      if (slotTarget) slotTarget.classList.add("drag-over");
    }
  };

  const UP = () => {
    document.querySelectorAll(".slot.drag-over").forEach(s => s.classList.remove("drag-over"));
    if (dragging && ghost) {
      const el = document.elementFromPoint(last.x, last.y);
      const spellSlot = el?.closest?.(".slot.spell");
      const glyphSlot = el?.closest?.(".slot.glyph");
      if (spellSlot && cardData.type === "SPELL") {
        const idx = Number(spellSlot.dataset.slotIndex || 0);
        playSpellIfPossible(cardData.id, idx);
      } else if (glyphSlot && cardData.type === "GLYPH") {
        try {
          state = reducer(state, { type: "SET_GLYPH_FROM_HAND", player: "player", cardId: cardData.id });
          render();
        } catch (e) { toast(e?.message || "Can't set glyph"); }
      }
      ghost.remove(); ghost = null;
      dragging = false;
    }
  };

  cardEl.addEventListener("pointerdown", DOWN);
  window.addEventListener("pointermove", MOVE, { passive: false });
  window.addEventListener("pointerup", UP, { passive: true });
}

/* ========== actions ========== */
function playSpellIfPossible(cardId, slotIndex) {
  try {
    state = reducer(state, { type: "PLAY_CARD_TO_SLOT", player: "player", cardId, slotIndex });
    render();
  } catch (err) { toast(err?.message || "Can't play there"); }
}

/* ========== render ========== */
function render() {
  closeZoom();
  if (peekEl) peekEl.classList.remove("show");

  const s = serializePublic(state) || {};

  set(turnIndicator, el => el.textContent = `Turn ${s.turn ?? "?"} — ${s.activePlayer ?? "player"}`);
  set(aetherReadout, el => el.textContent = `Æ ${s.player?.aether ?? 0}  ◇ ${s.player?.channeled ?? 0}`);

  set(playerPortrait, el => el.src = s.player?.weaver?.portrait || el.src || "");
  set(aiPortrait, el => el.src = s.ai?.weaver?.portrait || el.src || "");
  set(playerName, el => el.textContent = s.player?.weaver?.name || "Player");
  set(aiName, el => el.textContent = s.ai?.weaver?.name || "Opponent");

  renderSlots(playerSlotsEl, { ...s.player, glyphSlot: s.player?.glyphSlot }, true);
  renderSlots(aiSlotsEl, { ...s.ai, glyphSlot: s.ai?.glyphSlot }, false);

  renderFlow(s.flow || []);

  // Hand
  if (handEl) {
    handEl.replaceChildren();
    const els = [];
    (s.player?.hand || []).forEach(c => {
      const el = document.createElement("article");
      el.className = "card"; el.tabIndex = 0; el.draggable = true;
      el.dataset.cardId = c.id; el.dataset.cardType = c.type;

      const gem = (c.cost != null && c.cost > 0) ? ` — Cost Æ ${c.cost}` : "";
      const body = c.text ? `<div class="textbox">${c.text}</div>` : `<div class="textbox"></div>`;

      el.innerHTML = `
        <div class="title">${c.name}</div>
        <div class="type">${c.type}${gem}</div>
        ${body}
        <div class="actions">
          <button class="btn" data-discard="1">Discard for Æ ${c.aetherValue ?? 0}</button>
        </div>`;

      // drag data for desktop DnD API
      el.addEventListener("dragstart", (ev) => {
        el.classList.add("dragging");
        ev.dataTransfer?.setData("text/card-id", c.id);
        ev.dataTransfer?.setData("text/card-type", c.type);
        ev.dataTransfer?.setDragImage(el, el.clientWidth / 2, el.clientHeight * 0.9);
      });
      el.addEventListener("dragend", () => el.classList.remove("dragging"));

      // mobile friendly drag ghost
      installTouchDrag(el, c);

      // preview
      attachPeekAndZoom(el, c);

      // discard for aether
      el.querySelector("[data-discard]")?.addEventListener("click", () => {
        try {
          state = reducer(state, { type: "DISCARD_FOR_AETHER", player: "player", cardId: c.id });
          render();
        } catch (err) { toast(err?.message || "Can't discard"); }
      });

      handEl.appendChild(el); els.push(el);
    });
    layoutHand(handEl, els);
  }
}

/* ========== wiring ========== */
startBtn?.addEventListener("click", () => { state = reducer(state, { type: "START_TURN", player: "player" }); render(); });
endBtn?.addEventListener
