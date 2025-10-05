// Minimal bridge that ensures window.game exists and nudges UI once ready.
export function exposeToWindow() {
  const kick = () => {
    try {
      if (!window.game && window.GameEngine?.create) {
        window.game = window.GameEngine.create();
      }
      // If classic UI has already loaded, init now
      if (window.UI && typeof window.UI.init === 'function' && window.game) {
        window.UI.init(window.game);
      }
    } catch (e) {
      console.warn('[BRIDGE] exposeToWindow error:', e);
    }
  };

  // Try when DOM is ready, and also after a tick for scripts that attach late
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(kick, 0));
  } else {
    setTimeout(kick, 0);
  }
}
