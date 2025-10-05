/* =========================================================
 * THE GREY — UI Animations (hand fan + helpers)
 * Classic global (no ESM). Exposes window.Anim.
 * =======================================================*/

(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /**
   * Fan the hand with a subtle, natural curve (tight spread).
   * - Smaller angles, smoother lift, consistent spacing.
   * - Keeps text readable and prevents extreme overlap.
   *
   * @param {HTMLElement} container  .ribbon element
   * @param {Object} [opt]
   *   .spacing  px per card (default 28)
   *   .maxAngle total angle across hand in degrees (default 12)
   *   .maxLift  maximum upward arc in px (default 14)
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
      const angle = (fromMid) * angleStep; // degrees

      // Horizontal spacing
      const x = fromMid * spacing;

      // Vertical arc (parabolic)
      const t = Math.abs(fromMid) / (mid || 1);
      const y = -maxLift * (1 - (t * t)); // peak in middle

      // Stacking: center cards win, but never drop below 100
      el.style.zIndex = String(200 + i);

      // Smooth transform
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;
    });
  }

  /**
   * Reset hand transforms (used when leaving the ribbon or
   * after a tight animation).
   */
  function unfanHand(container) {
    const cards = container.querySelectorAll('.handCard');
    cards.forEach((el) => {
      el.style.transform = '';
      el.style.zIndex = '';
    });
  }

  // Optional: tiny entrance “settle” animation for the hand
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

  // Expose globals
  window.Anim = {
    fanHand,
    unfanHand,
    settleHand
  };
})();
