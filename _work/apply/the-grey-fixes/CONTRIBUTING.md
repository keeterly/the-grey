# Contributing Guide (The Grey)

## Dev Server
This project uses ES modules. Avoid `file://` loads. Run a static server:
- Python: `python -m http.server 5173`
- Node (one-off): `npx serve .`

## Layering (z-index scale)
Use a tiny, named scale instead of extreme integers:
- `--z-base: 0`
- `--z-elevated: 10`
- `--z-overlay: 100`
- `--z-modal: 1000`
- `--z-tooltip: 1100`

Avoid values > 2000 unless there is a documented reason.

## Card sizing
Define shared size tokens in one place and reference everywhere.
See `src/styles/variables.css` for `--card-w`/`--card-h`.

