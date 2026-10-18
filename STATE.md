# Warshard state

## Expanded Arcanist kit (2026-10-18)
Josh expanded the active scope to ten keys and a connected mobile-burst playstyle. Roadmap: (1) preserve bot navigation/team/GCD corrections; (2) implement authoritative mobile casts, explicit off-GCD rules, delayed area impact and radial roots with regression scenarios; (3) connect the ten-key HUD, bot priorities and spell presentation, then validate on CI and review screenshots. Use existing Rust/TypeScript/Babylon boundaries; no new services or progression.
Kit: 1 Cinder Dart, 1.0s moving cast, 50 damage, primes Kindling on a normal hit (cannot complete it without a crit); 2 Flare Lance, 1.5s stationary filler, 145 damage; 3 Flashkindle, two guaranteed-crit instant charges, 55 base damage, sequential 10s recharge; 4 Sunshard, 4.5s/instant proc, 300 damage, crits feed Kindling; 5 Riftstep, two 5m blink charges/sequential 12s recharge, off-GCD and cancels your cast. Q Prism Ward, 240 shield/6s, 20s cooldown, off-GCD and preserves a cast. E Crownfall, 0.75s stationary cast then 1.2s fall onto the target's captured position, 240 base damage in 2.7m with criticals feeding Kindling, 20s cooldown. R Firestorm retains the 12s transformation and launches a 180-base-damage/4m explosion that applies 22-base-damage Ignite each second for 8s; burn criticals advance Kindling at most once per second across all targets. F Sunderflare deals 70 damage, slows 1.5s and interrupts/locks school for 3s/10s cooldown. C Glasswake roots enemies within 2.7m for 3s/18s cooldown using existing root diminishing returns.
Utility slots are Q=5, E=6, F=7, C=8; R remains an independent ultimate. Off-GCD behavior belongs to ability definitions rather than slot numbers. Only movement, blink and interrupt cancel ordinary casts; the shield does not. Meteor aim locks when its cast completes; its area appears during descent, damages only enemies still in range/LOS at impact and is cleared on reset. Damage causes no cast pushback; Q absorbs damage rather than granting interrupt immunity. Every key needs a distinct animation/effect and tactical role. Firestorm uses an optional data-defined form activation; burns refresh per source/target/ability, never stack, follow their victim, and clear on death/reset/match end. Initial numbers are tuning values; fun/balance require playtests.

## Bot combat and hotbar follow-up (2026-10-18)
Clearance-aware routing now handles valid destinations beside blocked grid centers and validates every route segment. Trained bots retain CTF flag roles, prefer exposed targets, spread away from nearby allies and check their own cooldowns before interrupts/defenses. Normal practice uses trained opponents and Arcanist caster slots; the selectable Easy duel remains. Mage priority: instant Sunshard, controlled/clustered-target Crownfall, Flashkindle to complete Kindling, stationary Flare Lance, mobile Cinder Dart; shield, root, blink and delayed interrupts provide survival and setup. Team badges/rings identify every combatant; GCD uses a shrinking shadow while numbers show personal cooldowns only. CI owns navigation, sustained rotation, 12-bot objective and browser proof; scoped builds run locally.

## PvP experience roadmap — 2026-10-18
Josh authorized a cohesive low-resolution fantasy PvP overhaul, preserving menu-to-match entry and exactly two maps. The identity/assets remain original or licensed; WoW is a controls/readability/pacing reference, not a map or asset source. No accounts, progression or new modes in this pass.
1. Combat baseline: complete cast-bar validation, consistent targeting and enemy cast feedback. Prove short/long/instant casts, interrupts, movement and repeated duels through existing authoritative scenarios and browser flows.
2. Maps: authored stone-ruin arena and two-base forest CTF battleground, sharing a cohesive palette and licensed art. Visible cover must match server collision/LOS; walkable routes and flag objectives remain clear. Prove navigation, cover, both map loads and bot/objective play.
3. Spell/readability pass: differentiated bolts/trails/impacts and Spellstorm, coherent combat UI, bounded effect counts and optional quality. Prove existing two-player and battleground flows, inspect real screenshots/client presentation. PvP balance, fun and low-end performance remain playtest/measurement outcomes.
Keep Rust/TypeScript/Babylon and the existing server-authoritative boundary; no rewrite or new infrastructure is justified. All three implementation slices are built; PRs #11 (cast bars), #12 (maps) and #13 (spell/HUD presentation) own CI, screenshot evidence and integration status. The cast flow waits for the server to acknowledge movement release before starting another cast; enemy cast progress uses public snapshots.

## Spell readability — 2026-10-18
- Arcanist projectiles use distinct elongated bright cores, warm trails and soft additive halos from one shared 64px procedural texture. Authoritative hit/crit events produce fading rings and ember streaks; Spellstorm has a larger layered gold activation cue. Visuals never schedule or decide damage.
- Projectile visuals are capped at 96, impact groups at 64 and floating numbers at 32. Geometry/materials are reused where practical and expired meshes are disposed. No full-scene bloom pass was added to the shared-PC/browser budget.
- Combat frames and hotbar share a bronze, stone and parchment palette; enemy cast progress is visible for interrupt timing. Original spell names and the existing menu entry remain. The expanded kit now uses Q/E/F/C below the cast bar; the default camera is angled lower to show character bodies.

## Forest and arena (2026-10-18)
- Riftwood Crossing has opposing Jade/Ember courtyards and three dirt routes. Rock clusters sit within visible gravel footprints matching the authoritative cover circles. Tall trees/camps stay outside the playable boundary; trees on the camera's side hide to keep combatants visible.
- Shattered Court has a worn central floor, varied ruined walls, corner towers and existing cover pillars. Both maps retain their gameplay dimensions and server collision. The renderer selects art by authoritative map identity.
- Selected unmodified Kenney Nature Kit CC0 models are vendored with their license, pinned official download and archive hash. Static terrain is batched by material; imported model containers are cached. Low-end rendering remains a measurement target.
- PR #13 integrates the map work from #12 and spell/HUD presentation on merged cast-bar foundation #11; it owns final CI, screenshots and integration status.

## Cast bar — 2026-10-18
- Flare Lance uses a 1.5-second base cast; Sunshard uses 4.5 seconds, or instant when its proc is consumed. Spellstorm halves these times. The subsequent ten-key kit changes Cinder Dart to a 1-second cast that allows movement.
- Player cast bar shows the spell name, remaining/total seconds and a smooth fill driven by authoritative cast start/end ticks. Confirmed interrupts briefly turn it red. Instant spells do not create a fake cast bar.
- KayKit's existing CC0 casting clips remain the compatible character-animation source. Kenney Particle Pack is a verified CC0 option for future particle textures, not an imported ready-made spell system.

## Hotbar readability — 2026-10-18
- Cooldowns use prominent numeric countdowns, including tenths for the final second; charge counts have a separate corner badge. Instant Sunshard has a pulsing gold border and sparks, with reduced-motion support.
- KayKit model orientation is corrected at the imported-model wrapper, preserving simulation facing and fallback-rig orientation.
- Arcanist milestone #9 is merged and passed all eleven browser scenarios plus combat/build checks. This follow-up uses the same CI checks.

## Decisions — 2026-10-17
- Priority changed from expanding modes to one polished Arcanist and intelligent, adjustable solo duels. Preserve Briarwarden, Ashweaver, maps and battleground work; defer progression and talent/equipment systems.
- Arcanist: mobile pressure, deliberate casts, a bankable two-crit preparation/payoff loop with a guaranteed-crit cooldown and bad-luck protection. One Spellstorm Ascension; the 2026-10-18 kit supersedes the original Q interrupt/E barrier bindings with Q shield/E meteor/F interrupt/C root. Original spell names and presentation.
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
1. Playtest the Arcanist duel: short/long casts, instant payoff, interrupt readability, bolt visibility and bot difficulty.
2. Playtest Riftwood Crossing routes, base recognition and cover in 6v6/10v10 practice; tune from observed problems.
3. Measure Brave frame time and network latency before adding heavier rendering or enabling larger rosters.

## Known limits
- Placeholder art, snapshot bandwidth, low-end GPU budgets and internet latency remain constraints. 20v20/40v40 stay disabled.
- An automated Codex in-app-browser click rejected pointer lock; Josh confirmed the controls work in Brave. This is not evidence of a Brave failure.
