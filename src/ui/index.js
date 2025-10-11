import { newGame, CARD_TYPES, cardCost } from "../engine/state.js";
import { reducer, A } from "../engine/rules.js";
import { wireHandDrag } from "./drag.js";
import {
  stageNewDraws,
  animateCardsToDiscard,
  animateAFBuyToDiscard,
  spotlightThenDiscard,
} from "./animate.js";

let state = newGame();
const root = document.getElementById("app");

/* ------------------------
   Helper rendering methods
------------------------- */
function fanTransform(i, n) {
  const mid = (n - 1) / 2;
  const o = i - mid;
  const rot = (o / Math.max(1, n)) * 10;
  const x = o * 60;
  const lift = -Math.abs(o) * 1;
  return `translate(calc(-50% + ${x}px), ${lift}px) rotate(${rot}deg)`;
}

function layoutHand() {
  const cards = [...document.querySelectorAll('[data-board="YOU"] .hand .card')];
  const n = cards.length;
  cards.forEach((el, i) => {
    el.style.transform = fanTransform(i, n);
  });
}

function typeBadge(c) {
  const label = c.type.charAt(0).toUpperCase() + c.type.slice(1).toLowerCase();
  return `<div class="badge ${label.toLowerCase()}">${label}</div>`;
}

function heartHtml(hp, id) {
  const max = 5;
  return `<div class="hearts" id="${id}">${Array.from({ length: max })
    .map((_, i) => `<div class="heart ${i < hp ? "on" : "off"}"></div>`)
    .join("")}</div>`;
}

function tranceChips(side, who) {
  return `
    <div class="trances">
      ${side.trances
        .map((t, idx) => {
          const active =
            idx === side.tranceActive || idx === side.trance2Active ? "active" : "";
          const key = `${who}-tr-${idx}`;
          return `<div class="trance-chip ${active}" data-trance="${key}" data-who="${who}" data-tr-index="${idx}" title="Activates at ${t.at} HP">${t.name}</div>`;
        })
        .join("")}
    </div>`;
}

function sideHeader(side, who) {
  const hpID = who === "YOU" ? "youHearts" : "aiHearts";
  return `
    <div class="row-head">
      <div class="weaver">${side.weaverName || who}</div>
      ${tranceChips(side, who)}
      ${heartHtml(side.health, hpID)}
    </div>`;
}

/* ------------------------
   Core Card Rendering
------------------------- */
function renderCard(c, i) {
  const cost = cardCost(c);
  const badge = typeBadge(c);
  const costTag = cost
    ? `<div class="cost ${c.type}">${cost}⚡</div>`
    : `<div class="cost none"></div>`;
  return `
    <div class="card" data-card="${i}" data-type="${c.type}">
      ${badge}
      <div class="title">${c.name}</div>
      ${costTag}
    </div>`;
}

/* ------------------------
   Game Board Rendering
------------------------- */
function renderBoard() {
  const you = state.YOU;
  const ai = state.AI;

  root.innerHTML = `
    <div class="container">
      <section class="board" data-board="AI">
        ${sideHeader(ai, "AI")}
        <div class="slots">
          ${ai.slots
            .map(
              (s) =>
                `<div class="slot ${s.type || "empty"}">${s.card ? renderCard(s.card) : "Spell Slot"}</div>`
            )
            .join("")}
        </div>
      </section>

      <section class="board" data-board="YOU">
        ${sideHeader(you, "YOU")}
        <div class="slots">
          ${you.slots
            .map(
              (s) =>
                `<div class="slot ${s.type || "empty"}">${s.card ? renderCard(s.card) : "Spell Slot"}</div>`
            )
            .join("")}
        </div>

        <div class="hand">
          ${you.hand.map(renderCard).join("")}
        </div>

        <div class="hud">
          <button id="deck" class="hud-btn">🂠 Deck</button>
          <button id="play" class="hud-btn">▶ End Turn</button>
          <button id="undo" class="hud-btn">↺ Undo</button>
        </div>

        <div id="aetherDisplay" class="aether"></div>
      </section>
    </div>`;

  layoutHand();
  wireHandDrag(state, dispatch);
  updateAetherDisplay();
}

/* ------------------------
   Aether Display Update
------------------------- */
function updateAetherDisplay() {
  const el = document.getElementById("aetherDisplay");
  if (!el) return;
  const total = state.YOU.aether || 0;
  const temp = state.YOU.tempAether || 0;
  const icons = [
    ...Array(total).fill('<div class="aether blue"></div>'),
    ...Array(temp).fill('<div class="aether red"></div>'),
  ].join("");
  el.innerHTML = icons || '<div class="aether none"></div>';
}

/* ------------------------
   Dispatch / Reducer
------------------------- */
function dispatch(action) {
  const prev = state;
  state = reducer(state, action);
  renderBoard();
  stageNewDraws(prev, state);
  animateCardsToDiscard(prev, state);
  animateAFBuyToDiscard(prev, state);
  spotlightThenDiscard(prev, state);
}

/* ------------------------
   Initialization
------------------------- */
function bootGame() {
  renderBoard();
  bindUI();
}

function bindUI() {
  const deck = document.getElementById("deck");
  const play = document.getElementById("play");
  const undo = document.getElementById("undo");

  if (deck) deck.onclick = () => dispatch({ type: A.DRAW });
  if (play) play.onclick = () => dispatch({ type: A.END_TURN });
  if (undo) undo.onclick = () => dispatch({ type: A.UNDO });

  // Add press-and-hold preview (MTG style)
  document.querySelectorAll(".card").forEach((card) => {
    let hold;
    card.addEventListener("mousedown", () => {
      hold = setTimeout(() => {
        card.classList.add("preview");
      }, 300);
    });
    card.addEventListener("mouseup", () => {
      clearTimeout(hold);
      card.classList.remove("preview");
    });
    card.addEventListener("mouseleave", () => {
      clearTimeout(hold);
      card.classList.remove("preview");
    });
  });
}

/* ------------------------
   DOM Ready Boot
------------------------- */
window.addEventListener("DOMContentLoaded", bootGame);
