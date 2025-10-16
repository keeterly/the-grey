/* device-profile.js
   Adds/removes .is-mobile on <html> and sets scaling CSS vars.
   - Auto-detects (pointer:coarse, UA, small height)
   - Manual override via localStorage or URL:
       ?profile=mobile  (forces mobile)
       ?profile=desktop (forces desktop)
   - Local override persists: localStorage.setItem('grey:profile', 'mobile'|'desktop'|'auto')
*/

(function () {
  const DOC = document.documentElement;

  const getQueryProfile = () => {
    const m = /(?:\?|&)profile=(mobile|desktop|auto)\b/i.exec(location.search);
    return m ? m[1].toLowerCase() : null;
  };

  const getStoredProfile = () => {
    try { return (localStorage.getItem('grey:profile') || '').toLowerCase() || null; }
    catch { return null; }
  };

  const setClass = (isMobile) => {
    DOC.classList.toggle('is-mobile', !!isMobile);
  };

  const applyVars = () => {
    if (!DOC.classList.contains('is-mobile')) {
      // desktop → clear overrides to use CSS defaults
      DOC.style.removeProperty('--card-w');
      DOC.style.removeProperty('--card-radius');
      DOC.style.removeProperty('--gem-size');
      DOC.style.removeProperty('--hand-height');
      DOC.style.removeProperty('--ui-gap');
      return;
    }

    // iPhone-landscape–friendly sizing
    const W = window.innerWidth;
    const H = window.innerHeight;

    const targetFlowCols = 5;
    const gutters = 16 * (targetFlowCols - 1) + 32; // gaps + board padding
    const byWidth  = Math.max(78, Math.min(116, Math.floor((W - gutters) / targetFlowCols)));
    const byHeight = Math.max(78, Math.min(116, Math.floor((H * 0.58) / 3))); // ~3 rows

    const cardW = Math.min(byWidth, byHeight);

    DOC.style.setProperty('--card-w', `${cardW}px`);
    DOC.style.setProperty('--card-radius', `12px`);
    DOC.style.setProperty('--gem-size', `${Math.round(cardW * 0.62)}px`);
    DOC.style.setProperty('--hand-height', `22vh`);
    DOC.style.setProperty('--ui-gap', `10px`);
  };

  const detectMobile = () => {
    const coarse   = matchMedia('(pointer:coarse)').matches;
    const narrowH  = Math.min(window.innerWidth, window.innerHeight) <= 430;
    const uaMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    return coarse || uaMobile || narrowH;
  };

  const resolveProfile = () => {
    // precedence: URL > localStorage > auto
    const url = getQueryProfile();
    if (url === 'mobile')  return 'mobile';
    if (url === 'desktop') return 'desktop';

    const stored = getStoredProfile();
    if (stored === 'mobile' || stored === 'desktop') return stored;

    return 'auto';
  };

  const applyProfile = () => {
    const profile = resolveProfile();
    const mobile = (profile === 'mobile') || (profile === 'auto' && detectMobile());
    setClass(mobile);
    applyVars();
  };

  // Expose a tiny API for dev toggling in console
  window.GreyProfile = {
    set(profile /* 'mobile'|'desktop'|'auto' */) {
      try {
        if (!profile) profile = 'auto';
        localStorage.setItem('grey:profile', profile);
      } catch {}
      applyProfile();
    },
    get() { return { classList: [...document.documentElement.classList], vars: getComputedStyle(document.documentElement) }; }
  };

  applyProfile();
  window.addEventListener('resize', applyProfile, { passive: true });
})();