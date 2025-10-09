The Grey — Center Boards + Fanned Hand (Upload Pack)
====================================================

What this is
------------
A single-file drop-in override that recenters the AI and Player boards and
restores the fanned hand layout, without editing HTML or JS.

File included (upload at exact path):
- assets/css/acceptance.safe.css

Why this works
--------------
Your index.html already links to `assets/css/acceptance.safe.css`.
This replacement reinforces a few CSS rules:

- `.slots { justify-content: center; }` centers both boards
- `.board .row:not(.head) { justify-content: center; }` centers non-header rows
- `.board .hand .card { position:absolute; left:50%; transform-origin:50% 90%; }`
  ensures the JS fan transforms are visible/stable

How to install
--------------
1) Download this zip
2) In GitHub web UI, navigate to your repo `v2.1` branch
3) Click "Add file" -> "Upload files"
4) Drag the `assets/css/acceptance.safe.css` file from this zip into the uploader
5) Commit the change (either to a new branch for PR, or directly if you prefer)

Verification
------------
- Load your site (or run locally)
- The AI and Player slot rows are centered
- The hand appears fanned again (cards angled and spaced)

Rollback
--------
If needed, revert the commit or restore your previous `assets/css/acceptance.safe.css`.
