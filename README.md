# Warshard

An original browser fantasy PvP game: deliberate target-based combat, readable positioning, and temporary transformations. The current focus is **Cinderborn**, an original fire elemental: build Embers, spread burns and earn a Firestorm Ascension with a different primary kit. The stable content ID remains arcanist. The existing **Briarwarden**, melee fighter and **Ashweaver** spellcaster remain playable in team arenas and capture-the-flag battlegrounds. Arenas support 1v1, 2v2, 3v3, 4v4 and 5v5. Battleground playlists support 6v6 and 10v10; 20v20 and 40v40 remain disabled pending capacity work. Exactly two maps: **The Shattered Court** for every arena size and **Riftwood Crossing** shared by both battleground sizes.

Hold left mouse and drag to orbit the camera without turning your character. Hold right mouse and drag to turn the camera and character together; hold both buttons to run forward. The first right-click captures the mouse with browser pointer lock for continuous turning. Releasing the buttons shows a game-drawn cursor for targeting, ground placement and HUD buttons, retaining the lock between drags so it is not requested on every press. Escape, losing focus, leaving the match or opening a menu releases the real cursor and stops mouse movement; right-click again during play to recapture. The browser may show its capture notice when a new lock starts. If a browser blocks pointer lock, ordinary visible-cursor drag remains available. WASD moves relative to character facing; the wheel zooms. A short left click still selects a target or places a ground spell. Tab or clicking a character selects an enemy; 1–5 use the active form's kit; Q/E use Cinderborn utilities; other classes retain Q mobility (Briar Rush closes toward an enemy; Ashstep retreats); R transforms at full energy. Roots block mobility and diminish across repeated applications: full, half, quarter, then immune, resetting after 18 seconds without another root. Ground abilities enter placement mode, confirmed by clicking terrain; Escape cancels. Facing is visual; attacks still use forgiving target/range/line-of-sight checks. No dodge rolls or mandatory skillshots. Temporary animated characters use the free CC0 KayKit Adventurers pack; the ruined arena uses CC0 Kenney Mini Arena art with an authored combat layout. Riftwood Crossing uses CC0 Kenney Nature Kit scenery, two team bases and three dirt routes around authoritative rocky cover. Tall decorative scenery stays beyond the playable boundary. Licenses and pinned provenance are in `client/public/assets`. Spell icons, effects and synthesized audio are original temporary work, not finished production art.

## Run and validate

Requires Rust stable (1.88+), Node 22.12+ and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:5173 → **Cinderborn duel · Play now** for solo combat. The elemental uses **eight active keys**. There are no fire-hero slows, roots or standalone interrupts; other heroes retain their control abilities.

| Key | Base form | Firestorm Ascendant |
| --- | --- | --- |
| 1 | Cinder Dart: one-second moving cast, one Ember plus another on critical; applies Ignite | Infernal Jet: faster moving builder |
| 2 | Flashkindle: two guaranteed-critical charges, builds two Embers; usable during another cast and off-GCD | Solar Burst: charged area explosions; Ember gains are bounded per cast |
| 3 | Sunshard: spend three Embers on an instant heavy fireball; a critical seeds another Ember | Worldflare: miniature sun explosion converts half of remaining Ignite into immediate damage, consuming that burn portion |
| 4 | Furnace Bolt: 1.5-second stationary builder, two Embers; spreads an existing Ignite to one nearby enemy | Living Sun: conjure one orbiting sun; echoes the next three finishers at 35% direct damage, without resources, burns or recursive copies |
| 5 | Cinderstep: two facing-based blink charges, sequential 12-second recharge | Same movement |
| Q | Molten Shell: absorb 240 damage for six seconds, off-GCD; does not cancel your cast | Same defense |
| E | Crownfall: 0.75-second cast, then meteor falls for 1.2 seconds at the captured target position; explosion applies Ignite | Same delayed pressure |
| R | At 100 earned energy, launch Firestorm, gain three Embers and transform for twelve seconds | The primary kit changes until the form expires |

Start with **1 → 2 → glowing 3**. Use **4** when you can safely commit to a cast, or **1** while moving. Bank charges for gaps in your Ember flow. Ignite criticals can grant one Ember per second across all victims; normal refreshes do not postpone burn ticks. Ascension energy comes from effective outgoing pressure with one per-caster rate budget, never idle waiting or echo damage; energy does not refill during the transformation. F/C are unbound for this hero.

During Ascension, set up **4 Living Sun**, build/spend Embers with **1/2 → 3**, and choose when to convert burns into immediate explosions. Copies cannot create additional copies or resources. Invalid cast starts spend nothing; interrupted casts and impact fizzles do not refund accepted costs. Damage causes no cast pushback, with or without Q; enemy interrupts and cover remain counterplay. Q protects health rather than granting interrupt immunity. These are initial tuning values, not a balance claim.
The hotbar uses a shrinking dark shadow for the global cooldown; numeric timers show only a spell's own cooldown (or recharge when no charges remain). Every character has a Jade/Ember nameplate badge and ground ring; selected enemies get a gold ring.

The Duel Lab lets you choose Easy, Trained or Skilled, inspect bot intent, mute synthesized sound and restart in one second. Difficulty changes reset the duel; human matches cannot be reset. Easy keeps the slower basic-only opponent. Trained/Skilled use delayed public observations to kite, avoid visible hostile areas, interrupt, defend and create burst windows. They have normal resources, stats and cooldowns, not perfect reactions. Judge the kit's fun and balance through play; automated checks cannot establish that.

For existing modes: Play → choose a match size → select a class. **Play solo with bots** starts immediately and fills your chosen roster with bots for solo testing: 1v1 gives you one opponent bot. **Queue for human opponents** waits for a full human roster; its waiting screen also offers **Play now with bots** to switch straight into practice, or cancel to return to the menu. Normal practice uses trained bots. Caster slots use Cinderborn with Ember building, instant finishers and mobile pressure; bots navigate around body-sized cover and retain flag-running roles in battlegrounds. The Easy duel remains slower and basic-only. Results return to the main menu for another match. Classes explains the kits; Settings changes render resolution; Equipment is visibly unavailable.

The command starts Rust at 127.0.0.1:3001 and Vite at 127.0.0.1:5173. First compilation takes longer. Restart it after Rust or game-data changes. Reload attempts to recover the same guest slot for 30 seconds; disconnected characters remain vulnerable and drop carried flags. Explicit leave ends your slot. For direct two-tab combat regression testing, open `/?direct=1` and join the same named room; only this development path automatically rematches.

For two computers on a trusted LAN, set `CLIENT_HOST=0.0.0.0` and `ALLOWED_ORIGINS=http://YOUR-LAN-IP:5173` before `npm run dev`; open that LAN URL in both browsers. On PowerShell use `$env:CLIENT_HOST="0.0.0.0"` and `$env:ALLOWED_ORIGINS="http://YOUR-LAN-IP:5173"`. Vite proxies sockets to the loopback Rust host. Firewall access must allow the client port. LAN/internet latency and additional browser engines have not been validated by the loopback Chromium suite.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Run tests on GitHub CI to keep the shared PC responsive; local client validation is `npm run build`, and Rust validation is scoped `cargo check`/`cargo clippy`.

`check` runs Rust formatting, clippy, simulation tests, strict TypeScript and the production client build. `test:e2e` starts real services and browser clients. CI runs the full suite in desktop Chromium with `xvfb-run --auto-servernum --server-args="-screen 0 1920x1200x24" npm run test:e2e -- --headed`, using the shipped low-resolution graphics setting. The headless shell emitted unrequested pointer-lock motion after button releases; native controls are validated against the desktop browser. Commit both lockfiles.

For the bounded 20-bot correctness scenario and timing sample, run `cargo test --release -p warshard-server practice_bots -- --nocapture`. This reports simulation/bot decision timing and a snapshot size; it does not measure rendered-client or hosting capacity.

## Match rules

Arenas end when an entire team falls; five minutes with both teams surviving is a draw. CTF ends at three captures or ten minutes; the higher capture score wins, with equal scores drawing. Walk onto the enemy flag to carry it, then return to your base while your own flag is home to capture. Touch your dropped flag to return it. Flags drop on death/disconnect and automatically return after fifteen seconds. CTF deaths respawn at base after eight seconds. An absent team forfeits after thirty seconds (both absent draws); an assigned roster that cannot load aborts after twenty seconds. These initial tuning values live in game data or the match rules, with no progression modifiers.

## Source boundaries

- `crates/sim`: pure tick-driven combat, collision, content and lifecycle; no runtime, sockets, clock or persistence.
- `crates/server`: `network.rs` owns WebSocket admission and limits; `room.rs` owns guest recovery, bounded commands, replaceable snapshots and scheduling; `queue.rs` groups human tickets and allocates matches; `bots.rs` submits practice intents.
- `client/src`: transport, input, prediction/interpolation, Babylon rendering and DOM UI. Presentation never decides damage.
- `data/game.json`: authoritative classes, forms, abilities, maps and playlists, validated by Rust and delivered to clients.
- [Architecture](docs/architecture.md) and [decisions](docs/decisions): contracts, rationale, official research and limitations.

Keep time in integer ticks, iteration stable, protocol versions explicit, and validation at cast start **and** completion. New effects require behavior tests. New wire fields require cross-language checks and integration validation. Do not add progression multipliers without a fairness design.

## Scope

This is a local foundation, not an internet production service. Hosting needs TLS, explicit allowed Origins, abuse controls, authenticated admission, supervision and monitoring. Default bind is loopback. Guest capabilities are short-lived and are not account identities. Metrics: http://localhost:3001/metrics.

Future profile services submit validated loadouts at admission; the match owns immutable combat stats. No database belongs in the tick loop. Accounts, gear, purchases, summons and more complex effects are deferred until needed. The automated suite checks 20 connected transport clients and a 20-bot scenario, not twenty rendered browsers or production capacity. Production character fidelity, internet latency, low-end GPU budgets and 20v20/40v40 capacity remain unproven.
