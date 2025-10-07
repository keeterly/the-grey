
#!/usr/bin/env bash
set -euo pipefail
echo "[bot] Applying RNG+Perf bundle + Pages CI"

mkdir -p src/lib src/styles src/ui .github/workflows
cp -f the-grey-fixes/src/lib/seeded-rng.js src/lib/seeded-rng.js
cp -f the-grey-fixes/src/styles/perf.css src/styles/perf.css
cp -f the-grey-fixes/src/ui/anim-helpers.js src/ui/anim-helpers.js
cp -f the-grey-fixes/README_RNG_PERF.md README_RNG_PERF.md
cp -f the-grey-fixes/.github/workflows/ci.yml .github/workflows/ci.yml

RNG_FILE=""
if [ -f "rng.js" ]; then RNG_FILE="rng.js";
elif [ -f "src/rng.js" ]; then RNG_FILE="src/rng.js";
else RNG_FILE=$(git ls-files | grep -E '(^|/)rng\.js$' | head -n1 || true);
fi

if [ -n "${RNG_FILE}" ]; then
  cp "${RNG_FILE}" "${RNG_FILE}.bak"
  if ! grep -q "__the_grey_rng__" "${RNG_FILE}"; then
    perl -0777 -pe 'BEGIN{$/=undef} s/^\s*(?=.)/\/\* [bot] Seeded RNG shim *\/\n(function(g){function mulberry32(a){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)\/4294967296}function mk(s){s=s>>>0;let x=s||0x1A2B3C4D;return function(){x=(x+0x9E3779B9)>>>0;return mulberry32(x)}}var SEED=(typeof g.__THE_GREY_SEED!=="undefined")?g.__THE_GREY_SEED:null;var RNG=SEED==null?Math.random:mk(SEED);g.__the_grey_rng__=RNG;})(typeof globalThis!=="undefined"?globalThis:window);function __rng(){return(typeof __the_grey_rng__==="function"?__the_grey_rng__:Math.random)();}\n\n/s' "${RNG_FILE}" > "${RNG_FILE}.tmp" && mv "${RNG_FILE}.tmp" "${RNG_FILE}"
  fi
  perl -0777 -pe 's/\bMath\.random\s*\(\s*\)/__rng()/g' "${RNG_FILE}" > "${RNG_FILE}.tmp" && mv "${RNG_FILE}.tmp" "${RNG_FILE}"
else
  echo "[bot] No rng.js found; skipped RNG patch."
fi

if [ -f "index.html" ] && ! grep -q 'src/styles/perf.css' index.html; then
  perl -0777 -pe 's#</head>#  <link rel="stylesheet" href="src/styles/perf.css">\n</head>#i' index.html > index.html.tmp && mv index.html.tmp index.html || true
fi

echo "[bot] Done"
