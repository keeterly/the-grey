/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fit+preview)
   - True uniform scaling so 1280×720 fits viewport; perfect centering
   - Landscape lock for phones
   - Version tag on isolated HUD root
   - Hide "Aetherflow" header
   - Press-and-hold preview (press to zoom, cancel on drag/move)
*/

(() => {
  const on = (t, k, fn, o) => t && t.addEventListener && t.addEventListener(k, fn, o || false);
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const once = (fn) => { let did=false; return (...a)=>{ if(did) return; did=true; try{ fn(...a); }catch(e){} }; };
  const noop = ()=>{};

  const BASE_W = 1280;
  const BASE_H = 720;

  /* ---------------- Scaling / centering ---------------------------------- */
  function computeScale(){
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sx = vw / BASE_W;
    const sy = vh / BASE_H;
    const scale = Math.min(sx, sy) * 0.995;   // tiny inset
    return Math.max(0.1, Math.min(scale, 2));
  }
  function applyScaleVars(){
    const s = computeScale();
    const root = document.documentElement.style;
    root.setProperty('--tg-scale', String(s));
    root.setProperty('--tg-scaled-w', (BASE_W * s) + 'px');
    root.setProperty('--tg-scaled-h', (BASE_H * s) + 'px');
  }
  function applyMobileLand(){
    const docEl = document.documentElement;
    const smallSide = Math.min(window.innerWidth, window.innerHeight);
    const isPhoneish = smallSide <= 900;
    docEl.classList.toggle('mobile-land', isPhoneish);
  }
  function applyLayout(){
    applyMobileLand();
    applyScaleVars();
  }

  /* ---------------- Sync trigger (no engine changes) --------------------- */
  const callSync = () => {
    const f = (window.tgSyncAll || window.syncAll || window.TG_SYNC_ALL || window.__syncAll || noop);
    try { f(); } catch(_) {}
    try { window.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
    try { document.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
    hideAetherflowHeader();
  };

  /* ---------------- Version HUD root ------------------------------------- */
  const ensureHudRootAndVersion = once(() => {
    let hud = qs('#tgHudRoot');
    if (!hud){
      hud = document.createElement('div');
      hud.id = 'tgHudRoot';
      document.body.appendChild(hud);
    }
    let tag = qs('#tgVersionTag');
    if (!tag){
      tag = document.createElement('div');
      tag.id = 'tgVersionTag';
      hud.appendChild(tag);
    }
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-landscape-fit+preview');
  });

  /* ---------------- Aetherflow header remover ---------------------------- */
  function hideAetherflowHeader(){
    try {
      const af = qs('#app .aetherflow');
      if (!af) return;
      // Try common label-y elements first
      af.querySelectorAll('.title,.name,.label,[data-label]').forEach(el => el.style.display = 'none');
      // Fallback: hide lone text nodes that say 'Aetherflow'
      qsa('span,div', af).forEach(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        if (t === 'aetherflow') el.style.display = 'none';
      });
    } catch(_) {}
  }

  /* ---------------- Press & Hold Preview --------------------------------- */
  function installPressPreview(){
    let downX=0, downY=0, timer=null, active=null;
    const PRESS_MS = 220;
    const MOVE_CANCEL = 8; // px

    const clear = () => {
      if (timer){ clearTimeout(timer); timer=null; }
      if (active){
        active.classList.remove('magnify');
        active.classList.remove('magnify-hand');
        active = null;
      }
    };

    on(document, 'pointerdown', (e) => {
      const card = e.target && (e.target.closest && e.target.closest('.card'));
      if (!card) return;
      // ignore right-click / secondary
      if (e.button && e.button !== 0) return;

      downX = e.clientX; downY = e.clientY;
      timer = setTimeout(() => {
        if (active) return;
        active = card;
        active.classList.add('magnify');
        if (active.closest('.hand')) active.classList.add('magnify-hand');
      }, PRESS_MS);
    }, {passive:true});

    on(document, 'pointermove', (e) => {
      if (!timer && !active) return;
      const dx = (e.clientX - downX);
      const dy = (e.clientY - downY);
      if (Math.hypot(dx, dy) > MOVE_CANCEL){
        // user started a drag: cancel preview
        clear();
      }
    }, {passive:true});

    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(evt => {
      on(document, evt, clear, {passive:true});
      on(window,   evt, clear, {passive:true});
    });
  }

  /* ---------------- Boot -------------------------------------------------- */
  const injectCSS = once(() => {
    const tag = document.createElement('style');
    tag.id = 'tgBootMobileCSS';
    tag.textContent = `
      .card, .hand, .aether-card, .slot { -webkit-user-select:none; user-select:none; }
    `;
    document.head.appendChild(tag);
  });

  const forceFirstSync = once(() => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { callSync(); }); });
    setTimeout(callSync, 450);
  });

  const attachObservers = once(() => {
    const apply = () => { applyLayout(); hideAetherflowHeader(); };
    ['resize','orientationchange'].forEach(evt => on(window, evt, apply, {passive:true}));
    on(document, 'visibilitychange', apply);
    apply();
  });

  const boot = () => {
    injectCSS();
    ensureHudRootAndVersion();
    attachObservers();
    installPressPreview();
    forceFirstSync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
