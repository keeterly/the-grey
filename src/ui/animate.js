export const runAnimations = async (root, anims=[])=>{
  for (const a of anims) {
    switch (a.type) {
      case 'DRAW': {
        // fly from deck icon to the new card position
        const deck = document.getElementById('deckIcon');
        const target = root.querySelector(`[data-card-id="${a.cardId}"][data-zone="hand"]`);
        if (!deck || !target) break;
        const d = deck.getBoundingClientRect();
        const r = target.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'anim-draw';
        ghost.style.left = (d.left + d.width/2 - r.width/2) + 'px';
        ghost.style.top  = (d.top + d.height/2 - r.height/2) + 'px';
        document.body.appendChild(ghost);
        await wait(10);
        const tx = r.left - (d.left + d.width/2 - r.width/2);
        const ty = r.top  - (d.top  + d.height/2 - r.height/2);
        ghost.style.opacity = '1';
        ghost.style.transform = `translate(${tx}px, ${ty}px)`;
        await wait(330);
        ghost.remove();
        break;
      }
      case 'DISCARD_HAND': {
        const discard = document.getElementById('discardIcon');
        if (!discard) break;
        const drect = discard.getBoundingClientRect();
        const cards = [...document.querySelectorAll('[data-board="YOU"] .hand [data-card-id]')];
        let i=0;
        for (const el of cards) {
          const r = el.getBoundingClientRect();
          const ghost = document.createElement('div');
          ghost.className = 'fly';
          ghost.style.left = (r.left) + 'px';
          ghost.style.top  = (r.top) + 'px';
          document.body.appendChild(ghost);
          await wait(50);
          const tx = drect.left + drect.width/2 - r.left - r.width/2;
          const ty = drect.top  + drect.height/2 - r.top  - r.height/2;
          ghost.style.transform = `translate(${tx}px, ${ty}px) scale(.6) rotate(${(i%2?8:-8)}deg)`;
          ghost.style.opacity = '0';
          await wait(240);
          ghost.remove();
          i++;
        }
        discard.classList.add('highlight');
        await wait(160);
        discard.classList.remove('highlight');
        break;
      }
      case 'ADVANCE': {
        const pipWrap = root.querySelector(`[data-pips-for="${a.cardId}"]`);
        pipWrap?.classList.add('pip-tick'); await wait(120); pipWrap?.classList.remove('pip-tick');
        break;
      }
    }
  }
};
const wait = (ms)=> new Promise(r=>setTimeout(r, ms));