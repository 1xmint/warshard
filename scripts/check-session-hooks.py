#!/usr/bin/env python3
"""Starts one headless Claude Code session and checks whether Keel's SessionStart hooks delivered
its guidance. Claude Code runs SessionStart hooks before contacting the model, so this works without
model credentials (the session itself then fails to log in, which is expected and ignored).

Usage: scripts/check-session-hooks.py present|absent
"""
import json
import subprocess
import sys
import tempfile

MARKERS = ("# Keel: engineering partner", "# Keel host notes: Claude Code")


def main():
    expect = sys.argv[1]
    with tempfile.TemporaryDirectory() as cwd:
        try:
            p = subprocess.run(["claude", "-p", "Reply with exactly: OK", "--output-format", "stream-json", "--verbose"],
                               cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, timeout=180,
                               shell=sys.platform == "win32")
        except subprocess.TimeoutExpired:
            print("FAIL  the session did not finish within 180 s")
            sys.exit(1)
        except FileNotFoundError:
            print("FAIL  claude is not on PATH")
            sys.exit(1)
    delivered = {m: False for m in MARKERS}
    failed_hooks = []
    started = False  # evidence that a session actually started; absence means nothing without it
    for line in p.stdout.decode("utf-8", "replace").splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "system" and d.get("subtype") == "init":
            started = True
        if d.get("subtype") == "hook_response" and d.get("hook_event") == "SessionStart":
            out = d.get("stdout") or ""
            for m in MARKERS:
                if m in out and d.get("outcome") == "success":
                    delivered[m] = True
            if d.get("outcome") != "success" and "Keel" in (d.get("stderr", "") + out):
                failed_hooks.append(d.get("stderr", "")[:200])
    for m, ok in delivered.items():
        print(f"{'delivered' if ok else 'absent   '}  {m}")
    if not started:
        print(f"FAIL  no session started (exit {p.returncode}): {p.stderr.decode('utf-8', 'replace')[:300]}")
        sys.exit(1)
    if expect == "present":
        good = all(delivered.values()) and not failed_hooks
    else:
        good = not any(delivered.values())
    print(f"{'PASS' if good else 'FAIL'}  Keel guidance {expect} at session start"
          + (f"; failed hooks: {failed_hooks}" if failed_hooks else ""))
    sys.exit(0 if good else 1)


if __name__ == "__main__":
    main()
