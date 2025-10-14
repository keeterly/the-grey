/**
 * animations.js — v2.571+
 * Event-driven animations for The Grey
 *
 * Emits handled:
 *  - 'cards:drawn'        { nodes:[HTMLElement,...] }
 *  - 'cards:discard'      { nodes:[HTMLElement,...] }  // fly to discard
 *  - 'aetherflow:reveal'  { node:HTMLElement }
 *  - 'aetherflow:falloff' { node:HTMLElement }
 *  - 'aetherflow:bought'  { node:HTMLElement }         // spotlight + fly to discard
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

.grey-anim-draw   { animation: grey-draw-pop 340ms cubic-bezier(.2,.7,.2,1) both; will-change: transform, opacity, filter; }
.grey-anim-spot   { animation: grey-spotlight 620ms ease-out both; }
.grey-anim-fall   { animation: grey-falloff-right 480ms ease-out both; will-change: transform, opacity; }
.grey-anim-reveal { animation: grey-reveal 340ms ease-out both; will-change: transform, opacity; }

.grey-fly-clone { position: fixed; z-index: 9999; pointer-events: none; transform-origin: center; }
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

  function getDiscardTargetRect() {
    const hud = document.getElementById('btn-discard-hud') || document.querySelector('[data-drop=discard]');
    if (hud) return hud.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    return { left: vw - 80, top: vh - 80, width: 1, height: 1 };
  }

  function flyTo(node, targetRect, { duration = 540 } = {}) {
    if (!isEl(node) || !targetRect) return Promise.resolve();
    const src = node.getBoundingClientRect();
    const clone = node.cloneNode(true);
    clone.classList.add('grey-fly-clone');
    clone.style.width = `${src.width}px`;
    clone.style.height = `${src.height}px`;
    clone.style.left = `${src.left}px`;
    clone.style.top = `${src.top}px`;
    clone.style.transform = `translate(0,0)`;
    clone.style.transition = `transform ${duration}ms cubic-bezier(.2,.7,.2,1), opacity ${duration}ms ease-out`;
    document.body.appendChild(clone);

    const dx = targetRect.left - src.left;
    const dy = targetRect.top  - src.top;

    requestAnimationFrame(() => {
      clone.style.transform = `translate(${dx}px, ${dy}px) scale(.82)`;
      clone.style.opacity = '0.85';
    });
    return new Promise(res => setTimeout(() => { clone.remove(); res(); }, duration + 40));
  }

  // -------- Event bindings --------
  Grey.on('cards:drawn',        ({ nodes } = {}) => drawPop(nodes));
  Grey.on('aetherflow:reveal',  ({ node } = {})  => reveal(node));
  Grey.on('aetherflow:falloff', ({ node } = {})  => falloffRight(node));
  Grey.on('aetherflow:bought',  async ({ node } = {}) => {
    if (!isEl(node)) return;
    spotlight(node, 600);
    await flyTo(node, getDiscardTargetRect(), { duration: 540 });
  });

  // NEW: discard entire hand (or subset) animation
  Grey.on('cards:discard', async ({ nodes } = {}) => {
    const rect = getDiscardTargetRect();
    const arr = asArray(nodes).filter(isEl);
    await Promise.all(arr.map(n => flyTo(n, rect, { duration: 520 })));
  });

  // expose helpers for console tests
  window.GreyAnimations = { spotlight, drawPop, falloffRight, reveal };
})();