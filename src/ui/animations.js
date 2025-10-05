// =========================================================
// THE GREY — UI Animations (MTG-like)
// - Fan-out hand layout
// - Draw/Discard arcs with easing
// - Buy "hero-pose" then fly-to-discard
// - Utility tween helpers
// =========================================================

const RAF = () => new Promise(r => requestAnimationFrame(r));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Easing (smooth in/out) */
function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

/* Read absolute rect of an element (account for scroll) */
function rectAbs(el){
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
}

/* Create a flying clone above everything (for animation only) */
function makeGhost(el){
  const r = rectAbs(el);
  const ghost = el.cloneNode(true);
  ghost.style.position = 'absolute';
  ghost.style.left = r.x+'px';
  ghost.style.top  = r.y+'px';
  ghost.style.width  = r.w+'px';
  ghost.style.height = r.h+'px';
  ghost.style.margin = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.willChange = 'transform, opacity';
  ghost.style.zIndex = '9999';
  ghost.classList.add('animGhost');
  document.body.appendChild(ghost);
  return { ghost, r };
}

/* Animate an element clone from A -> B with easing */
async function flyClone(fromEl, toRect, {duration=380, scaleTo=1, delay=0}={}){
  if (!fromEl) return;
  const { ghost, r } = makeGhost(fromEl);
  if (delay) await sleep(delay);

  const dx = toRect.x - r.x;
  const dy = toRect.y - r.y;
  const sx = (toRect.w || r.w) / r.w;
  const sy = (toRect.h || r.h) / r.h;
  const s  = scaleTo ?? ((sx+sy)/2);

  const start = performance.now();
  let t; do {
    const now = performance.now();
    t = Math.min(1, (now - start) / duration);
    const e = easeInOutCubic(t);
    ghost.style.transform = `translate(${dx*e}px, ${dy*e}px) scale(${1 + (s-1)*e})`;
    await RAF();
  } while (t < 1);

  ghost.remove();
}

/* Fan out hand with slight rotation (MTG-arena feel) */
export function fanOutHand(ribbonEl){
  if (!ribbonEl) return;
  const cards = Array.from(ribbonEl.querySelectorAll('.handCard'));
  const N = cards.length;
  if (!N) return;

  const spreadDeg = Math.min(16, 6 + N*0.9); // wider with more cards
  const base = -(spreadDeg*(N-1))/2;

  cards.forEach((el, i) => {
    const rot = base + i*spreadDeg;
    const shift = (i - (N-1)/2) * 14; // sideways offset
    el.style.transformOrigin = '50% 90%';
    el.style.transform = `translateY(${Math.abs(rot)*0.6}px) translateX(${shift}px) rotate(${rot}deg)`;
    el.style.zIndex = String(10 + i);
  });
}

/* Animate full-hand discard: nice fan then arc-fly to discard chip */
export async function animateDiscardHand(ribbonEl, discChipEl){
  const cards = Array.from(ribbonEl?.querySelectorAll('.handCard') || []);
  if (!cards.length || !discChipEl) return;
  fanOutHand(ribbonEl);           // pose before flight
  await sleep(120);

  const target = rectAbs(discChipEl);
  const baseDur = Math.min(480, 280 + cards.length*18);

  // fly with slight stagger for pleasing "stream" look
  await Promise.all(cards.map((el, i) => {
    const r = el.getBoundingClientRect(); if (!r.width) return Promise.resolve();
    const delay = i * 40;
    return flyClone(el, { x: target.x, y: target.y, w: r.width*0.6, h: r.height*0.6 }, { duration: baseDur, scaleTo: 0.66, delay });
  }));
}

/* Animate drawing into hand: fly from deck chip to final position */
export async function animateDrawHand(ribbonEl, deckChipEl){
  const cards = Array.from(ribbonEl?.querySelectorAll('.handCard') || []);
  if (!cards.length || !deckChipEl) return;
  const deck = rectAbs(deckChipEl);

  // temporarily place ghosts at deck and fly to current card positions
  for (const el of cards) {
    const r = rectAbs(el);
    await flyClone(el, r, { duration: 360, scaleTo: 1 });
  }
  fanOutHand(ribbonEl);
}

/* Buy hero-pose: market card briefly enlarges center, then to discard */
export async function animateBuyHeroToDiscard(cardEl, discChipEl){
  if (!cardEl || !discChipEl) return;

  // center pose
  const r = rectAbs(cardEl);
  const vw = window.innerWidth;
  const vy = window.scrollY + window.innerHeight*0.4;

  await flyClone(cardEl, { x: vw/2 - r.w*0.9/2, y: vy - r.h*0.9/2, w: r.w*0.9, h: r.h*0.9 }, { duration: 360, scaleTo: 1.1 });

  // then to discard
  const disc = rectAbs(discChipEl);
  await flyClone(cardEl, { x: disc.x, y: disc.y, w: r.w*0.6, h: r.h*0.6 }, { duration: 380, scaleTo: 0.66 });
}

export async function animatePlayToSlot(cardEl, slotEl){
  if (!cardEl || !slotEl) return;
  const r = rectAbs(slotEl);
  await flyClone(cardEl, r, { duration: 320, scaleTo: 1.0 });
}
