export const runAnimations = async (root, anims=[])=>{
  for (const a of anims) {
    switch (a.type) {
      case 'PLAY': {
        const el = root.querySelector(`[data-card-id="${a.cardId}"]`);
        if (el) { el.classList.add('pulse-gold'); await wait(220); el.classList.remove('pulse-gold'); }
        break;
      }
      case 'PLAY_GLYPH': {
        const slot = root.querySelector('[data-drop="glyph"]');
        slot?.classList.add('slot-glow'); await wait(200); slot?.classList.remove('slot-glow');
        break;
      }
      case 'ADVANCE': {
        const pipWrap = root.querySelector(`[data-pips-for="${a.cardId}"]`);
        pipWrap?.classList.add('pip-tick'); await wait(140); pipWrap?.classList.remove('pip-tick');
        break;
      }
      case 'RESOLVE': {
        const board = root.querySelector(`[data-board="${a.who}"]`);
        board?.classList.add('resolve-flash'); await wait(260); board?.classList.remove('resolve-flash');
        break;
      }
    }
  }
};

const wait = (ms)=> new Promise(r=>setTimeout(r, ms));
