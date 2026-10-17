# Warshard

An original browser fantasy PvP game: deliberate target-based combat, readable positioning, and temporary transformations. First milestone: a two-player arena between the **Briarwarden**, an armored melee fighter, and the **Ashweaver**, a spellcaster. Long-term targets are 10v10 battlegrounds and measured exploration of 40v40; neither capacity is claimed by this slice.

WASD moves; Tab or clicking a character selects an enemy; 1–5 use the active form's kit; R transforms at full energy. Ground abilities enter placement mode, confirmed by clicking terrain; Escape cancels. Facing follows movement/combat automatically. No dodge rolls or mandatory skillshots. All assets are original procedural placeholders.

## Run and validate

Requires Rust stable (1.88+), Node 22.12+ and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:5173 in two tabs, choose classes, and join the same room. The command starts Rust at 127.0.0.1:3001 and Vite at 127.0.0.1:5173. First compilation takes longer. A round starts with two connected players, ends on a defeat, and restarts after intermission. Reload attempts to recover the tab's guest slot.

For two computers on a trusted LAN, set `CLIENT_HOST=0.0.0.0` and `ALLOWED_ORIGINS=http://YOUR-LAN-IP:5173` before `npm run dev`; open that LAN URL in both browsers. On PowerShell use `$env:CLIENT_HOST="0.0.0.0"` and `$env:ALLOWED_ORIGINS="http://YOUR-LAN-IP:5173"`. Vite proxies sockets to the loopback Rust host. Firewall access must allow the client port. LAN/internet latency and additional browser engines have not been validated by the loopback Chromium suite.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs Rust formatting, clippy, simulation tests, strict TypeScript and the production client build. `test:e2e` starts real services and browser clients. CI uses the same commands. Commit both lockfiles.

## Source boundaries

- `crates/sim`: pure tick-driven combat, collision, content and lifecycle; no runtime, sockets, clock or persistence.
- `crates/server`: `network.rs` owns WebSocket admission and limits; `room.rs` owns guest recovery, bounded commands, replaceable snapshots and scheduling.
- `client/src`: transport, input, prediction/interpolation, Babylon rendering and DOM UI. Presentation never decides damage.
- `data/game.json`: authoritative classes, forms, abilities and map, validated by Rust and delivered to clients.
- [Architecture](docs/architecture.md) and [decisions](docs/decisions): contracts, rationale, official research and limitations.

Keep time in integer ticks, iteration stable, protocol versions explicit, and validation at cast start **and** completion. New effects require behavior tests. New wire fields require cross-language checks and integration validation. Do not add progression multipliers without a fairness design.

## Scope

This is a local foundation, not an internet production service. Hosting needs TLS, explicit allowed Origins, abuse controls, authenticated admission, supervision and monitoring. Default bind is loopback. Guest capabilities are short-lived and are not account identities. Metrics: http://localhost:3001/metrics.

Future profile services submit validated loadouts at admission; the match owns immutable combat stats. No database belongs in the tick loop. Accounts, gear, purchases, summons and more complex effects are deferred until needed. Production character fidelity and battleground capacity remain unproven.
