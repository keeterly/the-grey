/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fix2)
   - Enforce mobile-land (landscape) class
   - First-time sync on load (dual RAF + timer)
   - Version tag moved to a separate fixed HUD root (cannot affect layout)
   - Spellweaver chips remain hidden via CSS
*/

(() => {
  // ---- helpers -------------------------------------------------------------
  const on = (t, k, fn, o) => t && t.addEventListener && t.addEventListener(k, fn, o || false);
  const qs  = (s, r=document) => r.querySelector(s);
  const once = (fn) => { let did=false; return (...a)=>{ if(did) return; did=true; try{ fn(...a); }catch(e){} }; };
  const noop = ()=>{};

  // ---- orientation / mode --------------------------------------------------
  function applyMobileLand(){
    const docEl = document.documentElement;
    const smallSide = Math.min(window.innerWidth, window.innerHeight);
    const isMobile = smallSide <= 900;
    docEl.classList.toggle('mobile-land', isMobile);
  }

  // ---- sync hook (resilient) ----------------------------------------------
  const callSync = () => {
    const f = (window.tgSyncAll || window.syncAll || window.TG_SYNC_ALL || window.__syncAll || noop);
    try { f(); } catch(_) {}
    try { window.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
    try { document.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
  };

  // ---- CSS micro-injection -------------------------------------------------
  const injectCSS = once(() => {
    const css = `
      /* prevent long-press selection */
      .card, .hand, .aether-card, .slot, .tg-board-info, .tg-trance, .tg-hearts, .tg-name {
        -webkit-user-select: none; -moz-user-select: none; user-select: none;
      }
    `;
    const tag = document.createElement('style');
    tag.id = 'tgBootMobileCSS';
    tag.textContent = css;
    document.head.appendChild(tag);
  });

  // ---- HUD root + Version badge (independent fixed layer) ------------------
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
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-landscape-fix2');
  });

  // ---- First-time sync on load --------------------------------------------
  const forceFirstSync = once(() => {
    requestAnimationFrame(() => { requestAnimationFrame(() => callSync()); });
    setTimeout(callSync, 500);
  });

  // ---- Observers & events --------------------------------------------------
  const attachObservers = once(() => {
    const apply = () => applyMobileLand();
    ['resize','orientationchange'].forEach(evt => on(window, evt, apply, {passive:true}));
    on(document, 'visibilitychange', apply);
    apply();
  });

  // ---- Boot ---------------------------------------------------------------
  const boot = () => {
    injectCSS();
    ensureHudRootAndVersion();  // version label lives outside #app now
    attachObservers();
    forceFirstSync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
