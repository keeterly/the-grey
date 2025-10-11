/* The Grey — mobile bootstrap (v2.3.5-mobile-unified-fit+layout-only-r2)
   Layout-only:
   - Fit 1280×720 canvas to viewport (no cropping)
   - Keep mobile-land class in landscape
   - Press & hold card preview
   - Version badge
   - Extra Safari guards (visualViewport + pageshow + timed reflow)
*/

(() => {
  const on = (t, k, f, o) => t && t.addEventListener && t.addEventListener(k, f, o || false);
  const qs = (s, r = document) => r.querySelector(s);

  const BASE_W = 1280, BASE_H = 720;

  /* ---------------- Fit-to-viewport scaling ---------------- */
  function computeScale() {
    // Use inner* so iOS URL bar changes are reflected
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / BASE_W, vh / BASE_H);
    // Nudge to avoid 1px overflow from rounding
    return Math.max(0.1, Math.min(s * 0.995, 2));
  }

  function applyScaleVars() {
    const s = computeScale();
    const st = document.documentElement.style;
    st.setProperty('--tg-scale', String(s));
    st.setProperty('--tg-scaled-w', (BASE_W * s) + 'px');
    st.setProperty('--tg-scaled-h', (BASE_H * s) + 'px');
  }

  function applyMobileFlag() {
    document.documentElement.classList.toggle(
      'mobile-land',
      Math.min(window.innerWidth, window.innerHeight) <= 900
    );
  }

  function applyLayout() {
    applyMobileFlag();
    applyScaleVars();
  }

  /* ---------------- Version HUD ---------------- */
  function ensureVersionTag() {
    let hud = qs('#tgHudRoot');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'tgHudRoot';
      hud.style.position = 'fixed';
      hud.style.inset = '0';
      hud.style.zIndex = '99998';
      hud.style.pointerEvents = 'none';
      document.body.appendChild(hud);
    }
    let tag = qs('#tgVersionTag');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'tgVersionTag';
      tag.style.cssText = `
        position:absolute; right:12px; top:8px; z-index:99999;
        font:11px/1 monospace; opacity:.55; background:rgba(255,255,255,.85);
        padding:3px 6px; border-radius:6px; box-shadow:0 1px 6px rgba(0,0,0,.06)
      `;
      hud.appendChild(tag);
    }
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-unified-fit+layout-only-r2');
  }

  /* ---------------- Press & Hold preview ---------------- */
  function installPressPreview() {
    const DELAY = 220, CANCEL = 8;
    let timer = null, active = null, sx = 0, sy = 0;

    on(document, 'pointerdown', (e) => {
      const card = e.target?.closest?.('#app .hand .card');
      if (!card) return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => {
        active = card;
        card.classList.add('magnify', 'magnify-hand');
      }, DELAY);
    }, { passive: true });

    const clear = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (active) { active.classList.remove('magnify', 'magnify-hand'); active = null; }
    };

    on(document, 'pointermove', (e) => {
      if (!timer && !active) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > CANCEL) clear();
    }, { passive: true });

    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(ev => {
      on(document, ev, clear, { passive: true });
      on(window,   ev, clear, { passive: true });
    });
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    ensureVersionTag();
    installPressPreview();
    applyLayout();

    // Normal listeners
    ['resize', 'orientationchange', 'visibilitychange'].forEach(ev =>
      on(window, ev, applyLayout, { passive: true })
    );

    // Safari: react to visual viewport shifts (URL bar show/hide)
    if (window.visualViewport) {
      ['resize','scroll'].forEach(ev =>
        on(window.visualViewport, ev, applyLayout, { passive: true })
      );
    }

    // Safari bfcache restore
    on(window, 'pageshow', (e) => { if (e.persisted) applyLayout(); }, { passive: true });

    // Timed reflows to catch late changes (iOS address bar settle)
    setTimeout(applyLayout, 0);
    setTimeout(applyLayout, 300);
    setTimeout(applyLayout, 800);

    // Gentle UI nudge if the app exposes a sync hook
    requestAnimationFrame(() => { try {
      (window.tgSyncAll || window.syncAll || window.__syncAll || (()=>{}))();
    } catch {} });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
