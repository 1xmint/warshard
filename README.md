# Keel

Help coding agents turn a nontechnical user's vision into working software through sound engineering judgment, coherent context, and adaptive execution. Keel is a working name, drawn from the structure that keeps a vessel stable and on course.

The product should support both starting a new project with an appropriate development foundation and improving an existing project without disrupting its working behavior. It should help an agent identify consequential repository problems, explain their effect, and make bounded, verifiable improvements while preserving the user's intent.

The product aims for one easy installation, economical use of the user's existing subscription, and no manual subscription-tier configuration. Claude Code is the initial target; Codex and supported ChatGPT environments are additional targets whose compatibility must be established.

These are product goals, not claims of implemented support or measured improvement.

## Architecture

The selected first-slice architecture is deliberately small. The host keeps authentication, billing, model choice, permissions, and execution.

- **Shared engineering guidance** ([`plugin/core.md`](plugin/core.md)) is host-neutral. It covers working toward the intended outcome, proportionate depth, when to ask and when to decide, verification, keeping intent durable, delegation, and precedence.
- **On-demand depth** comes from skills. The first is [`new-project`](plugin/skills/new-project/SKILL.md), which covers foundations for a project that does not exist yet.
- **Host-specific notes** ([`plugin/hosts/`](plugin/hosts/)) hold activation, instruction-file, memory, and delegation details for one host. They never repeat the shared guidance.
- **Activation** in Claude Code is a single `SessionStart` hook. On startup, `/clear`, and compaction, it prints the shared guidance and the Claude Code notes into context. It is not re-run on resume, because the resumed transcript already contains them. The hook needs no runtime beyond the host's own hook shell.
- **Continuity** has no Keel-specific store. Product requirements go in the project README. Engineering decisions go in the project's agent instruction file. Change rationale goes in commit messages. Private context goes in host memory.

Keel has no agents, MCP servers, databases, or background processes. Further capabilities are added only when a demonstrated need justifies them.

## Use with Claude Code

Requires Claude Code 2.1.296 or later.

    claude plugin install keel --marketplace 1xmint/keel

Inside a session, use `/plugin install keel --marketplace 1xmint/keel` instead. Keel is active from the next session; nothing needs to be invoked.

- **Turn off:** run `claude plugin disable keel@keel`. Fresh sessions no longer contain Keel guidance. A session you resume keeps the guidance already in its transcript, so start a new session or `/clear` to be fully free of it.
- **Remove:**
  1. Run `claude plugin uninstall keel@keel`.
  2. Run `claude plugin marketplace remove keel`.

  Claude Code deletes the old cached copy itself after its cleanup period.
- **What stays in your projects:** ordinary README, `AGENTS.md`/`CLAUDE.md`, and commit content that Keel helped write. These files remain useful without Keel.

### Verified environments

- **Linux:** the full lifecycle checks pass with Claude Code 2.1.296, 2.1.301, and 2.1.302: install, activation on startup, resume, compaction and `/clear`, disable, uninstall, and hook failure.
- **Windows:** CI runs on GitHub's Windows runner with Claude Code 2.1.301. Install works. The installed hook commands run in Git Bash, Windows PowerShell, and PowerShell 7. A real session receives the guidance at startup when Git Bash is present, and none after disable or uninstall. The lifecycle script runs under Git Bash up to its first model call, where it stops as expected without credentials.
  - Not yet verified on Windows: resume, compaction, and `/clear`, which need model access; a session on a machine without Git Bash, where Claude Code uses PowerShell; and a personal machine.
- **macOS:** unverified.

### Codex and other hosts

Not supported yet. Codex documents that it accepts Claude-compatible plugin manifests and supports plugin hooks, but each feature Keel relies on must be checked before support is claimed. Those features are the marketplace format, hook trust and events, the plugin-root variable, and skill discovery. A Codex host-notes file would be added beside the Claude Code one, reusing the shared guidance unchanged.

## Limitations

- Restructuring, complex investigation, and concept partnering rely on the shared guidance alone; no dedicated skills exist for them yet.
- No external detector notices repeated failed fixes. Recovery relies on the guidance.
- Keel cannot detect other installed plugins that inject conflicting workflows. The guidance gives explicit user and project instructions precedence.
- Behavior checks use a handful of scenarios. They expose failure mechanisms; they do not establish general benefit.
