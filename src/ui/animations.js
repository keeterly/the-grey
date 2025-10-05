// =========================================================
// THE GREY — UI Animations (fan, fly, draw/discard/buy)
// =========================================================

const ease = 'cubic-bezier(.22,.72,.15,1)';

function rect(el){
  const r = el.getBoundingClientRect();
  return { x:r.left + r.width/2, y:r.top + r.height/2, w:r.width, h:r.height };
}

function flyClone(fromEl, toEl, {scaleTo=1, dur=380, delay=0} = {}){
  if (!fromEl || !toEl) return Promise.resolve();
  const body = document.body;

  const fr = rect(fromEl);
  const tr = rect(toEl);

  const dx = tr.x - fr.x;
  const dy = tr.y - fr.y;

  const ghost = fromEl.cloneNode(true);
  ghost.style.position = 'fixed';
  ghost.style.left = (fr.x - fr.w/2) + 'px';
  ghost.style.top  = (fr.y - fr.h/2) + 'px';
  ghost.style.width = fr.w + 'px';
  ghost.style.height = fr.h + 'px';
  ghost.style.margin = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = 9999;
  ghost.style.transition = `transform ${dur}ms ${ease}, opacity ${dur}ms ${ease}`;
  body.appendChild(ghost);

  // next frame
  requestAnimationFrame(()=>{
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleTo})`;
    ghost.style.opacity = '0.85';
  });

  return new Promise(res=>{
    setTimeout(()=>{
      ghost.remove();
      res();
    }, dur+delay+16);
  });
}

export function fanHand(container){
  const cards = Array.from(container.querySelectorAll('.handCard'));
  const n = cards.length;
  const spread = Math.min(18, 6 + n*1.2);        // degrees
  const lift   = Math.min(30, 6 + n*1.2);        // px
  const mid = (n-1)/2;

  cards.forEach((el,i)=>{
    const a = (i - mid) * spread * 0.02;         // small rotation
    const x = (i - mid) * 22;                    // horizontal spacing
    const y = -Math.abs(i - mid) * (lift/n);     // slight arch

    el.style.zIndex = String(100 + i);
    el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${a}turn)`;
  });
}

export async function animateDrawHand({deckBtn, ribbon}){
  // fan first so destinations exist
  fanHand(ribbon);

  const cards = Array.from(ribbon.querySelectorAll('.handCard'));
  const dur = 420;
  for (let i=0; i<cards.length; i++){
    await flyClone(deckBtn || cards[i], cards[i], { dur, delay:i*60, scaleTo:1.0 });
  }
}

export async function animateDiscardHand({ribbon, discardBtn}){
  const cards = Array.from(ribbon.querySelectorAll('.handCard'));
  const dur = 360;
  // back-to-front for a nicer feel
  for (let i=cards.length-1; i>=0; i--){
    await flyClone(cards[i], discardBtn || cards[i], { dur, delay:(cards.length-1-i)*60, scaleTo:.84 });
  }
}

export async function animateBuyToDiscard({cardEl, discardBtn}){
  await flyClone(cardEl, discardBtn, { dur:460, scaleTo:.9 });
}
