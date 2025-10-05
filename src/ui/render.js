import { resolveArt } from './assets.js';
import { FLOW_PRICES } from '../engine/cards.js';

const $=(s,r=document)=>r.querySelector(s);
const topLog=$('#topLog');
const playerSlots=$('#playerSlots'), aiSlots=$('#aiSlots'), glyphTray=$('#glyphTray');
const rRibbon=$('#ribbon');
const marketCells=[...document.querySelectorAll('[data-flow]')];

const hpValue=$('#hpValue'), aeValue=$('#aeValue'), aiHpValue=$('#aiHpValue'), aiAeValue=$('#aiAeValue');
const youTrFill=$('#youTranceFill'), youTrCount=$('#youTranceCount'), aiTrFill=$('#aiTranceFill'), aiTrCount=$('#aiTranceCount');
let __lastFxPing = 0;


export function render(state, dispatch){
  if(state._log.length){
    topLog.innerHTML = state._log.slice(-3).map(x=>`<div>${x}</div>`).join('');
    topLog.classList.add('show');
    clearTimeout(window.__hideToast);
    window.__hideToast=setTimeout(()=>topLog.classList.remove('show'), 2200);
  }

  hpValue.textContent=state.hp; aeValue.textContent=state.ae;
  aiHpValue.textContent=state.ai.hp; aiAeValue.textContent=state.ai.ae||0;

  const yPct=Math.round(100*state.trance.you.cur/(state.trance.you.cap||6));
  const aPct=Math.round(100*state.trance.ai.cur/(state.trance.ai.cap||6));
  youTrFill.style.width=yPct+'%'; aiTrFill.style.width=aPct+'%';
  youTrCount.textContent=`${state.trance.you.cur}/${state.trance.you.cap||6}`;
  aiTrCount.textContent=`${state.trance.ai.cur}/${state.trance.ai.cap||6}`;
  $('#tranceBox').classList.toggle('trReady', state.trance.you.cur>=state.trance.you.cap || state.trance.ai.cur>=state.trance.ai.cap);

  playerSlots.innerHTML='';
  state.slots.forEach((s,i)=>{
    const d=document.createElement('div'); d.className='slot';
    d.innerHTML=`<h5>Slot ${i+1}</h5><div class="slotBody"></div><div class="actions"></div>`;
    if(s){
      const panel=document.createElement('div');
      panel.className='marketCard';
      panel.innerHTML=`<h4>${s.c.n}</h4>
        <div class="cardArt"><img src="${resolveArt(s.c)}" alt=""></div>
        <p>${s.c.txt||''}</p>
        <div class="pips">${pips(s.ph,s.c.p||1)}</div>`;
      panel.onclick=()=>inspectFromSlot('you',i,state);
      d.querySelector('.slotBody').appendChild(panel);

      const btn=document.createElement('button');
      btn.textContent='Advance (1⚡)';
      btn.style.cssText='padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:#fff';
      btn.disabled=!!s.advUsed;
      if(!btn.disabled) btn.onclick=()=>dispatch({type:'ADVANCE', slot:i});
      d.querySelector('.actions').appendChild(btn);
    }
    playerSlots.appendChild(d);
  });

  aiSlots.innerHTML='';
  state.ai.slots.forEach((s,i)=>{
    const d=document.createElement('div'); d.className='slot';
    d.innerHTML=`<h5>AI Slot ${i+1}</h5><div class="slotBody"></div>`;
    if(s){
      const panel=document.createElement('div');
      panel.className='marketCard';
      panel.innerHTML=`<h4>${s.c.n}</h4><div class="cardArt"><img src="${resolveArt(s.c)}" alt=""></div><div class="pips">${pips(s.ph,s.c.p||1)}</div>`;
      panel.onclick=()=>inspectFromSlot('ai',i,state);
      d.querySelector('.slotBody').appendChild(panel);
    }
    aiSlots.appendChild(d);
  });

  for(let i=0;i<5;i++){
    const c=state.flowRow[i], el=marketCells[i];
    if(!c){ el.className='marketCard'; el.innerHTML=`<div class="cardArt"></div><p style="opacity:.5">— empty —</p>`; continue; }
    el.className='marketCard'; el.innerHTML='';
    const badge=(c.v!=null)?`<span class="marketBadge">↺ +${c.v}⚡</span>`:'';
    el.innerHTML=`${badge}<h4>${c.n}</h4>
      <div class="cardArt"><img src="${resolveArt(c)}" alt=""></div>
      <p>${c.txt||''}</p>
      <div class="actions"><button ${state.ae>=FLOW_PRICES[i]?'':'disabled'}>Buy (${FLOW_PRICES[i]}⚡)</button></div>`;
    el.querySelector('button').onclick=()=>dispatch({type:'BUY_FLOW', index:i});
  }

  glyphTray.innerHTML=state.glyphs.map(g=>`<button class="glyphTok own"><span class="glyphPeek">${g.n}: ${g.txt||'Glyph'}</span></button>`).join('')||`<span style="font-size:11px;color:#888e93">No glyphs set.</span>`;
}

export function renderHand(state, dispatch, prepPointer){
  const rRibbon=$('#ribbon');
  rRibbon.innerHTML='';
  state.hand.forEach((c,i)=>{
    const card=document.createElement('button'); card.type='button'; card.className='rCard'; card.dataset.index=i;
    card.innerHTML=`<div class="rHead">${c.n}</div>
    <div class="rArt">
      ${(c.v!=null?`<div class="badgeTR">↺ +${c.v}⚡</div>`:'')}
      ${(c.t==='Spell'?`<div class="badgeTL">${'●'.repeat(c.p||1)}</div>`:'')}
      <img src="${resolveArt(c)}" alt="${c.n}">
    </div>
    <div class="rFoot">${c.txt||''}</div>`;
    prepPointer(card,i);
    rRibbon.appendChild(card);
  });
}

export function updateHUDPadding(){
  const hud=document.getElementById('hud');
  const setPad=()=>{
    const h=hud?.getBoundingClientRect().bottom||0;
    const pad = Math.max(56, Math.ceil(h) + 6);
    document.documentElement.style.setProperty('--hud-pad', pad+'px');
    document.documentElement.style.setProperty('--hud-top', Math.ceil(h)+'px');
  };
  setPad(); new ResizeObserver(setPad).observe(hud);
}

function pips(cur,total){let h='';for(let i=1;i<=total;i++)h+=`<span class="pip ${i<=cur?'on':''}"></span>`;return h;}

function inspectFromSlot(who,slotIndex,state){
  const dlg = document.getElementById('inspect');
  const insTitle=document.getElementById('insTitle');
  const insText=document.getElementById('insText');
  const insArt=document.getElementById('insArt');
  const slot = (who==='you'?state.slots:state.ai.slots)[slotIndex];
  if(!slot) return;
  insTitle.textContent=slot.c.n; insText.textContent=slot.c.txt||''; insArt.src=resolveArt(slot.c);
  dlg.classList.add('show');
}
