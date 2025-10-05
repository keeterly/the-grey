# The Grey — Modular Split

This is the modularized version of your project with separated **engine**, **ui**, and **styles**.

## Run
Open `index.html` directly in a browser (no build steps needed).

## Structure
- `/src/engine`: pure game rules & data (no DOM)
- `/src/ui`: rendering, input, DOM wiring
- `/src/styles`: theme/layout/components CSS

## Choose Weavers
Edit `/src/ui/index.js`:
```js
const PLAYER_WEAVER='Emberwright';
const AI_WEAVER='Stormbinder';
```

## Notes
- Slots are fixed at 146px, 3 across.
- Trance shown for **You** and **AI**, with spend menu for You.
- Tap a filled slot card to open Inspect; Advance is a separate button.
