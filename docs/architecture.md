# First playable architecture

## Outcome

Two browsers play an authoritative duel with WASD, click/Tab targeting, five abilities per class, casts, cooldowns, an interrupt, ground area damage and temporary alternate kits. Production art, progression and public hosting are outside the milestone. User selected the name Warshard on 2026-10-17 and authorized public GitHub visibility.

## Technology evaluation

Rust synchronous simulation + Axum/Tokio host; TypeScript/Vite + Babylon WebGL client. Rust ownership and exhaustive effect enums suit combat invariants. TypeScript on both sides would simplify tooling and is credible for duels; retain Rust for the requested boundary and preference, not a presumed capacity advantage. A full ECS/Bevy host adds scheduling concepts without a current need. Explicit phases and stable ID maps suffice.

Babylon includes picking, scene graph, materials and animation infrastructure. Three.js is a credible smaller renderer but requires more game-facing assembly. Godot is credible for editor-centric workflows; browser DOM UI and a separate Rust rules core do not currently need its export/editor pipeline. WebGL avoids requiring newer adapters. Procedural mesh animation is temporary art, not the commercial fidelity target.

## Modules and simulation

`sim` owns `World`, geometry, content and combat. `server` owns room routing and one task per match. `client` owns presentation and input. `data` owns definitions. No simulation code references networking, rendering, persistence or wall time.

20 Hz fixed steps, integer time/positions, stable player iteration, no random rules. Replays are content version plus commands at tick boundaries; reproducibility is within the same rules/content version. Each tick expires timers, moves actors, completes casts, pulses areas and evaluates lifecycle. Commands apply before a tick. Movement expires after 250 ms without refreshed input. Dead players cannot act. Movement cancels cast-time abilities. Start and completion validate range/line of sight/targets. Cost, cooldown and GCD commit on accepted casts, with no refund for interrupts/fizzles. No facing checks or directional bonuses.

Prediction uses sequenced fixed movement samples and authoritative acknowledgments. Remote actors interpolate delayed states. No damage prediction or lag rewind. Collision and line of sight use the shared map. Crowd control and cast cancellation may correct local prediction.

## Network and admission

Protocol v1 tagged JSON: `join` with room/class/version/optional resume secret; `welcome` with content, identity and snapshot; `input`, `cast`, `ultimate` intents; `state` snapshots; `error` rejections. Never accept client health, speed, damage or positions. Rust wire types generate TypeScript definitions checked for drift.

Bound frame size, room count, command queue, join time and input rate. Slow writes time out; latest-value channels replace unsent snapshots. TCP can still block fresh packets behind old bytes. Clients stop sending above a buffered-byte cap. Local dev uses Vite's same-origin `/ws` proxy. Listener defaults to loopback and validates Origin. HTTPS termination and deployment-specific Origin are hosting responsibilities.

Guest capabilities use OS randomness, live in sessionStorage, and expire with session/room cleanup. Reload retains health/cooldowns/energy during the grace window; disconnected actors remain targetable. A socket generation prevents old sockets from issuing commands or disconnecting replacement sockets. Future account admission verifies short-lived match tickets here, separate from the simulation.

Two slots per room now, not a hardcoded two-entity combat loop. Independent actors form a process-scaling boundary. Full snapshots suit a duel; recipient serialization strips enemy private cooldowns/energy/input state. Cast identity/progress are public; ground placement is private until resolution. Future interest filtering belongs at snapshot construction. Delta encoding/spatial indices need measured justification before addition.

## Data-driven abilities

JSON defines classes, base form IDs, allowed ultimate form lists, form ability arrays, durations, costs, cast times, target type, range, cooldown, and typed effects. Forms select kits by reference. R remains independent and selects the first available form by default; the protocol supports an explicitly selected allowed form. A simulation test adds a second form and verifies the same activation/expiry path. Future account unlocks must narrow the admitted player's allowed loadout at admission, not trust a client's unlock claims. Cooldowns are keyed by ability ID across swaps; GCD persists. Energy comes from effective combat and slow passive generation during active play; caps at 100, consumed on transformation. Forms expire on server ticks.

Implement typed damage, healing, absorption, interrupt/school lockout, timed root/slow, and area pulses. Target types: enemy/self/ground. Ground points remain owner-local until resolution. Shield absorbs before health. Overkill/overheal earn no extra energy. Multiple effects compose through a finite enum, not a script VM.

Channels, periodic entity effects, silence/stun/fear, projectiles, pets/summons and conditionals are extension requirements, not implemented features. Add scheduling variants with source/target/expiry and tests when a real class needs them. Authoritative projectiles/entities must stay in `sim`. Equipment/profile schemas are deferred until they have a consumer.

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

## Implementation plan and acceptance

1. Validated content and pure simulation; reproducible tests for range/LoS, cost/GCD/cooldown, interruption, area timing, collision, swaps and lifecycle.
2. Bounded versioned host with recovery, rejection paths and observability.
3. Browser arena with original procedural armor/animation, HUD, targeting, casts and forms.
4. Run the documented checks and real two-browser tests for controls, combat and recovery. Record actual evidence and limitations in the PR; compilation is not playtesting.
