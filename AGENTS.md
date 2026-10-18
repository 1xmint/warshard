# Warshard agent guidance

## What this is for
Warshard is a browser 3D fantasy PvP game. The current priority is one excellent Arcanist and useful solo combat testing, preserving the existing server-authoritative combat, arenas and battlegrounds. Josh owns product behavior; the agent owns implementation. Read STATE.md and README.md before proposing repository work.

## Working with Josh
- Use plain language, short paragraphs and exact paths. Josh does not read code. Lead with the answer and end with the next step.
- Understand the intended outcome, not just the proposed implementation. Ask one direct question with a recommendation only when different readings materially change the work; otherwise state the assumption and proceed.
- Decide libraries, structure, refactors, tests and order. Explain consequential choices briefly. Ask once for product direction, money, credentials, visibility, destructive or irreversible actions; existing permission covers its work. Merging a PR after CI is green is permitted.
- Scale effort to risk. Small asks need no planning ceremony or reviewers. Research unfamiliar APIs using current official sources; stop once the choice is clear. Consider deleting complexity before adding it. Independent review is for money, authentication, data deletion or architectural doubts.
- No separately billed services or new API keys. Helpers are only for large separable work and must identify their model; follow host delegation restrictions.
- This PC is slow and shared. Run tests on GitHub CI, not locally. Locally run only scoped compilation and lint checks. Push branches as work progresses.
- Done means evidence matching the intended flow, not merely passing tests. Report committed state from Git. Do not claim objective combat fun or unmeasured performance improvements.

## Constraints and non-goals
- Rust simulation is authoritative and tick-driven; networking, rendering and persistence remain separate. Validate costs, cooldowns, range and line of sight; clients never decide damage or positions.
- Preserve existing working controls, modes and unrelated work. Use focused branches/PRs and inspect Git before changes. Never reset, stash or overwrite another person's work. Concurrent agents require isolated worktrees and explicit ownership.
- Keep protocol versions and generated TypeScript synchronized; retain deterministic combat scenarios. Bots use legal gameplay actions and public opponent observations with human reaction delays.
- No talent trees, equipment-stat systems, multiple Ascensions per hero, accounts, monetization or new infrastructure for this milestone. No LLM inference in bot decisions.
- Prefer cohesive, browser-appropriate temporary art. External assets require documented provenance and licenses permitting intended redistribution/commercial use. Do not describe them as final or original assets.

## Memory and checks
- AGENTS.md owns intent, non-goals and constraints. STATE.md owns dated decisions, current state, known problems and next slices. CLAUDE.md, if present, contains only @AGENTS.md. Add no other summary/handoff documents.
- README.md owns run commands and player-facing instructions. Existing architecture decisions remain useful for consequential rationale; do not duplicate status across documents. Update invalidated documentation with the change.
- Local checks: cargo fmt --all -- --check; cargo clippy scoped to changed crates; npm run build for client/type checks; npm run protocol when contracts change. Do not run local test suites.
- CI: npm run check and npm run test:e2e. Add focused correctness coverage for combat transitions, bot legality, recovery and actual browser interactions. Inspect failures; never weaken checks merely to pass.
