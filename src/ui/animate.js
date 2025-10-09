export async function animateCardsToDiscard() {
  const discard = document.getElementById('discardIcon'); if (!discard) return;
  const d = discard.getBoundingClientRect();
  const els = [...document.querySelectorAll('[data-board="YOU"] .hand .card')];
  let i=0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    el.style.position = 'fixed'; el.style.left = r.left+'px'; el.style.top = r.top+'px'; el.style.transition='transform .35s ease, opacity .35s ease';
    const tx = d.left + d.width/2 - r.left - r.width/2;
    const ty = d.top  + d.height/2 - r.top  - r.height/2;
    requestAnimationFrame(()=>{ el.style.transform = `translate(${tx}px, ${ty}px) scale(.6) rotate(${i%2?8:-8}deg)`; el.style.opacity='0'; });
    await new Promise(res=> setTimeout(res, 70)); i++;
  }
  await new Promise(res=> setTimeout(res, 320));
  // leave cleanup to render() which nukes DOM after END_TURN
}
export async function animateNewDraws(newIds) {
  const deck = document.getElementById('deckIcon'); if (!deck) return;
  for (const id of newIds) {
    const el = document.querySelector(`[data-card-id="${id}"][data-zone="hand"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const d = deck.getBoundingClientRect();
    el.style.position = 'fixed'; el.style.left = (d.left + d.width/2 - r.width/2)+'px'; el.style.top = (d.top + d.height/2 - r.height/2)+'px';
    el.style.opacity = '0'; el.style.transition = 'transform .35s ease, opacity .35s ease, left 0s, top 0s';
    requestAnimationFrame(()=>{
      el.style.left = r.left+'px'; el.style.top = r.top+'px';
      el.style.opacity='1'; el.style.transform='translate(0,0)';
    });
    await new Promise(res=> setTimeout(res, 60));
  }
  await new Promise(res=> setTimeout(res, 340));
  // Do not clear styles here; layoutHand() will reset them.
}