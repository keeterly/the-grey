# The Grey — Fix Pack

This bundle adds:
- **LICENSE (MIT)**
- **.gitignore**
- **scripts/write-stamp.mjs** (generates `stamp.json` with branch/SHA/time)
- **src/styles/variables.css** (central card sizing + z-index scale)
- **.github/workflows/ci.yml** (lint check + Pages deploy)

## Apply
From the repo root:

```bash
# 1) Copy files into the repo
cp -r the-grey-fixes/* .

# 2) (Optional) Import CSS variables near your main CSS entry
#    e.g., in index.css or components.css:
#    @import "./src/styles/variables.css";

# 3) Generate a build stamp locally
node scripts/write-stamp.mjs

# 4) Commit
git add .github/workflows/ci.yml LICENSE .gitignore scripts/write-stamp.mjs src/styles/variables.css
git commit -m "chore: repo hygiene, seedable stamp, css vars, CI + Pages"

# 5) Push
git push origin -u <your-branch>
```

## Reducer bug & AI getState() mismatch
I cannot modify your files directly here, but the safe edits are:

**Fix reducer (`rules.js`):** In the `END_TURN` handler, replace any `state` refs with the reducer state param (likely `S`), and return a new object, e.g.:
```js
const row = S.flowRow.slice();
for (let i = row.length - 1; i > 0; i--) row[i] = row[i - 1];
row[0] = drawNewFlowCard(S);
return { ...S, flowRow: row, turn: S.turn + 1 };
```

**Expose `getState()` or update callers:** If `ai.js` uses `game.getState()`, either add
```js
getState() { return this.state; }
```
to the engine export, or change the call sites to `game.state`.
```

