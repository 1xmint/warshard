# Warshard state

## Decisions — 2026-10-17
- Priority changed from expanding modes to one polished Arcanist and intelligent, adjustable solo duels. Preserve Briarwarden, Ashweaver, maps and battleground work; defer progression and talent/equipment systems.
- Arcanist: mobile pressure, deliberate casts, a bankable two-crit preparation/payoff loop with a guaranteed-crit cooldown and bad-luck protection. One Spellstorm Ascension; Q interrupt, E barrier, five primary skills including blink. Original spell names and presentation.
- Bots: easy remains available; trained/skilled opponents use public observations, delayed decisions and ordinary validated actions. No hidden cooldown knowledge or LLM calls. Reset stays server-authoritative and practice-only.
- Temporary models must be cohesive and commercially redistributable at no cost. Evaluating CC0 animated fantasy assets, with provenance/license vendored beside them.
- Tests run on GitHub CI; only scoped compile/lint work runs on Josh's PC.

## Current state
- Existing online 3D combat and team/CTF practice are on PR #7, stacked on foundation PR #6. New Arcanist work starts from #7 in codex/arcanist-duels.
- WoW-style steering and session-held cursor capture work in Josh's Brave browser. Cursor event work is batched per display frame. Slight lag was reported; Brave FPS/network latency are not measured.
- PR #7's Linux cursor chord regression was fixed by recognizing Pointer Events chord transitions; CI is running. Foundation #6 previously passed CI.
- The Arcanist milestone is not implemented yet. Do not present design choices as playtested fun.

## Next slices
1. Authoritative Arcanist, proc/charge/projectile events and reset/difficulty contracts, with CI scenarios.
2. Inspectable trained/skilled combat bot and quick duel/reset controls.
3. Licensed animated models, original spell icons/effects, proc/audio feedback; verify playable flow and CI.

## Known limits
- Placeholder art, snapshot bandwidth, low-end GPU budgets and internet latency remain constraints. 20v20/40v40 stay disabled.
- An automated Codex in-app-browser click rejected pointer lock; Josh confirmed the controls work in Brave. This is not evidence of a Brave failure.
