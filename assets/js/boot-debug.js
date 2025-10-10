/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fit)
   - True uniform scaling so 1280×720 fits viewport; perfect centering
   - Landscape lock for phones
   - Version tag on isolated HUD root
   - Spellweaver chips remain hidden via CSS
*/

(() => {
  const on = (t, k, fn, o) => t && t.addEventListener && t.addEventListener(k, fn, o || false);
  const qs = (s, r=document) => r.querySelector(s);
  const once = (fn) => { let did=false; return (...a)=>{ if(did) return; did=true; try{ fn(...a); }catch(e){} }; };
  const noop = ()=>{};

  const BASE_W = 1280;
  const BASE_H = 720;

  function computeScale(){
    // Fit entire canvas in viewport (landscape). HUD floats, so no subtraction.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sx = vw / BASE_W;
    const sy = vh / BASE_H;
    const scale = Math.min(sx, sy) * 0.995;   // tiny inset to avoid edge kissing
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

  const callSync = () => {
    const f = (window.tgSyncAll || window.syncAll || window.TG_SYNC_ALL || window.__syncAll || noop);
    try { f(); } catch(_) {}
    try { window.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
    try { document.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
  };

  const injectCSS = once(() => {
    const tag = document.createElement('style');
    tag.id = 'tgBootMobileCSS';
    tag.textContent = `
      .card, .hand, .aether-card, .slot { -webkit-user-select:none; user-select:none; }
    `;
    document.head.appendChild(tag);
  });

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
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-landscape-fit');
  });

  const forceFirstSync = once(() => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { callSync(); }); });
    setTimeout(callSync, 450);
  });

  function applyLayout(){
    applyMobileLand();
    applyScaleVars();
  }

  const attachObservers = once(() => {
    const apply = () => { applyLayout(); };
    ['resize','orientationchange'].forEach(evt => on(window, evt, apply, {passive:true}));
    on(document, 'visibilitychange', apply);
    apply();
  });

  const boot = () => {
    injectCSS();
    ensureHudRootAndVersion();
    attachObservers();
    forceFirstSync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
