/* The Grey — mobile bootstrap (v2.3.5-mobile-sync2)
   - Fix: only hide engine hand once HUD proxy is ready (prevents blank hand)
   - Force first-time sync on load; resilient to different engine hooks
   - External board info: names, hearts, trance labels
   - Version tag (top-right) for quick verification
   - Lightweight observers to keep UI fresh
*/

(() => {
  // ---- helpers -------------------------------------------------------------
  const on = (t, k, fn, o) => t && t.addEventListener && t.addEventListener(k, fn, o || false);
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const once = (fn) => { let did=false; return (...a)=>{ if(did) return; did=true; try{ fn(...a); }catch(e){} }; };
  const noop = ()=>{};

  // ---- sync hook -----------------------------------------------------------
  const rawCallSync = () => {
    const f = (window.tgSyncAll || window.syncAll || window.TG_SYNC_ALL || window.__syncAll || noop);
    try { f(); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(e) {}
    try { document.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(e) {}
  };
  const callSync = () => { rawCallSync(); resyncHudHand(); ensureBoardInfos(); };

  // ---- CSS injection (only minimal here; main layout lives in acceptance.safe.css) ----
  const injectCSS = once(() => {
    const css = `
      /* prevent long-press text selection on key elements */
      .card, .hand, .aether-card, .slot, .tg-board-info, .tg-trance, .tg-hearts, .tg-name {
        -webkit-user-select: none; -moz-user-select: none; user-select: none;
      }

      /* Small top-right version tag */
      #tgVersionTag{
        position: fixed; right: 12px; top: 8px; z-index: 99999;
        font: 11px/1 monospace; opacity: .55; letter-spacing: .25px;
        background: rgba(255,255,255,.85); padding: 3px 6px; border-radius: 6px;
        box-shadow: 0 1px 6px rgba(0,0,0,.06);
      }

      /* External board info (container; details positioned via JS) */
      .tg-board-info{
        position:absolute; left:16px; display:inline-flex; flex-direction:column; gap:2px;
        padding:6px 10px; border-radius:10px; background:rgba(255,255,255,.9);
        box-shadow:0 2px 8px rgba(0,0,0,.06); font-size:12px; line-height:1.1; pointer-events:none; z-index:40;
      }
      .tg-board-info .line1{ display:flex; align-items:center; gap:8px; }
      .tg-board-info .tg-name{ font-weight:600; opacity:.9; }
      .tg-board-info .tg-hearts{ letter-spacing:2px; }
      .tg-board-info .tg-trance{ opacity:.8; font-size:11px; }
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
    div.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-sync2');
    document.body.appendChild(div);
  });

  // ---- External board infos (name/hearts/trance) ---------------------------
  function text(el, t){ if (el) el.textContent = t; }
  function ensureBoardInfos(){
    try{
      let ai  = qs('#tgBoardAI'),  you = qs('#tgBoardYOU');
      if (!ai){  ai  = document.createElement('div');  ai.className='tg-board-info ai';  ai.id='tgBoardAI';  document.body.appendChild(ai); }
      if (!you){ you = document.createElement('div'); you.className='tg-board-info you'; you.id='tgBoardYOU'; document.body.appendChild(you); }

      // positions are tuned for the mobile layout—adjusted by viewport height
      const vh = window.innerHeight || document.documentElement.clientHeight;
      ai.style.top  = Math.round(vh * 0.19) + 'px';
      you.style.top = Math.round(vh * 0.64) + 'px';

      // pull names, hearts, trances from engine state if present
      const g = window.game;
      const aiName  = g?.ai?.weaverName || 'Spellweaver (AI)';
      const youName = g?.you?.weaverName || 'Spellweaver (You)';
      const aiHearts  = (g?.ai?.health  ?? 5);
      const youHearts = (g?.you?.health ?? 5);
      const heartsStr = (n)=> Array.from({length:5},(_,i)=> i<n ? '❤' : '♡').join(' ');
      const aiTrances  = (g?.ai?.trances  || []).map(t=>t?.name).filter(Boolean).join(' · ');
      const youTrances = (g?.you?.trances || []).map(t=>t?.name).filter(Boolean).join(' · ');

      ai.innerHTML  = `<div class="line1"><span class="tg-name">${aiName}</span><span class="tg-hearts">${heartsStr(aiHearts)}</span></div><div class="tg-trance">${aiTrances}</div>`;
      you.innerHTML = `<div class="line1"><span class="tg-name">${youName}</span><span class="tg-hearts">${heartsStr(youHearts)}</span></div><div class="tg-trance">${youTrances}</div>`;
    } catch(_) {}
  }

  // ---- HUD Hand (proxy) ----------------------------------------------------
  function ensureHudHandLayer(){
    let layer = qs('#tgHandLayer');
    if (!layer){
      layer = document.createElement('div');
      layer.id = 'tgHandLayer';
      layer.innerHTML = `
        <div id="tgHandLayerInner">
          <div class="hand" data-board="YOU"></div>
        </div>`;
      document.body.appendChild(layer);
    }
    // helper anchors for animation origins (future-proof)
    if (!qs('#tgDeckAnchor')){
      const d = document.createElement('div'); d.id='tgDeckAnchor';
      d.style.cssText='position:fixed;left:calc(50% - 560px);bottom:90px;width:1px;height:1px;pointer-events:none;opacity:0';
      document.body.appendChild(d);
    }
    if (!qs('#tgDiscardAnchor')){
      const d = document.createElement('div'); d.id='tgDiscardAnchor';
      d.style.cssText='position:fixed;right:calc(50% - 560px);bottom:90px;width:1px;height:1px;pointer-events:none;opacity:0';
      document.body.appendChild(d);
    }
  }

  function mirrorEngineHandIntoHud(){
    const engineHand = qs('#app [data-board="YOU"] .hand');
    const hudHand    = qs('#tgHandLayer .hand');
    if (!engineHand || !hudHand) return false;

    // Copy DOM of cards (keeps data attributes needed by UI code)
    hudHand.innerHTML = engineHand.innerHTML;

    // Mark document as "HUD ready" so CSS can safely hide engine hand
    document.documentElement.classList.add('has-hud-hand');
    return true;
  }

  const resyncHudHand = () => {
    ensureHudHandLayer();
    try { mirrorEngineHandIntoHud(); } catch(_) {}
  };

  // ---- First-time sync on load --------------------------------------------
  const forceFirstSync = once(() => {
    // two RAFs after DOM ready (layout settled) + timed fallback
    requestAnimationFrame(() => { requestAnimationFrame(() => callSync()); });
    setTimeout(callSync, 500);
  });

  // ---- Observers -----------------------------------------------------------
  const attachObservers = once(() => {
    // global, to keep board infos fresh on DOM churn
    const obs = new MutationObserver(() => {
      if (!attachObservers._t) {
        attachObservers._t = setTimeout(() => { attachObservers._t = null; ensureBoardInfos(); }, 150);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // hand-specific observer: if engine changes hand, mirror it
    const engineHand = qs('#app [data-board="YOU"] .hand');
    if (engineHand){
      const handObs = new MutationObserver(() => { resyncHudHand(); });
      handObs.observe(engineHand, { childList:true, subtree:true });
    }

    // resync on our synthetic events too
    on(window, 'tg:resync', resyncHudHand);
    on(document, 'tg:resync', resyncHudHand);

    // resync on orientation/resize (affects transforms)
    ['resize','orientationchange'].forEach(evt => on(window, evt, () => { ensureBoardInfos(); resyncHudHand(); }, {passive:true}));
  });

  // ---- Boot sequence -------------------------------------------------------
  const boot = () => {
    injectCSS();
    ensureVersionTag();
    ensureBoardInfos();
    ensureHudHandLayer();
    attachObservers();
    resyncHudHand();   // prepare proxy as early as possible
    forceFirstSync();  // then drive a real sync
  };

  if (document.readyState === 'loading') {
    on(document, 'DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
