/* The Grey — mobile bootstrap (v2.3.5-mobile-sync)
   - Ensures first-time hand render (force resync on load)
   - Places trance under Spellweaver names
   - Adds a small version tag (top-right)
   - Gentle, non-breaking: only calls existing game hooks if present
*/

(() => {
  // ---- helpers -------------------------------------------------------------
  const on = (t, k, fn, o) => t && t.addEventListener && t.addEventListener(k, fn, o || false);
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const once = (fn) => { let did=false; return (...a)=>{ if(did) return; did=true; try{ fn(...a); }catch(e){} }; };
  const noop = ()=>{};

  // Call whichever sync hook exists in the current build.
  const callSync = () => {
    const f = (window.tgSyncAll || window.syncAll || window.TG_SYNC_ALL || window.__syncAll || noop);
    try { f(); } catch(e) { /* no-op */ }
    // Some builds react to a synthetic event instead of an explicit function:
    try { window.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(e) {}
    try { document.dispatchEvent(new CustomEvent('tg:resync', {bubbles:true})); } catch(e) {}
  };

  // ---- CSS injection -------------------------------------------------------
  const injectCSS = once(() => {
    const css = `
      /* prevent long-press text selection on cards/labels */
      .card, .hand, .aether-card, .slot, .tg-board-info, .tg-trance, .tg-hearts, .tg-name {
        -webkit-user-select: none; -moz-user-select: none; user-select: none;
      }

      /* Board info badges (left side) */
      .tg-board-info {
        position: absolute;
        left: 16px;
        display: inline-flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 10px;
        border-radius: 10px;
        background: rgba(255,255,255,0.85);
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Helvetica, Arial;
        font-size: 12px;
        line-height: 1.1;
        pointer-events: none;
        z-index: 40;
      }
      .tg-board-info .line1 { display: flex; align-items: center; gap: 8px; }
      .tg-board-info .tg-name   { font-weight: 600; opacity: .9; }
      .tg-board-info .tg-hearts { letter-spacing: 2px; }
      .tg-board-info .tg-trance { opacity: .8; font-size: 11px; }

      /* Positions (tuned for mobile portrait/landscape) */
      .tg-board-info.ai   { top: 140px;  }   /* near AI board top-left */
      .tg-board-info.you  { top: 420px;  }   /* near player board */

      /* Small version tag */
      #tgVersionTag {
        position: fixed; right: 12px; top: 8px; z-index: 99999;
        font: 11px/1 monospace; opacity: .55; letter-spacing: .25px;
        background: rgba(255,255,255,.7);
        padding: 2px 6px; border-radius: 6px;
      }

      /* If your build already renders a trance label inline somewhere,
         stacking this way keeps it *under* the name line automatically. */
      .tg-board-info .line2 { display: block; }
    `;
    const style = document.createElement('style');
    style.id = 'tg-mobile-boot-style';
    style.textContent = css;
    document.head.appendChild(style);
  });

  // ---- Board info (names/hearts + trance below) ---------------------------
  const ensureBoardInfos = () => {
    const host = document.body;

    // Remove older clones to avoid duplication across reloads
    qsa('.tg-board-info').forEach(n => n.remove());

    // Create AI + You tiles
    const mk = (who, nameText) => {
      const div = document.createElement('div');
      div.className = `tg-board-info ${who}`;
      div.innerHTML = `
        <div class="line1">
          <span class="tg-name">${nameText}</span>
          <span class="tg-hearts">♥ ♥ ♥ ♥ ♥</span>
        </div>
        <div class="line2 tg-trance"></div>
      `;
      host.appendChild(div);
      return div;
    };

    const ai  = mk('ai',  'Spellweaver (AI)');
    const you = mk('you', 'Spellweaver (You)');

    // Try to fetch hearts/trance from the live UI if present
    // (Non-breaking: if not found, keep defaults above.)
    try {
      // Hearts: look for the original heart clusters nearest each board
      const allHearts = qsa('[data-hearts], .hearts, .life, .hp, .lives');
      const aiHearts  = allHearts.find(n => n.textContent && n.getBoundingClientRect().top < window.innerHeight/3);
      const youHearts = allHearts.find(n => n.textContent && n.getBoundingClientRect().top > window.innerHeight/2);

      if (aiHearts)  ai.querySelector('.tg-hearts').textContent  = aiHearts.textContent.trim();
      if (youHearts) you.querySelector('.tg-hearts').textContent = youHearts.textContent.trim();

      // Trance: look for chip-like labels near each board name
      const chipSel = '.chip,.tag,.badge,[data-chip]';
      const chips = qsa(chipSel);
      const takeChipsNear = (yMin, yMax) =>
        chips
          .filter(n => {
            const r = n.getBoundingClientRect();
            return r.top >= yMin && r.bottom <= yMax;
          })
          .map(n => n.textContent.trim())
          .filter(Boolean)
          .join(' · ');

      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const aiTr   = takeChipsNear(0, viewportH * 0.40);
      const youTr  = takeChipsNear(viewportH * 0.55, viewportH);

      if (aiTr)  ai.querySelector('.tg-trance').textContent  = aiTr;
      if (youTr) you.querySelector('.tg-trance').textContent = youTr;
    } catch(_) { /* non-fatal */ }
  };

  // ---- Version badge -------------------------------------------------------
  const ensureVersionTag = once(() => {
    const div = document.createElement('div');
    div.id = 'tgVersionTag';
    // If your build pipe exports a version, prefer it. Fallback to this string.
    div.textContent = (window.__THE_GREY_BUILD || 'v2.3.5-mobile-sync');
    document.body.appendChild(div);
  });

  // ---- First-time sync on load --------------------------------------------
  const forceFirstSync = once(() => {
    // Minimum: two RAFs after DOMContentLoaded (layout settled),
    // then a timed safety net for async engines.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => callSync());
    });
    setTimeout(callSync, 500);
  });

  // ---- Keep infos fresh when the game mutates ------------------------------
  const attachObservers = once(() => {
    const obs = new MutationObserver((m) => {
      // light work every few changes (throttle)
      if (!attachObservers._t) {
        attachObservers._t = setTimeout(() => {
          attachObservers._t = null;
          ensureBoardInfos();
        }, 150);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });

  // ---- Boot sequence -------------------------------------------------------
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
