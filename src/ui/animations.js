// Tiny animation helpers (classic). You can grow these later.
(function () {
  function buyPulse(cardEl) {
    if (!cardEl) return;
    cardEl.classList.add('buyPulse');
    setTimeout(() => cardEl.classList.remove('buyPulse'), 450);
  }

  // reserved for future: draw/discard streams with bezier arcs
  function noop() {}

  window.Anim = {
    buyPulse,
    drawStream: noop,
    discardStream: noop,
  };
})();
