#!/usr/bin/env bash
set -euo pipefail

echo "Applying The Grey fix helpers..."

# Ensure repo root (has .git)
if [ ! -d .git ]; then
  echo "Run this from your repo root (where .git exists)."
  exit 1
fi

# Copy hygiene files
cp -r the-grey-fixes/.github . || true
cp -r the-grey-fixes/scripts . || true
cp -r the-grey-fixes/src/styles . || true
cp the-grey-fixes/LICENSE .
cp the-grey-fixes/.gitignore .

# Generate stamp
node scripts/write-stamp.mjs || true

# Best-effort reducer fix (backup first)
if [ -f "rules.js" ]; then
  cp rules.js rules.js.bak
  # Replace occurrences of 'state.' with 'S.' only in END_TURN case block heuristically
  # (Non-destructive: keeps backup)
  perl -0777 -pe 'if(m/case\s*[\'\"\`]END_TURN[\'\"\`]:([\s\S]*?)break;/){$b=$&;$nb=$b;$nb=~s/\bstate\./S./g;$_=~s/\Q$b\E/$nb/} $_' rules.js > rules.js.tmp && mv rules.js.tmp rules.js
fi

# Best-effort getState shim in engine.js
if [ -f "engine.js" ]; then
  cp engine.js engine.js.bak
  # If getState() not present, add a simple shim after 'get state()'
  if ! grep -q "getState()" engine.js; then
    perl -0777 -pe 's/(get\s+state\s*\(\)\s*\{[\s\S]*?\})/\1\n\n  getState() { return this.state; }/ if /get\s+state\s*\(\)/' engine.js > engine.js.tmp || true
    [ -s engine.js.tmp ] && mv engine.js.tmp engine.js || rm -f engine.js.tmp
  fi
fi

echo "Done. Review diffs, commit, and push."
