#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
echo "[bot] Applying Hand DnD v3 from $SCRIPT_DIR"

mkdir -p src/ui src/styles

cp -f "$SCRIPT_DIR/src/ui/hand-dnd.js" "src/ui/hand-dnd.js"
cp -f "$SCRIPT_DIR/src/styles/hand-dnd.css" "src/styles/hand-dnd.css"

# Insert CSS link in <head> if missing
if [[ -f "index.html" ]] && ! grep -q 'src/styles/hand-dnd.css' "index.html"; then
  perl -0777 -pe 's#</head>#  <link rel="stylesheet" href="src/styles/hand-dnd.css">\n</head>#i' \
    "index.html" > "index.html.tmp" && mv "index.html.tmp" "index.html"
fi

# Insert module script before </body> if missing
if [[ -f "index.html" ]] && ! grep -q 'src/ui/hand-dnd.js' "index.html"; then
  perl -0777 -pe 's#</body>#  <script type="module" src="src/ui/hand-dnd.js"></script>\n</body>#i' \
    "index.html" > "index.html.tmp" && mv "index.html.tmp" "index.html"
fi

echo "[bot] Done."
