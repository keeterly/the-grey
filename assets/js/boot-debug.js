/* The Grey — mobile bootstrap (v2.3.5-mobile-sync5-stable)
   - Stable mobile: keep engine hand in flow; reserve space via CSS
   - First-time sync on load (dual RAF + timer)
   - External board info (names, hearts, trances)
   - Version tag (top-right)
*/

(() => {
  // ---- helpers -------------------------------------------------------------
  const on = (t, k, fn, o) => t && t.addEventListener && t.addEventListener(k, fn, o || false);
  const qs  = (s, r=document) => r.querySelector(s);
  const once = (fn) => { let did=false; return (...a)=>{ if(did) return; did=true; try{ fn(...a); }catch(e){} }; };
  const noop = ()=>{};

  // ---- sync hook (resilient) ----------------------------------------------
  const callSync = () => {
    const f = (window.tgSyncAll || window.syncAll || window.TG_SYNC_ALL || window.__syncAll || noop);
    try { f(); } catch(_) {}
    try { window.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
    try { document.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(_) {}
    ensureBoardInfos();
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
      /* external board info container */
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
    div.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-sync5-stable');
    document.body.appendChild(div);
  });

  // ---- External board infos (name/hearts/trance) ---------------------------
  function ensureBoardInfos(){
    try{
      let ai  = qs('#tgBoardAI'),  you = qs('#tgBoardYOU');
      if (!ai){  ai  = document.createElement('div');  ai.className='tg-board-info ai';  ai.id='tgBoardAI';  document.body.appendChild(ai); }
      if (!you){ you = document.createElement('div'); you.className='tg-board-info you'; you.id='tgBoardYOU'; document.body.appendChild(you); }

      const vh = window.innerHeight || document.documentElement.clientHeight;
      ai.style.top  = Math.round(vh * 0.19) + 'px';
      you.style.top = Math.round(vh * 0.64) + 'px';

      const g = window.game;
      const aiName  = g?.ai?.weaverName  || 'Spellweaver (AI)';
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

  // ---- First-time sync on load --------------------------------------------
  const forceFirstSync = once(() => {
    requestAnimationFrame(() => { requestAnimationFrame(() => callSync()); });
    setTimeout(callSync, 500);
  });

  // ---- Observers -----------------------------------------------------------
  const attachObservers = once(() => {
    const obs = new MutationObserver(() => {
      if (!attachObservers._t) {
        attachObservers._t = setTimeout(() => { attachObservers._t = null; ensureBoardInfos(); }, 150);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    ['resize','orientationchange'].forEach(evt =>
      on(window, evt, () => { ensureBoardInfos(); }, {passive:true})
    );

    on(window, 'tg:resync', ensureBoardInfos);
    on(document, 'tg:resync', ensureBoardInfos);
  });

  // ---- Boot ---------------------------------------------------------------
  const boot = () => {
    injectCSS();
    ensureVersionTag();
    ensureBoardInfos();
    attachObservers();
    forceFirstSync();
  };

  if (document.readyState === 'loading') {
    on(document, 'DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
