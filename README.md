# Warshard

An original browser fantasy PvP game: deliberate target-based combat, readable positioning, and temporary transformations. The current focus is the **Arcanist**, a mobile ranged spellcaster with critical-hit chains and one Spellstorm Ascension. The existing **Briarwarden**, melee fighter and **Ashweaver** spellcaster remain playable in team arenas and capture-the-flag battlegrounds. Arenas support 1v1, 2v2, 3v3, 4v4 and 5v5. Battleground playlists support 6v6 and 10v10; 20v20 and 40v40 remain disabled pending capacity work. Exactly two maps: **The Shattered Court** for every arena size and **Riftwood Crossing** shared by both battleground sizes.

Hold left mouse and drag to orbit the camera without turning your character. Hold right mouse and drag to turn the camera and character together; hold both buttons to run forward. The first right-click captures the mouse with browser pointer lock for continuous turning. Releasing the buttons shows a game-drawn cursor for targeting, ground placement and HUD buttons, retaining the lock between drags so it is not requested on every press. Escape, losing focus, leaving the match or opening a menu releases the real cursor and stops mouse movement; right-click again during play to recapture. The browser may show its capture notice when a new lock starts. If a browser blocks pointer lock, ordinary visible-cursor drag remains available. WASD moves relative to character facing; the wheel zooms. A short left click still selects a target or places a ground spell. Tab or clicking a character selects an enemy; 1–5 use the active form's kit; Q/E/F/C use Arcanist utilities; other classes retain Q mobility (Briar Rush closes toward an enemy; Ashstep retreats); R transforms at full energy. Roots block mobility and diminish across repeated applications: full, half, quarter, then immune, resetting after 18 seconds without another root. Ground abilities enter placement mode, confirmed by clicking terrain; Escape cancels. Facing is visual; attacks still use forgiving target/range/line-of-sight checks. No dodge rolls or mandatory skillshots. Temporary animated characters use the free CC0 KayKit Adventurers pack; the ruined arena uses CC0 Kenney Mini Arena art with an authored combat layout. Riftwood Crossing uses CC0 Kenney Nature Kit scenery, two team bases and three dirt routes around authoritative rocky cover. Tall decorative scenery stays beyond the playable boundary. Licenses and pinned provenance are in `client/public/assets`. Spell icons, effects and synthesized audio are original temporary work, not finished production art.

## Run and validate

Requires Rust stable (1.88+), Node 22.12+ and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:5173 → **Arcanist duel · Play now** for a solo mirror duel. The Arcanist is a mobile burst caster: build Kindling while repositioning, convert it with Flashkindle, then spend the glowing Sunshard proc. Root or interrupt an opponent to create time for a meteor or a committed cast.

| Key | Ability | Role |
| --- | --- | --- |
| 1 | Cinder Dart | 1-second cast while moving, 50 base damage. Starts Kindling even on a normal hit; a critical can finish it. |
| 2 | Flare Lance | 1.5-second stationary cast, 145 base damage. Stronger pressure when you can stand still. |
| 3 | Flashkindle | Instant guaranteed critical, 55 base damage. Two charges, recharging one at a time every 10 seconds. Use to complete Kindling. |
| 4 | Sunshard | 4.5-second cast, 300 base damage. Kindling makes it instant; its critical hits start the next chain. |
| 5 | Riftstep | Blink 5 metres in your facing direction, 12-second cooldown. Off the global cooldown and cancels your cast. Stops at cover; roots prevent it. |
| Q | Prism Ward | Absorb 240 damage for up to 6 seconds, 20-second cooldown. Works during casts and the global cooldown without interrupting your spell. |
| E | Crownfall | 0.75-second cast, then a meteor falls for 1.2 seconds at the target's position when the cast finishes. Deals 240 damage within 2.7 metres, 20-second cooldown. Enemies can escape or use cover. |
| R | Spellstorm | At 100 earned energy, transform for 12 seconds: halve cast times, add 15 critical-chance points and gain an instant Sunshard. |
| F | Unweave | Interrupt and lock the interrupted school for 3 seconds, 10-second cooldown. Off the global cooldown; cancels your own cast. |
| C | Glasswake | Root nearby enemies within 2.7 metres for up to 3 seconds, 18-second cooldown. Repeated roots diminish. Use to peel or set up Crownfall. |

One critical hit prepares Kindling for six seconds; a second readies one instant Sunshard for ten seconds. Cinder Dart can also start preparation without a critical, but normal hits cannot complete it. Ordinary hits do not erase preparation. After three ordinary qualifying hits, the next is guaranteed critical. A typical sequence is **1 → 3 → glowing 4**, then **2** when safe or **1** while moving; save the second Flashkindle for another preparation. Missed/out-of-range casts do not spend a proc. All costs, charges, casts, projectiles, impact cover and damage resolve on the server. These are initial playtest values.
The hotbar uses a shrinking dark shadow for the global cooldown; numeric timers show only a spell's own cooldown (or recharge when no charges remain). Every character has a Jade/Ember nameplate badge and ground ring; selected enemies get a gold ring.

The Duel Lab lets you choose Easy, Trained or Skilled, inspect bot intent, mute synthesized sound and restart in one second. Difficulty changes reset the duel; human matches cannot be reset. Easy keeps the slower basic-only opponent. Trained/Skilled use delayed public observations to kite, avoid visible hostile areas, interrupt, defend and create burst windows. They have normal resources, stats and cooldowns, not perfect reactions. Judge the kit's fun and balance through play; automated checks cannot establish that.

For existing modes: Play → choose a match size → select a class. **Play solo with bots** starts immediately and fills your chosen roster with bots for solo testing: 1v1 gives you one opponent bot. **Queue for human opponents** waits for a full human roster; its waiting screen also offers **Play now with bots** to switch straight into practice, or cancel to return to the menu. Normal practice uses trained bots. Caster slots use Arcanists with cast-time filler, critical-chain payoff and mobile pressure; bots navigate around body-sized cover and retain flag-running roles in battlegrounds. The Easy duel remains slower and basic-only. Results return to the main menu for another match. Classes explains the kits; Settings changes render resolution; Equipment is visibly unavailable.

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
