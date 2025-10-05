/* =========================================================
 * THE GREY — UI Animations (hand fan + helpers)
 * Classic global (no ESM). Exposes window.Anim.
 * =======================================================*/

(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /**
   * Fan the hand with a subtle, natural curve (tight spread).
   * @param {HTMLElement} container  .ribbon element
   * @param {Object} [opt] { spacing, maxAngle, maxLift }
   */
  function fanHand(container, opt = {}) {
    const cards = Array.from(container.querySelectorAll('.handCard'));
    const n = cards.length;
    if (n === 0) return;

    const spacing  = opt.spacing  ?? 28;  // tighter spacing
    const maxAngle = opt.maxAngle ?? 12;  // total spread across whole hand
    const maxLift  = opt.maxLift  ?? 14;  // gentle arc

    const mid = (n - 1) / 2;
    const angleStep = (n > 1) ? (maxAngle / (n - 1)) : 0;

    cards.forEach((el, i) => {
      const fromMid = i - mid;

      // Angle: small tilt toward edges
      const angle = (fromMid) * angleStep;

      // Horizontal spacing
      const x = fromMid * spacing;

      // Vertical arc (parabolic)
      const t = Math.abs(fromMid) / (mid || 1);
      const y = -maxLift * (1 - (t * t)); // peak in middle

      el.style.zIndex = String(200 + i);
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;
    });
  }

  function unfanHand(container) {
    const cards = container.querySelectorAll('.handCard');
    cards.forEach((el) => {
      el.style.transform = '';
      el.style.zIndex = '';
    });
  }

  // Tiny entrance “settle” animation for the hand
  function settleHand(container) {
    const cards = Array.from(container.querySelectorAll('.handCard'));
    cards.forEach((el, i) => {
      el.animate(
        [
          { transform: 'translate3d(0, 8px, 0) scale(.98)', opacity: 0 },
          { transform: el.style.transform || 'none', opacity: 1 }
        ],
        { duration: 180 + i * 12, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
      );
    });
  }

  window.Anim = { fanHand, unfanHand, settleHand };
})();
