/* The Grey — boot-debug.js (r5)
   - Scales 1280×720 canvas to viewport (desktop + mobile landscape)
   - Toggles .mobile-land on small landscape devices (if you want special rules)
   - Installs press & hold preview for HAND cards only
   - Injects a version tag
   - iOS Safari reflow guards (visualViewport, bfcache, timed nudges)
*/
(() => {
  const on = (t,k,f,o)=> t && t.addEventListener && t.addEventListener(k,f,o||false);
  const qs = (s,r=document)=> r.querySelector(s);
  const BASE_W = 1280, BASE_H = 720;

  function computeScale(){
    const vw = window.innerWidth, vh = window.innerHeight;
    const s  = Math.min(vw/BASE_W, vh/BASE_H);
    return Math.max(0.1, Math.min(s*0.995, 2));
  }
  function applyScaleVars(){
    const s = computeScale();
    const st = document.documentElement.style;
    st.setProperty('--tg-scale', String(s));
    st.setProperty('--tg-base-w', BASE_W);
    st.setProperty('--tg-base-h', BASE_H);
  }
  function applyMobileFlag(){
    const w = window.innerWidth, h = window.innerHeight;
    const smallLandscape = (w >= h) && Math.min(w,h) <= 900;
    document.documentElement.classList.toggle('mobile-land', smallLandscape);
  }
  function applyLayout(){ applyMobileFlag(); applyScaleVars(); }

  function ensureVersionTag(){
    let hud = qs('#tgHudRoot');
    if(!hud){
      hud = document.createElement('div');
      hud.id = 'tgHudRoot';
      hud.style.position='fixed';
      hud.style.inset='0';
      hud.style.zIndex='99998';
      hud.style.pointerEvents='none';
      document.body.appendChild(hud);
    }
    let tag = qs('#tgVersionTag');
    if(!tag){
      tag = document.createElement('div');
      tag.id = 'tgVersionTag';
      tag.style.cssText = `
        position:absolute; right:12px; top:8px; z-index:99999;
        font:11px/1 monospace; opacity:.55; background:rgba(255,255,255,.85);
        padding:3px 6px; border-radius:6px; box-shadow:0 1px 6px rgba(0,0,0,.06)
      `;
      hud.appendChild(tag);
    }
    tag.textContent = (window.__THE_GREY_BUILD || 'v2.3.9-acceptanceP1-safe-v13');
  }

  /* Press & hold preview: only for hand cards (#app .hand .card) */
  function installPressPreview(){
    const DELAY = 220, CANCEL = 8;
    let timer = null, active = null, sx=0, sy=0;

    on(document,'pointerdown',(e)=>{
      const card = e.target?.closest?.('#app .hand .card');
      if(!card) return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(()=>{
        active = card;
        card.classList.add('magnify','magnify-hand');
      }, DELAY);
    }, {passive:true});

    const clear = ()=>{
      if(timer){ clearTimeout(timer); timer=null; }
      if(active){ active.classList.remove('magnify','magnify-hand'); active=null; }
    };

    on(document,'pointermove',(e)=>{
      if(!timer && !active) return;
      if(Math.hypot(e.clientX - sx, e.clientY - sy) > CANCEL) clear();
    }, {passive:true});

    ['pointerup','pointercancel','pointerleave','visibilitychange','blur'].forEach(ev=>{
      on(document, ev, clear, {passive:true});
      on(window,   ev, clear, {passive:true});
    });
  }

  function boot(){
    ensureVersionTag();
    installPressPreview();
    applyLayout();

    ['resize','orientationchange','visibilitychange'].forEach(ev =>
      on(window, ev, applyLayout, { passive:true })
    );
    if(window.visualViewport){
      ['resize','scroll'].forEach(ev =>
        on(window.visualViewport, ev, applyLayout, { passive:true })
      );
    }
    on(window,'pageshow',(e)=>{ if(e.persisted) applyLayout(); }, {passive:true});

    setTimeout(applyLayout, 0);
    setTimeout(applyLayout, 300);
    setTimeout(applyLayout, 800);

    // nudge app-side sync if present
    requestAnimationFrame(()=>{ try{
      (window.tgSyncAll || window.syncAll || window.__syncAll || (()=>{}))();
    }catch{} });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  }else{
    boot();
  }
})();
