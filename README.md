🜂 The Grey

A Dark Fantasy Deck-Crafting Experience
Designed and Developed by Keeter Ly

🕯 Overview

The Grey is a web-based card game blending deck-building, resource tension, and spellcraft progression.
Each player begins as a Spellweaver, wielding a base deck where every choice—casting or discarding—shapes your control of Aether, the essence of the Grey itself.

⚙️ How to Play

Open the latest build directly in your browser:
➡️ versions/v2.4/index.html

(No build tools or dependencies required.)

📦 Version Structure

/versions/v2.2 — Legacy placeholder and migration notes

/versions/v2.3 — Full playable base game

/versions/v2.4 — Includes Trance Cinematic, sound hooks, and skip functionality

README

🜸 Base Deck — Shared Starting Deck

Each Spellweaver begins with the same core: 10 cards focused on the push-and-pull between casting for power or discarding for Aether.

| Name                    | Type    | Cost | Pip | Effect                                       | Aether | Qty |
| ----------------------- | ------- | ---- | --- | -------------------------------------------- | ------ | --- |
| Pulse of the Grey       | Spell   | 0    | 1   | On Resolve: Draw 1, Gain 1 Aether            | 0      | 3   |
| Wispform Surge          | Spell   | 0    | 1   | On Resolve: Advance another Spell for free   | 0      | 1   |
| Greyfire Bloom          | Spell   | 1    | 1   | On Resolve: Advance another Spell for free   | 0      | 1   |
| Echoing Reservoir       | Spell   | 0    | 1   | On Resolve: Channel 1                        | 2      | 2   |
| Dormant Catalyst        | Spell   | 0    | 1   | On Resolve: Channel 2                        | 1      | 1   |
| Ashen Focus             | Spell   | 0    | 1   | On Resolve: Channel 1 and Draw 1             | 1      | 1   |
| Surge of Ash            | Instant | 1    | —   | Target Spell advances 1 step free            | 0      | 1   |
| Veil of Dust            | Instant | 1    | —   | Prevent 1 damage or negate a hostile Instant | 0      | 1   |
| Glyph of Remnant Light  | Glyph   | 0    | —   | When a Spell resolves → Gain 1 Aether        | 0      | 1   |
| Glyph of Returning Echo | Glyph   | 0    | —   | When you Channel Aether → Draw 1 card        | 0      | 1   |

Total: 10 cards — 6 Spells, 2 Instants, 2 Glyphs

🌫 Aetherflow — Shared Market

The Aetherflow is a dynamic shared market. Cards drift left each turn, and new cards enter from the right.
Costs follow the pattern (4, 3, 2, 2, 2) — creating natural tension between seizing early value or waiting for lower prices.

Instants (5)
| Name             | Cost     | Effect                                       | Role             |
| ---------------- | -------- | -------------------------------------------- | ---------------- |
| Surge of Cinders | 2 Aether | Deal 2 damage to any target                  | Early aggression |
| Pulse Feedback   | 3 Aether | Advance all Spells you control by 1          | Momentum burst   |
| Refracted Will   | 2 Aether | Counter an Instant or negate a Glyph trigger | Defensive answer |
| Aether Impel     | 4 Aether | Gain 3 Aether this turn                      | Temporary boost  |
| Cascade Insight  | 3 Aether | Draw 2 cards, then discard 1                 | Hand filter      |

Spells (6)
| Name             | Cost | Advance        | Effect                                               | Aether Value | Role                  |
| ---------------- | ---- | -------------- | ---------------------------------------------------- | ------------ | --------------------- |
| Resonant Chorus  | 0    | 1 (1 per step) | On Resolve: Gain 2 Aether and Channel 1              | +1           | Hybrid economy bridge |
| Emberline Pulse  | 1    | 1 (1)          | On Resolve: Deal 2 damage and draw 1                 | 0            | Core tempo upgrade    |
| Fractured Memory | 0    | 2 (1 each)     | On Resolve: Draw 2 cards                             | 0            | Card advantage tool   |
| Obsidian Vault   | 0    | 1 (2)          | On Resolve: Channel 2 and gain 1 Aether              | +1           | Long-term economy     |
| Mirror Cascade   | 1    | 1 (2)          | On Resolve: Copy the next Instant you play this turn | 0            | Combo enabler         |
| Sanguine Flow    | 2    | 1 (1)          | On Resolve: Lose 1 Vitality, Gain 3 Aether           | 0            | Risk-reward burst     |

Glyphs (4)
| Name                     | Cost | Condition                            | Effect              | Role             |
| ------------------------ | ---- | ------------------------------------ | ------------------- | ---------------- |
| Glyph of Withering Light | 0    | When an opponent plays a Spell       | They lose 1 Aether  | Tempo tax        |
| Glyph of Vigilant Echo   | 0    | At end of your turn                  | Channel 1           | Slow engine      |
| Glyph of Buried Heat     | 0    | When you discard a card for Aether   | Gain 1 extra Aether | Economy reward   |
| Glyph of Soulglass       | 0    | When you buy a card from Aether Flow | Draw 1 card         | Deck-growth loop |

📊 Aetherflow Summary
| Type     | Count | Theme                                   |
| -------- | ----- | --------------------------------------- |
| Instants | 5     | Tempo, damage, draw, reaction           |
| Spells   | 6     | Hybrid economy and engine tools         |
| Glyphs   | 4     | Passive synergy and resource automation |

The Aetherflow acts as a living market — a current of shifting value and scarcity that forces players to balance greed against timing.


🜍 Glossary

Vitality (HP): Life total, base 5

Trance: Staged power triggered by HP thresholds

Advance: Pay Aether to progress a Spell

Channel: Convert Aether → Channeled

Set: Place a Glyph

Aether Flow: Shared market row for purchases

Discard Loop: Bought cards cycle back into play after the first reshuffle

🧩 Version

Current: v2.4 (2025-10-11)

README

No dependencies. Launch directly in browser.
