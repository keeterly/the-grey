The Grey — Unified Upload Pack
==============================

This pack fixes two issues via simple uploads (no Codespaces needed):

1) Center both boards + restore the fanned hand:
   - File: assets/css/acceptance.safe.css  (drop-in replacement)

2) Fix the 404 import error for "engine.acceptance.safe.js":
   - File: assets/js/assets/js/engine.acceptance.safe.js
     (A small compatibility shim that re-exports from the correct engine module.)

Upload Steps (GitHub web UI)
----------------------------
1) Go to your repo, branch v2.1
2) Click "Add file" -> "Upload files"
3) Drag the two paths from this zip into the uploader:
   - assets/css/acceptance.safe.css
   - assets/js/assets/js/engine.acceptance.safe.js
4) Commit (to a new branch + PR, or directly to v2.1)
5) Hard refresh your site. The console 404 should be gone, boards centered, hand fanned.

Notes
-----
- The JS shim is intentionally placed at a nested path to match the incorrect
  dynamic import URL. It simply re-exports from ../../engine.acceptance.js.
- If you later correct the import path in boot-debug.js, you can delete the shim.
