#!/usr/bin/env bash
set -euo pipefail
echo "[bot] Applying Hand DnD v2 (auto-detect)"
mkdir -p src/ui src/styles
cp -f the-grey-fixes/src/ui/hand-dnd.js src/ui/hand-dnd.js
cp -f the-grey-fixes/src/styles/hand-dnd.css src/styles/hand-dnd.css

# Link CSS
if [ -f "index.html" ] && ! grep -q 'src/styles/hand-dnd.css' index.html; then
  perl -0777 -pe 's#</head>#  <link rel="stylesheet" href="src/styles/hand-dnd.css">\n</head>#i' index.html > index.html.tmp && mv index.html.tmp index.html || true
fi

# Import module (idempotent)
if [ -f "index.html" ] && ! grep -q 'src/ui/hand-dnd.js' index.html; then
  perl -0777 -pe 's#</body>#  <script type="module" src="src/ui/hand-dnd.js"></script>\n</body>#i' index.html > index.html.tmp && mv index.html.tmp index.html || true
fi

echo "[bot] Done."
