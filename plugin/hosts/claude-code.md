# Keel host notes: Claude Code

- Agent instruction file: if the project has a CLAUDE.md (or .claude/CLAUDE.md), record engineering decisions there or in a file it imports. Claude Code reads AGENTS.md only when no CLAUDE.md exists. For a new project, put decisions in AGENTS.md and create a CLAUDE.md containing only `@AGENTS.md`, so other coding agents share the same record.
- Private context belongs in auto memory. If auto memory is off, keep that context out of repository files and say it will not be retained.
- Delegation: use the Agent tool. Use the Explore agent for broad read-only search, and `isolation: "worktree"` for parallel implementation.
- Undo: Claude Code checkpoints restore only Claude's own file edits. Before risky or wide changes, make sure the work is committed in git.
