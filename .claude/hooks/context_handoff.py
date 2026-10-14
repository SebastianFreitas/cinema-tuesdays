"""Claude Code hook: ask Claude to write HANDOFF.md once the context gets big.

Wired to UserPromptSubmit and PostToolUse. Reads the session transcript, takes the
latest assistant turn's token usage (= current context size), and once it crosses
WARN_AT injects an instruction to write a handoff. Repeats every REPEAT_EVERY tokens after that.
Above BLOCK_AT, new user messages are blocked (telling the user to /clear), but only once
HANDOFF.md has been written since the first warning, so nothing is lost.
Wired to SessionStart too: after /clear it points the new session at HANDOFF.md.
HANDOFF.md lives in Claude's data folder for the main checkout (~/.claude/projects/<main checkout>/), which
every worktree session shares and can write to (the app blocks edits to the main checkout from a worktree).
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

WARN_AT = 160_000
REPEAT_EVERY = 40_000
BLOCK_AT = 200_000

HANDOFF_INSTRUCTIONS = (
    "Before doing anything else, write the handoff to {path} so the user can /clear and "
    "continue in a fresh chat. Start it with the date and the branch/worktree you're working in. Include: the goal, what's done (with file paths), current state "
    "(what's running, temporary settings, anything half-finished), decisions made and why, open "
    "questions for the user, and the exact next steps. Overwrite any old HANDOFF.md. Then tell the "
    "user in one line that the handoff is ready and they can clear the chat, and continue with "
    "their request."
)


def handoff_path(cwd: Path) -> Path:
    """HANDOFF.md in Claude's project folder for the main checkout (found through git, so worktrees share it)."""
    main = cwd
    try:
        common = subprocess.run(["git", "-C", str(cwd), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                capture_output=True, text=True, timeout=5).stdout.strip()
        if common:
            main = Path(common).parent
    except Exception:
        pass
    key = re.sub(r"[^A-Za-z0-9]", "-", str(main.resolve()))
    return Path.home() / ".claude" / "projects" / key / "HANDOFF.md"


def context_tokens(transcript: Path) -> int:
    """Context size as of the most recent assistant message."""
    lines = transcript.read_text(encoding="utf-8", errors="ignore").splitlines()
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        message = entry.get("message")
        if entry.get("type") == "assistant" and isinstance(message, dict) and message.get("usage"):
            u = message["usage"]
            return sum(u.get(k) or 0 for k in (
                "input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"))
    return 0


def emit(event: str, context: str, user_message: str | None = None) -> None:
    out = {"hookSpecificOutput": {"hookEventName": event, "additionalContext": context}}
    if user_message:
        out["systemMessage"] = user_message
    print(json.dumps(out))


def main() -> None:
    data = json.load(sys.stdin)
    event = data.get("hook_event_name", "")
    handoff = handoff_path(Path(data.get("cwd") or "."))

    if event == "SessionStart":
        if data.get("source") in ("clear", "startup") and handoff.exists():
            emit(event, f"A handoff from the previous chat exists at {handoff}. Read it first "
                        "and continue from where it leaves off.")
        return

    transcript = Path(data.get("transcript_path") or "")
    if not transcript.is_file():
        return
    tokens = context_tokens(transcript)
    if tokens < WARN_AT:
        return
    level = (tokens - WARN_AT) // REPEAT_EVERY + 1  # 160k -> 1, 200k -> 2, 240k -> 3, ...

    # Per-session state: highest level nagged at, and when the first warning went out.
    marker = transcript.with_suffix(".handoff-level")
    try:
        state = json.loads(marker.read_text())
        if not isinstance(state, dict):
            raise ValueError
    except Exception:
        state = {}
    previous = int(state.get("level", 0))
    first_warn = float(state.get("first_warn", 0))

    if (event == "UserPromptSubmit" and tokens >= BLOCK_AT and first_warn
            and handoff.exists() and handoff.stat().st_mtime >= first_warn):
        print(json.dumps({
            "decision": "block",
            "reason": f"Context is at about {tokens // 1000}k tokens and HANDOFF.md is written. "
                      "Run /clear to start a fresh chat; it will pick up from the handoff.",
        }))
        return

    if level <= previous:
        return
    marker.write_text(json.dumps({"level": level, "first_warn": first_warn or time.time()}))

    emit(event,
         f"Context is at about {tokens // 1000}k tokens (threshold {WARN_AT // 1000}k). {HANDOFF_INSTRUCTIONS.format(path=handoff)}",
         f"Context ~{tokens // 1000}k tokens: asking Claude to write HANDOFF.md")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # never break the session over a hook
