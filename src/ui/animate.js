function nextFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }
export async function animateCardsToDiscard(){
  const discard=document.getElementById('discardIcon'); if(!discard) return;
  const d=discard.getBoundingClientRect();
  const els=[...document.querySelectorAll('[data-board="YOU"] .hand .card')];
  let i=0;
  for(const el of els){
    const r=el.getBoundingClientRect();
    el.style.position='fixed'; el.style.left=r.left+'px'; el.style.top=r.top+'px';
    el.style.transition='transform .32s ease, opacity .32s ease'; el.style.willChange='transform,opacity';
    const tx=d.left + d.width/2 - r.left - r.width/2;
    const ty=d.top  + d.height/2 - r.top  - r.height/2;
    await nextFrame(); el.style.transform=`translate(${tx}px,${ty}px) scale(.6) rotate(${i%2?8:-8}deg)`; el.style.opacity='0'; i++; await new Promise(res=>setTimeout(res,60));
  }
  await new Promise(res=>setTimeout(res,320));
}
export async function animateNewDraws(newIds){
  const deck=document.getElementById('deckIcon'); if(!deck) return;
  for(const id of newIds){
    const el=document.querySelector(`[data-card-id="${id}"][data-zone="hand"]`); if(!el) continue;
    const r=el.getBoundingClientRect(); const d=deck.getBoundingClientRect();
    const base=el.getAttribute('data-base')||'';
    el.style.position='fixed'; el.style.left=(d.left + d.width/2 - r.width/2)+'px'; el.style.top=(d.top + d.height/2 - r.height/2)+'px';
    el.style.opacity='0'; el.style.transition='transform .35s ease, opacity .35s ease, left 0s, top 0s'; el.style.willChange='transform,opacity,left,top';
    await nextFrame();
    el.style.left=r.left+'px'; el.style.top=r.top+'px'; el.style.opacity='1'; el.style.transform='translate(0,0)';
    await new Promise(res=>setTimeout(res,360));
    // Snap to base transform without visible jostle
    el.style.transition='none';
    el.style.position=''; el.style.left=''; el.style.top=''; el.style.willChange='';
    el.style.transform = base; // keep base transform (avoids collapse/jostle)
    await nextFrame();
    el.style.transition='';
  }
}