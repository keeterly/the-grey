The Grey — Cleanup Upload Pack (v2.1)
=====================================

This pack removes the temporary nested-path shim and bumps the version badge.

Included
--------
- assets/js/boot-debug.js
    - Imports './engine.acceptance.js' directly (no shim)
    - Sets window.__THE_GREY_BUILD = 'v2.3.9-acceptanceP1-safe-v13' for visual confirmation
- assets/css/acceptance.safe.css
    - Centers boards and keeps the fanned hand stable

Install (GitHub Web UI) — v2.1 branch
-------------------------------------
1) Switch to branch: v2.1
2) Add file -> Upload files
3) Drag both files keeping the exact paths:
   - assets/js/boot-debug.js
   - assets/css/acceptance.safe.css
4) Commit
5) Hard refresh your site (Cmd/Ctrl+Shift+R). You should see:
   - Version badge: "The Grey — v2.3.9-acceptanceP1-safe-v13"
   - No JS import errors
   - Centered boards and a fanned hand

Cleanup (optional)
------------------
If you previously uploaded a nested shim at:
  assets/js/assets/js/engine.acceptance.safe.js
you can now delete it from v2.1 — it is no longer used.

If your GitHub Pages is NOT serving from v2.1
---------------------------------------------
Upload these files to the branch your Pages site uses
(Settings -> Pages -> Source), or switch the Pages source to v2.1.
