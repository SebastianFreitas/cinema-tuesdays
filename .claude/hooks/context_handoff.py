"""Claude Code hook: ask Claude to write HANDOFF.md once the context gets big.

Wired to UserPromptSubmit and PostToolUse. Reads the session transcript, takes the
latest assistant turn's token usage (= current context size), and once it crosses
WARN_AT injects an instruction to write a handoff. Repeats every REPEAT_EVERY tokens after that.
Above BLOCK_AT, new user messages are blocked (telling the user to /clear), but only once
HANDOFF.md has been written since the first warning, so nothing is lost. Claude is also told, mid-turn,
to finish the current step, update HANDOFF.md and stop. Above STOP_AT, once HANDOFF.md has been
updated after that, the turn is stopped outright (one long turn used to run past BLOCK_AT).
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

# A fresh session starts at ~55k (system prompt, tools, memory).
WARN_AT = 130_000
REPEAT_EVERY = 40_000
BLOCK_AT = 150_000
STOP_AT = 170_000

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


WRAP_UP = (
    "Context is at about {k}k tokens. Finish the step you're on (don't start new ones), update {path} with "
    "what changed since you last wrote it and the exact next step, then tell the user in one line to run "
    "/clear. Further messages from the user are blocked until they do."
)


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
    level = (tokens - WARN_AT) // REPEAT_EVERY + 1  # 130k -> 1, 170k -> 2, 210k -> 3, ...

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
    wrap_up = float(state.get("wrap_up", 0))

    def written_since(t: float) -> bool:
        return bool(t) and handoff.exists() and handoff.stat().st_mtime >= t

    if event == "UserPromptSubmit" and tokens >= BLOCK_AT and written_since(first_warn):
        print(json.dumps({
            "decision": "block",
            "reason": f"Context is at about {tokens // 1000}k tokens and HANDOFF.md is written. "
                      "Run /clear to start a fresh chat; it will pick up from the handoff.",
        }))
        return

    if event == "PostToolUse" and tokens >= BLOCK_AT:
        if tokens >= STOP_AT and written_since(wrap_up):
            print(json.dumps({
                "continue": False,
                "stopReason": f"Context is at about {tokens // 1000}k tokens and HANDOFF.md is up to date. "
                              "Run /clear to start a fresh chat; it will pick up from the handoff.",
            }))
            return
        if not wrap_up:
            state.update(level=max(level, previous), first_warn=first_warn or time.time(), wrap_up=time.time())
            marker.write_text(json.dumps(state))
            emit(event, WRAP_UP.format(k=tokens // 1000, path=handoff),
                 f"Context ~{tokens // 1000}k tokens: asking Claude to wrap up and update HANDOFF.md")
            return

    if level <= previous:
        return
    state.update(level=level, first_warn=first_warn or time.time())
    marker.write_text(json.dumps(state))

    emit(event,
         f"Context is at about {tokens // 1000}k tokens (threshold {WARN_AT // 1000}k). {HANDOFF_INSTRUCTIONS.format(path=handoff)}",
         f"Context ~{tokens // 1000}k tokens: asking Claude to write HANDOFF.md")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # never break the session over a hook
