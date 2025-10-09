The Grey — Corrected Upload Pack
================================

Upload these files to the SAME BRANCH that your GitHub Pages is serving from
(usually `main` by default), not just `v2.1`:

- assets/css/acceptance.safe.css
- assets/js/boot-debug.js
- assets/js/engine.acceptance.safe.js

Why:
- Centers boards & restores fanned hand (CSS)
- Fixes the 404 and import error by changing boot-debug.js to import a local
  module path: './engine.acceptance.safe.js' and provides that file.

Steps (GitHub Web UI)
---------------------
1) Check your Pages source: Repo -> Settings -> Pages -> Source.
2) Switch to that branch in the GitHub UI (often `main`).
3) Click "Add file" -> "Upload files".
4) Drag the three files from this zip, preserving their exact paths.
5) Commit. Then hard-refresh your site.

Optional quick test:
- Temporarily remove the <script src="./assets/js/boot-debug.js"></script> tag
  in index.html to confirm the page loads without errors; then add it back after
  uploading the corrected JS files.
