// /src/ui/animations.js
function waitForAnimations(elements) {
  if (!elements.length) return Promise.resolve();
  let pending = elements.length;
  return new Promise(resolve => {
    elements.forEach(el => {
      const done = () => {
        el.removeEventListener('animationend', done);
        el.removeEventListener('animationcancel', done);
        if (--pending === 0) resolve();
      };
      el.addEventListener('animationend', done);
      el.addEventListener('animationcancel', done);
    });
  });
}

export async function animateDiscardHand() {
  const handCards = [...document.querySelectorAll('#ribbon .rCard')];
  if (!handCards.length) return;

  const target = document.getElementById('chipDiscard');
  if (!target) return;

  const tRect = target.getBoundingClientRect();
  const tX = tRect.left + tRect.width/2;
  const tY = tRect.top  + tRect.height/2;

  handCards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const cX = r.left + r.width/2;
    const cY = r.top  + r.height/2;
    const dx = Math.round(tX - cX);
    const dy = Math.round(tY - cY);

    el.style.setProperty('--dx', dx + 'px');
    el.style.setProperty('--dy', dy + 'px');
    el.style.setProperty('--delay', (i * 40) + 'ms'); // gentle stagger
    el.classList.add('anim-discard');
  });

  await waitForAnimations(handCards);

  // Clean up
  handCards.forEach(el => {
    el.classList.remove('anim-discard');
    el.style.removeProperty('--dx');
    el.style.removeProperty('--dy');
    el.style.removeProperty('--delay');
  });
}

export async function animateDrawHand() {
  const cards = [...document.querySelectorAll('#ribbon .rCard')];
  cards.forEach((el, i) => {
    el.style.setProperty('--delay', (i * 40) + 'ms');
    el.classList.add('anim-draw');
  });

  await waitForAnimations(cards);

  cards.forEach(el => {
    el.classList.remove('anim-draw');
    el.style.removeProperty('--delay');
  });
}
