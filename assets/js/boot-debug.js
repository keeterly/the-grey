/* The Grey — mobile bootstrap (v2.3.5-mobile-landscape-fix)
   - Enforce mobile-land (landscape) class
   - First-time sync on load (dual RAF + timer)
   - TEMP: hide Spellweaver name/hearts HUD chips
   - Version tag (top-right)
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
    // Consider it "mobile" when the small side is <= 900px
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
      /* version tag */
      #tgVersionTag{
        position: fixed; right: 12px; top: 8px; z-index: 99999;
        font: 11px/1 monospace; opacity: .55; letter-spacing: .25px;
        background: rgba(255,255,255,.85); padding: 3px 6px; border-radius: 6px;
        box-shadow: 0 1px 6px rgba(0,0,0,.06);
      }
    `;
    const tag = document.createElement('style');
    tag.id = 'tgBootMobileCSS';
    tag.textContent = css;
    document.head.appendChild(tag);
  });

  // ---- Version badge -------------------------------------------------------
  const ensureVersionTag = once(() => {
    const div = document.createElement('div');
    div.id = 'tgVersionTag';
    div.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-landscape-fix');
    document.body.appendChild(div);
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
    ensureVersionTag();
    attachObservers();
    forceFirstSync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
