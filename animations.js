/**
 * animations.js — v2.571+
 * Event-driven animations for The Grey
 *
 * Handled events:
 *  - 'cards:drawn'        { nodes:[HTMLElement,...] }                 // pop reveal
 *  - 'cards:deal'         { nodes:[HTMLElement,...], stagger?:120 }   // fly from deck to each hand node
 *  - 'cards:discard'      { nodes:[HTMLElement,...] }                 // fly to discard (curve + spin)
 *  - 'aetherflow:reveal'  { node:HTMLElement }
 *  - 'aetherflow:falloff' { node:HTMLElement }
 *  - 'aetherflow:bought'  { node:HTMLElement }                        // spotlight + fly to discard
 */

(() => {
  if (window.__greyAnimationsLoaded__) return;
  window.__greyAnimationsLoaded__ = true;

  // -------- Ensure a tiny event bus --------
  const Grey = (function ensureBus() {
    if (window.Grey && window.Grey.emit && window.Grey.on) return window.Grey;
    const listeners = new Map();
    const on = (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    };
    const off = (name, fn) => listeners.get(name)?.delete(fn);
    const emit = (name, detail) => {
      (listeners.get(name) || []).forEach(fn => { try { fn(detail); } catch(e) { console.error('[Grey]', name, e); } });
    };
    const bus = { on, off, emit };
    window.Grey = bus;
    return bus;
  })();

  // -------- Inject keyframes once --------
  (function injectCSS(){
    const id = 'grey-anim-css';
    if (document.getElementById(id)) return;
    const css = `
@keyframes grey-draw-pop {
  0%   { transform: translateY(20px) scale(.86) rotate(-1deg); opacity:0; filter:drop-shadow(0 0 0 rgba(126,182,255,0)); }
  60%  { transform: translateY(-4px) scale(1.02) rotate(.4deg);  opacity:1; filter:drop-shadow(0 0 10px rgba(126,182,255,.35)); }
  100% { transform: translateY(0)    scale(1)    rotate(0);       opacity:1; filter:drop-shadow(0 0 0 rgba(126,182,255,0)); }
}
@keyframes grey-spotlight {
  0%   { box-shadow: 0 0 0 rgba(126,182,255,0); }
  30%  { box-shadow: 0 0 28px rgba(126,182,255,.45); }
  70%  { box-shadow: 0 0 22px rgba(126,182,255,.35); }
  100% { box-shadow: 0 0 0 rgba(126,182,255,0); }
}
@keyframes grey-falloff-right {
  0%   { transform: translateX(0) translateY(0) rotate(0);   opacity:1; }
  60%  { transform: translateX(36px) translateY(6px) rotate(4deg);  opacity:.7; }
  100% { transform: translateX(80px) translateY(18px) rotate(8deg); opacity:0; }
}
@keyframes grey-reveal {
  0%   { transform: scale(.92); opacity:0; }
  60%  { transform: scale(1.03); opacity:1; }
  100% { transform: scale(1); opacity:1; }
}

/* class helpers */
.grey-anim-draw   { animation: grey-draw-pop 340ms cubic-bezier(.2,.7,.2,1) both; will-change: transform, opacity, filter; }
.grey-anim-spot   { animation: grey-spotlight 620ms ease-out both; }
.grey-anim-fall   { animation: grey-falloff-right 480ms ease-out both; will-change: transform, opacity; }
.grey-anim-reveal { animation: grey-reveal 340ms ease-out both; will-change: transform, opacity; }
.grey-fly-clone   { position: fixed; z-index: 9999; pointer-events: none; transform-origin: center; }

/* optional hide marker to avoid ghosting */
.grey-hide-during-flight { opacity: 0 !important; }
`;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // -------- helpers --------
  const isEl = n => n && n.nodeType === 1;
  const asArray = v => (Array.isArray(v) ? v : v ? [v] : []);
  const safeEach = (nodes, fn) => asArray(nodes).forEach(n => isEl(n) && fn(n));

  function spotlight(node, ms = 620) {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-spot');
    setTimeout(() => node.classList.remove('grey-anim-spot'), ms + 60);
  }

  function drawPop(nodes) {
    safeEach(nodes, n => {
      n.classList.add('grey-anim-draw');
      n.addEventListener('animationend', () => n.classList.remove('grey-anim-draw'), { once: true });
    });
  }

  function reveal(node) {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-reveal');
    node.addEventListener('animationend', () => node.classList.remove('grey-anim-reveal'), { once: true });
  }

  function falloffRight(node) {
    if (!isEl(node)) return;
    node.classList.add('grey-anim-fall');
    node.addEventListener('animationend', () => node.classList.remove('grey-anim-fall'), { once: true });
  }

  function getDeckRect() {
    const hud = document.getElementById('btn-deck-hud');
    if (hud) return hud.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    return { left: vw - 80, top: vh - 140, width: 1, height: 1 };
  }
  function getDiscardRect() {
    const hud = document.getElementById('btn-discard-hud') || document.querySelector('[data-drop=discard]');
    if (hud) return hud.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    return { left: vw - 80, top: vh - 80, width: 1, height: 1 };
  }

  function makeCloneFrom(srcRect, nodeLike) {
    const clone = (nodeLike?.cloneNode ? nodeLike.cloneNode(true) : document.createElement('div'));
    clone.classList.add('grey-fly-clone');
    clone.style.width = `${srcRect.width}px`;
    clone.style.height = `${srcRect.height}px`;
    clone.style.left = `${srcRect.left}px`;
    clone.style.top = `${srcRect.top}px`;
    clone.style.transform = `translate(0,0) rotate(0deg)`;
    clone.style.transition = `transform 540ms cubic-bezier(.2,.7,.2,1), opacity 540ms ease-out`;
    document.body.appendChild(clone);
    return clone;
  }

  function flyTo(node, targetRect, { duration = 540, curve = true, spin = true } = {}) {
    if (!targetRect) return Promise.resolve();
    const src = node.getBoundingClientRect();
    const clone = makeCloneFrom(src, node);
    // start hidden original to avoid ghosting
    node.classList?.add('grey-hide-during-flight');

    const dx = targetRect.left - src.left;
    const dy = targetRect.top  - src.top;
    const bend = curve ? (Math.random() * 40 + 30) * (Math.random() < .5 ? -1 : 1) : 0;
    const rot  = spin ? (Math.random() * 14 - 7) : 0;

    // Use a 2-step transform to fake a slight curve (midpoint offset)
    clone.animate([
      { transform: `translate(0px,0px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${dx*0.6}px, ${dy*0.6 + bend}px) rotate(${rot/2}deg)`, opacity: .95 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: .85 }
    ], { duration, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });

    return new Promise(res => {
      setTimeout(() => {
        clone.remove();
        node.classList?.remove('grey-hide-during-flight');
        res();
      }, duration + 40);
    });
  }

  // -------- Event bindings --------
  Grey.on('cards:drawn',        ({ nodes } = {}) => drawPop(nodes));
  Grey.on('aetherflow:reveal',  ({ node } = {})  => reveal(node));
  Grey.on('aetherflow:falloff', ({ node } = {})  => falloffRight(node));
  Grey.on('aetherflow:bought',  async ({ node } = {}) => {
    if (!isEl(node)) return;
    const rect = getDiscardRect();
    spotlight(node, 600);
    await flyTo(node, rect, { duration: 540, curve: true, spin: false });
  });

  // NEW: discard entire hand (or subset) animation
  Grey.on('cards:discard', async ({ nodes } = {}) => {
    const rect = getDiscardRect();
    const arr = asArray(nodes).filter(isEl);
    await Promise.all(arr.map(n => flyTo(n, rect, { duration: 560, curve: true, spin: true })));
  });

  // NEW: “deal from deck” to each hand target, with stagger
  Grey.on('cards:deal', async ({ nodes, stagger = 120 } = {}) => {
    const arr = asArray(nodes).filter(isEl);
    const deckRect = getDeckRect();
    for (let i = 0; i < arr.length; i++) {
      const target = arr[i];
      // create a clone at deck and fly to target rect
      const tRect = target.getBoundingClientRect();
      const fake = makeCloneFrom(deckRect, target);
      await new Promise(r => requestAnimationFrame(r));
      fake.animate([
        { transform: `translate(0px,0px) rotate(0deg)`, opacity: .95 },
        { transform: `translate(${(tRect.left-deckRect.left)*0.6}px, ${(tRect.top-deckRect.top)*0.6 + 30}px) rotate(-4deg)`, opacity: .92 },
        { transform: `translate(${tRect.left-deckRect.left}px, ${tRect.top-deckRect.top}px) rotate(0deg)`, opacity: .9 }
      ], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
      await new Promise(res => setTimeout(res, 520));
      fake.remove();
      // small stagger before next card
      if (i < arr.length - 1) await new Promise(res => setTimeout(res, stagger));
    }
  });

  // expose helpers for console tests
  window.GreyAnimations = { spotlight, flyTo };
})();