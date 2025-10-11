/* The Grey — UI animation helpers (mobile-unified v2.3.5+)
   These are Promise-based so game logic can await animations without race conditions.
   They use safe fallbacks if a target anchor isn't available.
*/

const CSS_ID = "__tg_anim_css__";

/* Inject minimal keyframes once */
function ensureAnimCSS() {
  if (document.getElementById(CSS_ID)) return;
  const css = /* css */`
  @keyframes tg-pop-in { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes tg-fade-out { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(6px) } }
  @keyframes tg-spotlight { 0% { filter: drop-shadow(0 6px 22px rgba(0,0,0,.18)) } 60% { filter: drop-shadow(0 12px 40px rgba(0,0,0,.28)) } 100% { filter: drop-shadow(0 8px 26px rgba(0,0,0,.20)) } }
  .tg-anim-pop   { animation: tg-pop-in .22s ease-out forwards; }
  .tg-anim-fade  { animation: tg-fade-out .18s ease-out forwards; }
  .tg-anim-spot  { animation: tg-spotlight .35s ease-in-out; }
  `;
  const tag = document.createElement("style");
  tag.id = CSS_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
}
ensureAnimCSS();

/* Utility: wait for one animation (or fallback timeout) */
function onceAnimation(el, timeout = 450) {
  return new Promise(res => {
    let done = false;
    const finish = () => { if (!done) { done = true; el.removeEventListener("animationend", finish); res(); } };
    el.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, timeout);
  });
}

/* Utility: animate a ghost element flying between rects (best effort) */
async function flyFromTo(srcRect, dstRect, opts = {}) {
  const { duration = 260, borderRadius = 14, background = "#fffdfa", shadow = "0 8px 26px rgba(0,0,0,.18)" } = opts;
  if (!srcRect || !dstRect) return;

  const ghost = document.createElement("div");
  ghost.style.cssText = `
    position: fixed; left:${srcRect.left}px; top:${srcRect.top}px;
    width:${srcRect.width}px; height:${srcRect.height}px; z-index:9999;
    border-radius:${borderRadius}px; background:${background}; box-shadow:${shadow};
    transition: transform ${duration}ms cubic-bezier(.2,.8,.2,1), opacity ${duration}ms ease;
    transform: translate(0,0); opacity: .98;
  `;
  document.body.appendChild(ghost);

  const dx = (dstRect.left - srcRect.left);
  const dy = (dstRect.top  - srcRect.top);
  // next frame
  requestAnimationFrame(() => { ghost.style.transform = `translate(${dx}px, ${dy}px)`; ghost.style.opacity = "1"; });
  await new Promise(r => setTimeout(r, duration + 20));
  ghost.remove();
}

/* Try to find HUD anchors */
function findDeckAnchor() {
  // Right-side HUD area near End Turn/Deck; adapt as needed if you rename buttons
  return document.querySelector('[data-role="deck"], .hud [data-action="deck"]') ||
         document.querySelector('.hud'); // fallback to HUD block
}
function findDiscardAnchor() {
  // Left of End Turn in our unified HUD; adapt selector if you add a real discard node
  return document.querySelector('[data-role="discard"], .hud [data-action="discard"]') ||
         document.querySelector('.hud'); // fallback
}

/* ============== EXPORTED HELPERS ============== */

/** Animate freshly drawn cards into the hand (soft pop; if deck anchor is present, quick fly). */
export async function animateNewDraws(cardEls = []) {
  if (!Array.isArray(cardEls) || !cardEls.length) return;
  const deck = findDeckAnchor();
  for (const el of cardEls) {
    try {
      if (deck) {
        const src = deck.getBoundingClientRect();
        const dst = el.getBoundingClientRect();
        await flyFromTo(src, dst, {});
      } else {
        el.classList.add("tg-anim-pop");
        await onceAnimation(el, 260);
        el.classList.remove("tg-anim-pop");
      }
    } catch { /* best effort; continue */ }
  }
}

/** Animate one card purchased/channeled from the **hand** to the **discard**. */
export async function animateAFBuyToDiscard(cardEl) {
  if (!cardEl) return;
  const discard = findDiscardAnchor();
  try {
    if (discard) {
      const src = cardEl.getBoundingClientRect();
      const dst = discard.getBoundingClientRect();
      await flyFromTo(src, { ...dst, left: dst.left + 12, top: dst.top + 12, width: src.width, height: src.height });
    } else {
      cardEl.classList.add("tg-anim-fade");
      await onceAnimation(cardEl, 220);
      cardEl.classList.remove("tg-anim-fade");
    }
  } catch {
    cardEl.classList.add("tg-anim-fade");
    await onceAnimation(cardEl, 220);
    cardEl.classList.remove("tg-anim-fade");
  }
}

/** Batch: move multiple board cards to discard with a subtle fade/fly. */
export async function animateCardsToDiscard(cardEls = []) {
  if (!Array.isArray(cardEls) || !cardEls.length) return;
  const discard = findDiscardAnchor();
  for (const el of cardEls) {
    try {
      if (discard) {
        const src = el.getBoundingClientRect();
        const dst = discard.getBoundingClientRect();
        await flyFromTo(src, dst);
      } else {
        el.classList.add("tg-anim-fade");
        await onceAnimation(el, 200);
        el.classList.remove("tg-anim-fade");
      }
    } catch { /* noop */ }
  }
}

/** Briefly spotlight a card (scale/shadow), then send it to discard. */
export async function spotlightThenDiscard(cardEl) {
  if (!cardEl) return;
  try {
    cardEl.classList.add("tg-anim-spot");
    await onceAnimation(cardEl, 350);
  } finally {
    cardEl.classList.remove("tg-anim-spot");
    await animateAFBuyToDiscard(cardEl);
  }
}
