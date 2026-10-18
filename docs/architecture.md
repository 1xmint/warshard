# Warshard architecture

## Outcome

Browser clients play server-managed arena and capture-the-flag matches. The authoritative product scope and run commands live in [README](../README.md). The current milestone extends the original duel foundation without replacing combat, rendering or transport. Production art, progression and public hosting remain outside this slice.

## Technology evaluation

Rust synchronous simulation + Axum/Tokio host; TypeScript/Vite + Babylon WebGL client. Rust ownership and exhaustive effect enums suit combat invariants. TypeScript on both sides would simplify tooling and is credible for duels; retain Rust for the requested boundary and preference, not a presumed capacity advantage. A full ECS/Bevy host adds scheduling concepts without a current need. Explicit phases and stable ID maps suffice.

Babylon includes picking, scene graph, materials and animation infrastructure. Three.js is a credible smaller renderer but requires more game-facing assembly. Godot is credible for editor-centric workflows; browser DOM UI and a separate Rust rules core do not currently need its export/editor pipeline. WebGL avoids requiring newer adapters. Procedural mesh animation is temporary art, not the commercial fidelity target.

## Modules and simulation

`sim` owns `World`, geometry, content and combat. `server` owns room routing and one task per match. `client` owns presentation and input. `data` owns definitions. No simulation code references networking, rendering, persistence or wall time. Admission assigns an explicit team ID; enemy targeting and area pulses exclude allies. `world/rules.rs` owns team elimination, flags, captures, respawns, time limits and forfeits. Playlists select map, team size and rule kind; damage resolution does not know the roster size. `server/queue.rs` allocates full, balanced human matches FIFO; explicitly selected practice fills bots independently.

20 Hz fixed steps, integer time/positions, stable player iteration and a seedable critical-hit PRNG. Replays are content version, combat seed and commands at tick boundaries; reproducibility is within the same rules/content version. Each tick expires timers, moves actors, completes casts, pulses areas and evaluates lifecycle. Commands apply before a tick. Movement expires after 250 ms without refreshed input. Dead players cannot act. Movement cancels casts unless their definition explicitly allows movement. Off-GCD behavior is an ability flag: accepted off-GCD actions neither start nor extend GCD; shields preserve pending casts, while blink and interrupt cancel them. Start and completion validate range/line of sight/targets. Cost, cooldown and GCD commit on accepted casts, with no refund for interrupts/fizzles. No facing checks or directional bonuses. Mouse steering accepts only direction/facing, never client positions; the server bounds the vector to unit length and consumes at most one sample per tick. Camera orbit is local presentation; character facing is replicated without affecting hit rules.

Prediction uses sequenced fixed movement samples and authoritative acknowledgments. Remote actors interpolate delayed states. No damage prediction or lag rewind. Collision and line of sight use the shared map. Crowd control and cast cancellation may correct local prediction.

## Network and admission

Protocol v5 tagged JSON: `queue` with playlist/class/practice/version, `queued` human counts, `cancel_queue`, and assignment `welcome` with room, recovery capability, selected map content and snapshot. `join` recovers that assigned room with its secret (or creates a direct development duel). `input` (grid intent for bots/direct tooling), `steer` (bounded thousandth-unit movement vector plus visual facing), `cast`, `mobility`, `ultimate` are intents; `leave_match` explicitly exits; `state` carries public objectives, scores and stats plus recipient-private combat state; `error` rejects invalid actions. Never accept client health, speed, damage or positions. Rust wire types generate TypeScript definitions checked for drift.

Bound frame size, room count, command queue, join time and input rate. Slow writes time out; latest-value channels replace unsent snapshots. TCP can still block fresh packets behind old bytes. Clients stop sending above a buffered-byte cap. Local dev uses Vite's same-origin `/ws` proxy. Listener defaults to loopback and validates Origin. HTTPS termination and deployment-specific Origin are hosting responsibilities.

Guest capabilities use OS randomness, live in sessionStorage, and expire with session/room cleanup. Reload retains health/cooldowns/energy during the grace window; disconnected actors remain targetable. A socket generation prevents old sockets from issuing commands or disconnecting replacement sockets. Future account admission verifies short-lived match tickets here, separate from the simulation.

Playlist capacity bounds admission; currently up to twenty entities per match, with larger playlists disabled. Independent match actors form a process-scaling boundary. Full snapshots remain deliberately simple; recipient serialization strips enemy private cooldowns/energy/input state. Cast identity/progress are public; ground placement is private until resolution. Future interest filtering belongs at snapshot construction. Delta encoding/spatial indices need measured justification before addition.

## Data-driven abilities

JSON defines classes, base form IDs, allowed ultimate form lists, form ability arrays, durations, costs, cast times, target type, range, cooldown, and typed effects. Forms select kits by reference and may reference one validated instant activation ability. Target/range/cover/school checks precede ultimate energy consumption. R remains independent and selects the first available form by default; the protocol supports an explicitly selected allowed form. A simulation test adds a second form and verifies the same activation/expiry path. Future account unlocks must narrow the admitted player's allowed loadout at admission, not trust a client's unlock claims. Cooldowns are keyed by ability ID across swaps; GCD persists. Energy comes from effective combat and slow passive generation during active play; caps at 100, consumed on transformation. Forms expire on server ticks.

Typed effects cover damage, healing, absorption, interrupt/school lockout, timed root/slow, radial roots, area pulses and delayed area impacts. Delayed impacts lock their point when the cast completes and expose descent timing; damage checks team, radius and cover at impact. Class utility arrays map to Q/E/F/C independently of the active form. Ability flags define mobile casting, off-GCD actions and Kindling preparation. Target types: enemy/self/ground. Ground points remain owner-local until resolution. Shield absorbs before health. Overkill/overheal earn no extra energy. Multiple effects compose through a finite enum, not a script VM. Repeated roots diminish independently per target and reset after eighteen seconds without a new application; slows retain their own simple timer. Class mobility is data-driven and independent of form slots, requires a living enemy and line of sight, respects roots/cooldowns and samples the collision path to prevent wall traversal.

Projectiles are authoritative scheduled impacts with start/impact validation and public flight timing. Arcanist critical chains and sequential charge recovery use explicit private state. Attached burns tick deterministically, refresh per source/target/ability and apply only to enemies visible from the explosion at impact. After application they follow victims through cover; critical proc contributions share a per-caster interval. Debuffs replicate public ownership/target/expiry and clear on death/reset/match end. Damage does not delay casts. Channels, periodic entity effects, silence/stun/fear, pets/summons and general conditionals remain extension requirements. Add scheduling variants with source/target/expiry and tests when a real class needs them. Authoritative projectiles/entities must stay in `sim`. Equipment/profile schemas are deferred until they have a consumer.

## Skeptical review and risks

| Concern | Decision and evidence needed |
| --- | --- |
| Two languages can drift | Generate wire types from Rust; Rust validates JSON; browser integration tests exercise real messages |
| Prediction can diverge | Fixed samples, shared geometry and replay; RTT/loss playtesting still needed |
| TCP backlog | Latest snapshots/bounded writes limit application queues, cannot remove transport head-of-line blocking |
| Tick overload | Cap catch-up and expose slow ticks; prefer time dilation over unbounded catch-up |
| Fairness under latency | No rewind yet; receipt ordering favors low latency; measure before selecting rewind semantics |
| 10v10 / 40v40 | Unproven. Measure p95/p99 tick time, bytes/player/sec, dense AoE and slow readers before expanding |
| Rendering | Procedural armor verifies readability only. Profile real skeletons/VFX on low-end browsers before art budgets |
| Progression | Keep normalized match stats independent of persistent profiles until fairness is designed |
| Production abuse | Local-only foundation. Authenticated admission, limits and deployment review before public service |

No microservices, generic plugins, physics engine or database is justified yet. O(players × areas) and JSON snapshots are deliberately simple; choosing Rust does not establish scaling. A future engineer should profile before replacing them.

## Validation contracts

Use `npm run check` and `npm run test:e2e` as documented in README and CI. Pure tests own combat/objective invariants and reproducible scenarios; real WebSocket/browser tests own admission, cancellation, capacity, recovery, controls and the menu→match→results flow. Bots are external controllers submitting legal intents, not special simulation damage rules. Record actual measurements and remaining limitations in the milestone PR. See [ADR 0003](decisions/0003-battleground-lifecycle.md) for consequential lifecycle decisions.
