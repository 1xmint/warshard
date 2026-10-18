# Warshard state

## PvP experience roadmap — 2026-10-18
Josh authorized a cohesive low-resolution fantasy PvP overhaul, preserving menu-to-match entry and exactly two maps. The identity/assets remain original or licensed; WoW is a controls/readability/pacing reference, not a map or asset source. No accounts, progression or new modes in this pass.
1. Combat baseline: complete cast-bar validation, consistent targeting and enemy cast feedback. Prove short/long/instant casts, interrupts, movement and repeated duels through existing authoritative scenarios and browser flows.
2. Maps: authored stone-ruin arena and two-base forest CTF battleground, sharing a cohesive palette and licensed art. Visible cover must match server collision/LOS; walkable routes and flag objectives remain clear. Prove navigation, cover, both map loads and bot/objective play.
3. Spell/readability pass: differentiated bolts/trails/impacts and Spellstorm, coherent combat UI, bounded effect counts and optional quality. Prove existing two-player and battleground flows, inspect real screenshots/client presentation. PvP balance, fun and low-end performance remain playtest/measurement outcomes.
Keep Rust/TypeScript/Babylon and the existing server-authoritative boundary; no rewrite or new infrastructure is justified. Current phases: cast-bar CI validation and map implementation. The cast flow now waits for the server to acknowledge movement release before starting another cast; enemy cast progress uses public snapshots.

## Spell readability — 2026-10-18
- Arcanist projectiles use distinct elongated bright cores and warm trails. Authoritative hit/crit events produce fading rings and ember streaks; Spellstorm has a larger layered gold activation cue. Visuals never schedule or decide damage.
- Projectile visuals are capped at 96, impact groups at 64 and floating numbers at 32. Geometry/materials are reused where practical and expired meshes are disposed. No full-scene bloom pass was added to the shared-PC/browser budget.
- Combat frames and hotbar share a bronze, stone and parchment palette; enemy cast progress is visible for interrupt timing. Original spell names and the existing menu entry remain.

## Cast bar — 2026-10-18
- Flare Lance uses a 1.5-second base cast; Sunshard uses 4.5 seconds, or instant when its proc is consumed. Spellstorm halves these times. Cinder Dart remains the instant mobile attack.
- Player cast bar shows the spell name, remaining/total seconds and a smooth fill driven by authoritative cast start/end ticks. Confirmed interrupts briefly turn it red. Instant spells do not create a fake cast bar.
- KayKit's existing CC0 casting clips remain the compatible character-animation source. Kenney Particle Pack is a verified CC0 option for future particle textures, not an imported ready-made spell system.

## Hotbar readability — 2026-10-18
- Cooldowns use prominent numeric countdowns, including tenths for the final second; charge counts have a separate corner badge. Instant Sunshard has a pulsing gold border and sparks, with reduced-motion support.
- KayKit model orientation is corrected at the imported-model wrapper, preserving simulation facing and fallback-rig orientation.
- Arcanist milestone #9 is merged and passed all eleven browser scenarios plus combat/build checks. This follow-up uses the same CI checks.

## Decisions — 2026-10-17
- Priority changed from expanding modes to one polished Arcanist and intelligent, adjustable solo duels. Preserve Briarwarden, Ashweaver, maps and battleground work; defer progression and talent/equipment systems.
- Arcanist: mobile pressure, deliberate casts, a bankable two-crit preparation/payoff loop with a guaranteed-crit cooldown and bad-luck protection. One Spellstorm Ascension; Q interrupt, E barrier, five primary skills including blink. Original spell names and presentation.
- Bots: easy remains available; trained/skilled opponents use public observations, delayed decisions and ordinary validated actions. No hidden cooldown knowledge or LLM calls. Reset stays server-authoritative and practice-only.
- Temporary models must be cohesive and commercially redistributable at no cost. Use CC0 KayKit Adventurers characters and Kenney Mini Arena art. Kenney supplies ready-made art pieces, not a complete combat level; Warshard authors the layout. Licenses/provenance are vendored beside assets.
- Tests run on GitHub CI; only scoped compile/lint work runs on Josh's PC.

## Current state
- Foundation PR #6 is merged. PR #9 is the integration record for all of PR #7's team/CTF practice and controls work plus the Arcanist milestone; it supersedes #7. Consult #9 for integration status and final CI evidence.
- WoW-style steering and session-held cursor capture work in Josh's Brave browser. Cursor event work is batched per display frame. Slight lag was reported; Brave FPS/network latency are not measured.
- PR #7's Linux cursor chord regression was fixed by recognizing Pointer Events chord transitions. CI subsequently exposed slow-browser five-second setup waits and the former five-minute suite limit; the combined branch must prove these flows before integration. Suite budget is ten minutes.
- Arcanist simulation, charge/proc/projectile events, adjustable bot decisions, quick duels, HUD feedback, synthesized sound and licensed art are implemented. Scoped compile/lint checks, CI's simulation/build stage and Arcanist browser flow (including earned Spellstorm) pass. Live review confirmed animated mages, tiled court, columns, walls and difficulty/reset/menu controls. PR #9 owns final integration evidence; fun and balance require Josh's playtest.
- Browser evidence exposed reused movement sequence numbers after reset; these now remain monotonic within a session. Rendering pauses during connection/recovery and in hidden tabs so expensive GPU work does not compete with handshakes. Startup/recovery assertions retain their outcomes with bounded software-GPU allowances.
- Saved render quality now applies during graphics startup. CI exercises the shipped low-resolution setting rather than oversubscribing software graphics with two full-resolution clients. Initial camera focus snaps to the player; cursor visibility reacts immediately to button transitions, while motion/picking remain batched.
- Headless Chromium emitted unrequested large relative movements after button releases. The same native control assertions passed in desktop Chromium on Xvfb (run 39093928834); CI now runs the full suite in that environment. The cursor explicitly restores its drag anchor before becoming visible.

## Next slices
1. Run CI, resolve correctness/browser regressions, inspect the recorded Arcanist art/flow.
2. Validate Spellstorm expiry and repeated duels, then give Josh focused kit/bot/map playtest prompts.

## Known limits
- Placeholder art, snapshot bandwidth, low-end GPU budgets and internet latency remain constraints. 20v20/40v40 stay disabled.
- An automated Codex in-app-browser click rejected pointer lock; Josh confirmed the controls work in Brave. This is not evidence of a Brave failure.
