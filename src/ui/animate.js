// Slay-the-Spire style discard fly animation uses window.__lastHandSnapshot
export const runAnimations = async (root, anims=[])=>{
  for (const a of anims) {
    switch (a.type) {
      case 'DRAW': {
        const el = root.querySelector(`[data-card-id="${a.cardId}"][data-zone="hand"]`);
        if (el) el.classList.add('anim-draw');
        break;
      }
      case 'DISCARD_HAND': {
        const snap = window.__lastHandSnapshot || [];
        const discard = document.getElementById('discardIcon');
        if (!discard) break;
        const drect = discard.getBoundingClientRect();
        let i = 0;
        for (const it of snap) {
          const ghost = document.createElement('div');
          ghost.className = 'fly';
          ghost.style.left = (it.x - it.w/2) + 'px';
          ghost.style.top  = (it.y - it.h/2) + 'px';
          document.body.appendChild(ghost);
          await wait(50); // small stagger
          const tx = drect.left + drect.width/2 - it.x;
          const ty = drect.top + drect.height/2 - it.y;
          ghost.style.transition = 'transform .35s ease, opacity .35s ease';
          ghost.style.transform = `translate(${tx}px, ${ty}px) scale(.6) rotate(${(i%2?8:-8)}deg)`;
          ghost.style.opacity = '0';
          await wait(220);
          ghost.remove();
          i++;
        }
        // pulse discard icon
        discard.classList.add('highlight');
        await wait(180);
        discard.classList.remove('highlight');
        break;
      }
      case 'PLAY': {
        const el = root.querySelector(`[data-card-id="${a.cardId}"]`);
        if (el) { el.classList.add('pulse-gold'); await wait(200); el.classList.remove('pulse-gold'); }
        break;
      }
      case 'PLAY_GLYPH': {
        const slot = root.querySelector('[data-board="YOU"] [data-drop="glyph"]');
        slot?.classList.add('highlight'); await wait(180); slot?.classList.remove('highlight');
        break;
      }
      case 'ADVANCE': {
        const pipWrap = root.querySelector(`[data-pips-for="${a.cardId}"]`);
        pipWrap?.classList.add('pip-tick'); await wait(120); pipWrap?.classList.remove('pip-tick');
        break;
      }
      case 'RESOLVE': {
        const board = root.querySelector(`[data-board="${a.who}"]`);
        board?.classList.add('resolve-flash'); await wait(220); board?.classList.remove('resolve-flash');
        break;
      }
    }
  }
};
const wait = (ms)=> new Promise(r=>setTimeout(r, ms));