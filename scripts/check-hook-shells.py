#!/usr/bin/env python3
"""Runs the plugin's SessionStart hook commands, exactly as configured, through each shell Claude
Code may use on this platform, and checks that each prints its guidance file.

Claude Code runs shell-form hooks with `sh -c` on macOS and Linux, and on Windows with Git Bash, or
PowerShell when Git Bash is absent. It substitutes ${CLAUDE_PLUGIN_ROOT} with forward slashes on
Windows. This check needs no model access, so it can run in CI. It verifies the shell layer only;
scripts/check-lifecycle.sh verifies activation inside real sessions.

Usage: scripts/check-hook-shells.py PLUGIN_ROOT     (an installed copy, or ./plugin)
"""
import json
import os
import platform
import shutil
import subprocess
import sys

MARKERS = {"core.md": "# Keel: engineering partner", "hosts/claude-code.md": "# Keel host notes: Claude Code"}


def shells():
    if platform.system() != "Windows":
        return [("sh", ["sh", "-c"])]
    found = []
    git_bash = shutil.which("bash")
    if git_bash:
        found.append(("Git Bash", [git_bash, "-c"]))
    if shutil.which("powershell"):
        found.append(("Windows PowerShell", ["powershell", "-NoProfile", "-NonInteractive", "-Command"]))
    if shutil.which("pwsh"):
        found.append(("PowerShell 7", ["pwsh", "-NoProfile", "-NonInteractive", "-Command"]))
    return found


def main():
    root = os.path.abspath(sys.argv[1]).replace("\\", "/")
    config = json.load(open(os.path.join(root, "hooks", "hooks.json"), encoding="utf-8"))
    commands = [h["command"] for group in config["hooks"]["SessionStart"] for h in group["hooks"]]
    failures = 0
    available = shells()
    if not available:
        print("FAIL  no shell found")
        sys.exit(1)
    for name, prefix in available:
        for command in commands:
            target = next(f for f in MARKERS if f in command)
            resolved = command.replace("${CLAUDE_PLUGIN_ROOT}", root)
            p = subprocess.run(prefix + [resolved], capture_output=True, timeout=60)
            out = p.stdout.decode("utf-8", "replace")
            ok = p.returncode == 0 and MARKERS[target] in out
            print(f"{'PASS' if ok else 'FAIL'}  {name}: {target} (exit {p.returncode}, {len(out)} chars)")
            if not ok:
                failures += 1
                print("      stderr:", p.stderr.decode("utf-8", "replace")[:300])
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
