/* boot-debug.js — v2.2.2-mobile-unified-align (MAIN) */

(function () {
  window.__THE_GREY_BUILD = 'v2.2.2-mobile-unified-align (main)';
  window.__BUILD_SOURCE = 'boot-debug.js';
})();

/* --- Ensure portrait overlay exists --- */
(function ensureRotateOverlay() {
  if (document.getElementById('tgRotateOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'tgRotateOverlay';
  ov.className = 'tg-rotate-overlay';
  ov.innerHTML = `
    <div class="tg-rotate-card">
      <div class="tg-rotate-title">Rotate your device</div>
      <div class="tg-rotate-sub">Play in landscape for the best experience.</div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(ov), { once: true });
})();

/* --- Fit to one screen in landscape (design 1280x720) --- */
(function fitToScreen() {
  const DESIGN_W = 1280, DESIGN_H = 720;
  const root = document.documentElement;
  const round2 = (n) => Math.round(n * 100) / 100;

  function isPortrait() { return window.innerHeight > window.innerWidth; }

  function apply() {
    const el = document.getElementById('app');
    if (!el) return;

    const vw = window.innerWidth, vh = window.innerHeight;

    // Portrait: show overlay, keep small preview scale
    if (isPortrait()) {
      root.classList.add('mobile-land');
      document.getElementById('tgRotateOverlay')?.classList.add('show');
      el.style.width = DESIGN_W + 'px';
      el.style.height = DESIGN_H + 'px';
      el.style.transform = 'translate(-50%, -50%) scale(0.9)';
      root.style.setProperty('--tg-scaled-width', Math.min(vw, DESIGN_W) + 'px');
      return;
    }

    // Landscape fit
    document.getElementById('tgRotateOverlay')?.classList.remove('show');
    root.classList.add('mobile-land');

    const scale = round2(Math.min(vw / DESIGN_W, vh / DESIGN_H));
    el.style.width = DESIGN_W + 'px';
    el.style.height = DESIGN_H + 'px';
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;

    // Tell CSS what the scaled width is so HUD centers under the canvas
    const scaledW = Math.round(DESIGN_W * scale);
    root.style.setProperty('--tg-scaled-width', scaledW + 'px');
  }

  window.addEventListener('resize', apply, { passive: true });
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  apply();
})();

/* --- HUD buttons (⇆ layout + +AF) --- */
(function ensureHudButtons() {
  function bySel(s) { return document.querySelector(s); }
  function mk(id, cls, text, title) {
    const el = document.createElement('div');
    el.id = id; el.className = cls; el.textContent = text; el.title = title || '';
    return el;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const left = bySel('.hud-min .left');
    const right = bySel('.hud-min .right');

    if (left && !document.getElementById('tgCompactToggle')) {
      left.appendChild(mk('tgCompactToggle', 'icon btn', '⇆', 'Compact Layout'));
    }
    if (right && !document.getElementById('tgAFZoom')) {
      right.appendChild(mk('tgAFZoom', 'icon btn', '+AF', 'Zoom Aetherflow'));
    }
  }, { once: true });
})();

/* --- Compact/Mini + AF Zoom behavior --- */
(function mobileModes() {
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref'; // 'auto' | 'mini' | 'off'

  function getPref() { try { return localStorage.getItem(LS_KEY) || 'off'; } catch (_) { return 'off'; } }
  function setPref(v) { try { localStorage.setItem(LS_KEY, v); } catch (_) { } }
  function labelFromPref(p) { return p === 'mini' ? 'Mini' : (p === 'off' ? 'Off' : 'Auto'); }

  function cycle() {
    const next = { off: 'mini', mini: 'auto', auto: 'off' }[getPref()];
    setPref(next); apply();
  }

  function apply() {
    const pref = getPref();
    const mini = (pref === 'mini');
    docEl.classList.toggle('mobile-mini', mini);   // reserved for future condensed UI
    docEl.classList.toggle('af-zoom', false);      // reset AF zoom on mode change
    const compactBtn = document.getElementById('tgCompactToggle');
    if (compactBtn) compactBtn.setAttribute('data-count', labelFromPref(pref));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const compactBtn = document.getElementById('tgCompactToggle');
    const afBtn = document.getElementById('tgAFZoom');

    if (compactBtn) compactBtn.onclick = cycle;
    if (afBtn) afBtn.onclick = function () {
      const on = !docEl.classList.contains('af-zoom');
      docEl.classList.toggle('af-zoom', on);
      const af = document.querySelector('.aetherflow');
      if (on && af) af.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    apply();
  }, { once: true });
})();

/* --- Mutation-based "drop snap" feedback --- */
(function dropSnap() {
  function attach(el) {
    const obs = new MutationObserver(() => {
      el.querySelectorAll('.card').forEach(c => {
        c.classList.remove('drop-zoom');
        void c.offsetWidth; // reflow
        c.classList.add('drop-zoom');
      });
    });
    obs.observe(el, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-board] .slots').forEach(attach);
  }, { once: true });
})();

/* --- HUD counters + version badge --- */
(function ensureBottomCounters() {
  document.addEventListener('DOMContentLoaded', () => {
    const right = document.querySelector('.hud-min .right');
    if (!right) return;

    function pill(id, sym) {
      const el = document.createElement('span');
      el.id = id; el.className = 'hud-pill';
      el.innerHTML = `<span class="sym">${sym}</span><span class="val">0</span>`;
      return el;
    }

    const endBtn = document.getElementById('btnEnd') || right.lastElementChild;
    if (!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill', '🜂'), endBtn);
    if (!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill', '◇'), endBtn);

    if (!document.getElementById('tgVersion')) {
      const v = document.createElement('div');
      v.id = 'tgVersion';
      v.className = 'tgVersion';
      v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD || 'dev') + ' [' + (window.__BUILD_SOURCE || '?') + ']';
      v.style.position = 'fixed';
      v.style.left = '8px';
      v.style.bottom = '8px';
      v.style.opacity = '0.6';
      v.style.fontSize = '12px';
      document.body.appendChild(v);
    }
  }, { once: true });
})();
