/* =========================================================
   The Grey — Animation helpers (v2.57+)
   Drop this file next to index.js and include it after index.js
   ========================================================= */

(function () {
  const FX = {};

  // ===== Utilities =====
  function q(sel){ return document.querySelector(sel); }
  function rect(el){ return el.getBoundingClientRect(); }
  function px(n){ return `${Math.round(n)}px`; }

  // Create (or reuse) a screen-space FX layer
  function layer(){
    let l = q('#fx-layer');
    if(!l){
      l = document.createElement('div');
      l.id = 'fx-layer';
      document.body.appendChild(l);
    }
    return l;
  }

  // Clone an element visually (shallow) into the FX layer
  function makeClone(el){
    const r = rect(el);
    const c = el.cloneNode(true);
    c.classList.add('fx-clone');
    c.style.position = 'absolute';
    c.style.left = px(r.left);
    c.style.top  = px(r.top);
    c.style.width  = px(r.width);
    c.style.height = px(r.height);
    c.style.margin = '0';
    return c;
  }

  // Compute translate deltas
  function delta(fromEl, toEl, options = {}){
    const a = rect(fromEl), b = rect(toEl);
    const x0 = 0, y0 = 0;
    const x1 = (b.left + b.width/2) - (a.left + a.width/2);
    const y1 = (b.top  + b.height/2) - (a.top  + a.height/2);
    return {
      x0: px(x0), y0: px(y0),
      x1: px(x1), y1: px(y1),
      s0: options.s0 ?? 1, s1: options.s1 ?? 0.66,
      dur: options.dur ?? 420
    };
  }

  // Play a “fly” animation from 'fromEl' to 'toEl'
  function fly(elFrom, elTo, opts = {}){
    if(!elFrom || !elTo) return Promise.resolve();
    const l = layer();
    const clone = makeClone(elFrom);
    const d = delta(clone, elTo, opts);

    clone.classList.add('fx-fly');
    clone.style.setProperty('--fx-x0', d.x0);
    clone.style.setProperty('--fx-y0', d.y0);
    clone.style.setProperty('--fx-x1', d.x1);
    clone.style.setProperty('--fx-y1', d.y1);
    clone.style.setProperty('--fx-s0', d.s0);
    clone.style.setProperty('--fx-s1', d.s1);
    clone.style.setProperty('--fx-dur', d.dur + 'ms');

    l.appendChild(clone);
    return new Promise(res=>{
      clone.addEventListener('animationend', ()=>{
        clone.remove(); res();
      }, {once:true});
    });
  }

  // Pop reveal inside its current slot
  function reveal(el){
    if(!el) return;
    const l = layer();
    const c = makeClone(el);
    c.classList.add('fx-reveal');
    l.appendChild(c);
    c.addEventListener('animationend', ()=>c.remove(), {once:true});
  }

  // Fall off to the right
  function falloff(el){
    if(!el) return;
    const l = layer();
    const c = makeClone(el);
    c.classList.add('fx-falloff');
    l.appendChild(c);
    c.addEventListener('animationend', ()=>c.remove(), {once:true});
  }

  // Spotlight pulse over an element
  function spotlight(el){
    if(!el) return;
    const l = layer();
    const r = rect(el);
    const s = document.createElement('div');
    s.className = 'fx-spotlight';
    s.style.left = px(r.left);
    s.style.top = px(r.top);
    s.style.width = px(r.width);
    s.style.height = px(r.height);
    l.appendChild(s);
    s.addEventListener('animationend', ()=>s.remove(), {once:true});
  }

  // ===== Public API =====
  FX.animateDraw = async function(cardEl, deckEl, handEl){
    // deck → hand
    if(deckEl && handEl && cardEl){
      await fly(deckEl, handEl, {s0:.9, s1:1, dur:440});
    }
  };

  FX.animateDiscard = function(cardEl, discardEl){
    return fly(cardEl, discardEl, {s0:1, s1:.66, dur:420});
  };

  FX.animateFlowReveal = function(flowCardEl){
    reveal(flowCardEl);
  };

  FX.animateFlowFalloff = function(flowCardEl){
    falloff(flowCardEl);
  };

  FX.animateBuyToDiscard = async function(flowCardEl, discardEl){
    spotlight(flowCardEl);
    await new Promise(r=>setTimeout(r, 260));
    await fly(flowCardEl, discardEl, {s0:1, s1:.6, dur:460});
  };

  // Expose globally
  window.GREY_ANIM = FX;
})();
