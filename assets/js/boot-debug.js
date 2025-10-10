/* boot-debug.js — v2.2.3-mobile-land-tune (MAIN) */

(function () {
  window.__THE_GREY_BUILD = 'v2.2.3-mobile-land-tune (main)';
  window.__BUILD_SOURCE = 'boot-debug.js';
})();

/* Create portrait overlay once */
(function ensureRotateOverlay(){
  if (document.getElementById('tgRotateOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'tgRotateOverlay';
  ov.className = 'tg-rotate-overlay';
  ov.innerHTML = `
    <div class="tg-rotate-card">
      <div class="tg-rotate-title">Rotate your device</div>
      <div class="tg-rotate-sub">Play in landscape for the best experience.</div>
    </div>`;
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(ov), {once:true});
})();

/* Fit the 1280x720 canvas to the screen and expose scaled width for HUD */
(function fitToScreen(){
  const DESIGN_W = 1280, DESIGN_H = 720;
  const root = document.documentElement;
  const round2 = (n)=> Math.round(n*100)/100;

  const isPortrait = ()=> window.innerHeight > window.innerWidth;

  function apply(){
    const el = document.getElementById('app');
    if (!el) return;

    const vw = window.innerWidth, vh = window.innerHeight;

    if (isPortrait()){
      root.classList.add('mobile-land');
      document.getElementById('tgRotateOverlay')?.classList.add('show');
      el.style.width = DESIGN_W + 'px';
      el.style.height = DESIGN_H + 'px';
      el.style.transform = 'translate(-50%, -50%) scale(0.9)';
      root.style.setProperty('--tg-scaled-width', Math.min(vw, DESIGN_W) + 'px');
      return;
    }

    document.getElementById('tgRotateOverlay')?.classList.remove('show');
    root.classList.add('mobile-land');

    // Compute scale to fit within viewport with a tiny margin to avoid touching edges
    const margin = 0.98; // 2% breathing room
    const scale = round2(Math.min((vw / DESIGN_W), (vh / DESIGN_H)) * margin);

    el.style.width = DESIGN_W + 'px';
    el.style.height = DESIGN_H + 'px';
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;

    const scaledW = Math.round(DESIGN_W * scale);
    root.style.setProperty('--tg-scaled-width', scaledW + 'px');
  }

  window.addEventListener('resize', apply, {passive:true});
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  apply();
})();

/* HUD controls (⇆, +AF) */
(function ensureHudButtons(){
  function $ (s){ return document.querySelector(s); }
  function mk(id, cls, text, title){
    const el = document.createElement('div');
    el.id = id; el.className = cls; el.textContent = text; el.title = title || '';
    return el;
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    const left = $('.hud-min .left');
    const right = $('.hud-min .right');
    if (left && !document.getElementById('tgCompactToggle')){
      left.appendChild(mk('tgCompactToggle','icon btn','⇆','Compact Layout'));
    }
    if (right && !document.getElementById('tgAFZoom')){
      right.appendChild(mk('tgAFZoom','icon btn','+AF','Zoom Aetherflow'));
    }
  }, {once:true});
})();

/* Compact/Mini + AF Zoom behavior */
(function mobileModes(){
  const docEl = document.documentElement;
  const LS_KEY = 'tgCompactPref'; // 'auto' | 'mini' | 'off'
  const getPref = ()=> { try{ return localStorage.getItem(LS_KEY) || 'off'; } catch(_) { return 'off'; } };
  const setPref = (v)=> { try{ localStorage.setItem(LS_KEY, v); } catch(_){} };
  const labelFromPref = (p)=> p==='mini' ? 'Mini' : p==='off' ? 'Off' : 'Auto';

  function cycle(){ setPref({off:'mini', mini:'auto', auto:'off'}[getPref()]); apply(); }
  function apply(){
    const pref = getPref();
    docEl.classList.toggle('mobile-mini', pref === 'mini'); // reserved for extra-condensed mode
    docEl.classList.toggle('af-zoom', false);
    const compactBtn = document.getElementById('tgCompactToggle');
    if (compactBtn) compactBtn.setAttribute('data-count', labelFromPref(pref));
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const compactBtn = document.getElementById('tgCompactToggle');
    const afBtn = document.getElementById('tgAFZoom');
    if (compactBtn) compactBtn.onclick = cycle;
    if (afBtn) afBtn.onclick = function(){
      const on = !docEl.classList.contains('af-zoom');
      docEl.classList.toggle('af-zoom', on);
      const af = document.querySelector('.aetherflow');
      if (on && af) af.scrollIntoView({behavior:'smooth', block:'center'});
    };
    apply();
  }, {once:true});
})();

/* Drop snap feedback */
(function dropSnap(){
  function attach(el){
    const obs = new MutationObserver(()=>{
      el.querySelectorAll('.card').forEach(c=>{
        c.classList.remove('drop-zoom');
        void c.offsetWidth;
        c.classList.add('drop-zoom');
      });
    });
    obs.observe(el, {childList:true, subtree:true});
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('[data-board] .slots').forEach(attach);
  }, {once:true});
})();

/* Bottom counters + version badge */
(function ensureBottomCounters(){
  document.addEventListener('DOMContentLoaded', ()=>{
    const right = document.querySelector('.hud-min .right');
    if (!right) return;
    const pill = (id, sym)=>{ const el = document.createElement('span'); el.id=id; el.className='hud-pill'; el.innerHTML=`<span class="sym">${sym}</span><span class="val">0</span>`; return el; };
    const endBtn = document.getElementById('btnEnd') || right.lastElementChild;
    if (!document.getElementById('tgTempPill')) right.insertBefore(pill('tgTempPill','🜂'), endBtn);
    if (!document.getElementById('tgChanPill')) right.insertBefore(pill('tgChanPill','◇'), endBtn);

    if (!document.getElementById('tgVersion')){
      const v = document.createElement('div');
      v.id='tgVersion'; v.className='tgVersion';
      v.textContent = 'The Grey — ' + (window.__THE_GREY_BUILD||'dev') + ' [' + (window.__BUILD_SOURCE||'?') + ']';
      v.style.position='fixed'; v.style.left='8px'; v.style.bottom='8px';
      v.style.opacity='0.6'; v.style.fontSize='12px';
      document.body.appendChild(v);
    }
  }, {once:true});
})();
