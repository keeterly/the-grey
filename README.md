# The Grey — v2.1 Clean Rebuild

This is a from‑scratch, minimal, **stable** rebuild that restores the broken core loops:

- Drag & drop from hand → Player Spell Slot
- Dedicated **Glyph Slot**
- End‑turn hand discard (+1 Aether baseline to player; AI also accrues & spends)
- Base deck of 10 cards across **Instant / Spell / Glyph**
- Long‑press preview (slide‑up and zoom)
- Pips visible on slotted Spells; **Advance** spends Aether and animates
- AI plays with simple priorities and **animates** plays/advances/resolves

No build tooling required. Works on GitHub Pages.

## Run locally
Open `index.html` directly, or run a tiny static server:

```bash
npx http-server -p 8080
# or
python3 -m http.server 8080
```
