(function(){
  // Mirror existing End Turn into a floating mobile FAB.
  const END_TURN_SELECTORS = ['#btn-endturn-hud', '#btn-end-turn'];
  const mmFab = window.matchMedia('(max-width: 600px)');
  function findEndTurn(){
    for (const sel of END_TURN_SELECTORS){
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }
  function ensureFab(){
    let fab = document.querySelector('.mobile-fab');
    if (!mmFab.matches){ if (fab) fab.remove(); return; }
    if (!fab){
      fab = document.createElement('button');
      fab.className = 'mobile-fab';
      fab.type = 'button';
      fab.setAttribute('aria-label','End turn');
      fab.textContent = '»';
      fab.addEventListener('click', () => {
        const endBtn = findEndTurn();
        endBtn?.click();
      }, { passive: true });
      document.body.appendChild(fab);
    }
  }
  ensureFab();
  mmFab.addEventListener('change', ensureFab);
  new MutationObserver(ensureFab).observe(document.body, { childList:true, subtree:true });

  // -------- Card modal for mobile: tap to read, long press handled by existing zoom --------
  const mmCards = window.matchMedia('(max-width: 600px)');
  let modalEl, modalContent, modalClose;
  let touchStartTime = 0;

  function createCardModal(){
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'card-modal';
    Object.assign(modalEl.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      display: 'none',
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(6px)',
      alignItems: 'center',
      justifyContent: 'center'
    });
    // Close button
    modalClose = document.createElement('button');
    modalClose.textContent = '✕';
    Object.assign(modalClose.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      zIndex: '10001',
      appearance: 'none',
      border: 'none',
      background: '#c6a56a',
      color: '#0d0a07',
      fontWeight: '800',
      borderRadius: '8px',
      padding: '4px 8px',
      cursor: 'pointer'
    });
    modalClose.addEventListener('click', closeCardModal);
    modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
      maxWidth: '90vw',
      maxHeight: '85vh',
      overflowY: 'auto',
      borderRadius: '16px',
      padding: '8px'
    });
    modalEl.appendChild(modalContent);
    modalEl.appendChild(modalClose);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeCardModal();
    });
    document.body.appendChild(modalEl);
  }
  function openCardModal(card){
    createCardModal();
    modalContent.innerHTML = '';
    const clone = card.cloneNode(true);
    clone.style.position = 'static';
    clone.style.transform = 'none';
    clone.style.width = '100%';
    clone.style.maxWidth = '100%';
    clone.style.margin = '0 auto';
    modalContent.appendChild(clone);
    modalEl.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
  }
  function closeCardModal(){
    if (!modalEl) return;
    modalEl.style.display = 'none';
    modalContent.innerHTML = '';
    document.documentElement.style.overflow = '';
  }
  function wireCard(card){
    if (card.dataset.modalWired) return;
    card.dataset.modalWired = '1';
    card.addEventListener('touchstart', (e) => {
      if (!mmCards.matches) return;
      touchStartTime = performance.now();
    }, { passive: true });
    card.addEventListener('touchend', (e) => {
      if (!mmCards.matches) return;
      const duration = performance.now() - touchStartTime;
      // treat as tap if under 250ms
      if (duration < 250){
        // prevent default to avoid triggering other handlers like drag
        e.preventDefault();
        openCardModal(card);
      }
      touchStartTime = 0;
    }, { passive: false });
    // Fallback click (for non-touch pointer on mobile)
    card.addEventListener('click', (e) => {
      if (!mmCards.matches) return;
      if (e.defaultPrevented) return;
      openCardModal(card);
    });
  }
  function wireAllCards(){
    if (!mmCards.matches) return;
    document.querySelectorAll('.hand .card, #hand .card').forEach(wireCard);
  }
  function ensureCardWiring(){
    wireAllCards();
  }
  ensureCardWiring();
  mmCards.addEventListener('change', () => {
    if (!mmCards.matches){ closeCardModal(); }
    ensureCardWiring();
  });
  new MutationObserver(ensureCardWiring).observe(document.body, { childList:true, subtree:true });
})();