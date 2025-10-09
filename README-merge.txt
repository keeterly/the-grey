Repo‑Merged Variant (v3)

What this is:
- Drop‑in replacements for your existing scripts that do not require editing index.html.
- Adds a HUD overlay (♥, 🜂 temp Aether, ◇ channeled) at 3× size.
- Centers AI & Player slot rows with CSS + JS fallbacks.
- Scales cards +25% and adjusts hand spacing.
- Implements Acceptance Part 1: Start Phase, Market buy with 4/3/2/2/2 (pay 🜂 then ◇; → Discard), Trance with heart pulse.

Install:
1) Copy both files into your repo, replacing existing ones if present:
   - /assets/js/boot.js
   - /assets/js/boot-debug.js
2) Commit & push to branch 2.0.
3) Hard refresh your GitHub Pages site.

Notes:
- If your page loads only one of these (boot.js or boot-debug.js), having both covered ensures it hooks in.
- The HUD reads values from game.players[active].aether and .channeledAether; it updates continuously.
- If your market doesn’t expose game.market.removeAt(i), define window.marketRemoveAt(i) to return the removed card object.
