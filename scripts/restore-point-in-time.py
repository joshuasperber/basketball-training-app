#!/usr/bin/env python3
"""Restore basketball-training-app to a point-in-time from Cursor Local History + agent transcripts."""

from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HIST_ROOT = Path.home() / "Library/Application Support/Cursor/User/History"
TRANSCRIPTS = [
    ROOT.parent.parent
    / ".cursor/projects/Users-joshuasperber-Projects-basketball-training-app/agent-transcripts/e86b7944-ad9c-4898-94a3-35e85c691940/e86b7944-ad9c-4898-94a3-35e85c691940.jsonl",
    ROOT.parent.parent
    / ".cursor/projects/Users-joshuasperber-Projects-basketball-training-app/agent-transcripts/e702d272-20e7-4897-bfd8-aa3f70fabadc/e702d272-20e7-4897-bfd8-aa3f70fabadc.jsonl",
]

# Added during today's security session (after typical pre-disaster work) — omit for pre-filter restore.
POST_DISASTER_ONLY = {
    "app/impressum/page.tsx",
    "app/datenschutz/page.tsx",
    "app/nutzungsbedingungen/page.tsx",
    "lib/legal-config.ts",
    "components/LegalFooter.tsx",
    "app/error.tsx",
    "app/not-found.tsx",
    "lib/sentry-scrub.ts",
    "lib/legacy-api-disabled.ts",
    "lib/auth-cookies.ts",
    "app/api/account/delete/route.ts",
}


def git_head(rel: str) -> str | None:
    r = subprocess.run(
        ["git", "show", f"HEAD:{rel}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return r.stdout if r.returncode == 0 else None


def pick_history_entry(entries: list[dict], target_ms: int) -> dict | None:
    if not entries:
        return None
    before = [e for e in entries if e["timestamp"] <= target_ms]
    if before:
        return max(before, key=lambda e: e["timestamp"])
    return min(entries, key=lambda e: e["timestamp"])


def load_history_at(target_ms: int) -> dict[str, str]:
    proj = str(ROOT)
    out: dict[str, str] = {}
    for entries_path in glob.glob(str(HIST_ROOT / "**/entries.json"), recursive=True):
        try:
            data = json.load(open(entries_path))
        except (OSError, json.JSONDecodeError):
            continue
        res = data.get("resource", "")
        if proj not in res:
            continue
        rel = res.replace(f"file://{proj}/", "").replace("%5B", "[").replace("%5D", "]")
        picked = pick_history_entry(data.get("entries", []), target_ms)
        if not picked:
            continue
        hist_file = Path(entries_path).parent / picked["id"]
        if hist_file.is_file():
            out[rel] = hist_file.read_text()
    return out


def replay_transcripts() -> dict[str, str]:
    files: dict[str, str] = {}
    for transcript in TRANSCRIPTS:
        if not transcript.is_file():
            print(f"warn: missing transcript {transcript}", file=sys.stderr)
            continue
        for line in transcript.read_text().splitlines():
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            for part in obj.get("message", {}).get("content", []):
                if not isinstance(part, dict) or part.get("type") != "tool_use":
                    continue
                name = part.get("name")
                inp = part.get("input", {})
                if not isinstance(inp, dict):
                    continue
                p = inp.get("path", "")
                if not p or not str(p).startswith(str(ROOT)):
                    continue
                rel = os.path.relpath(p, ROOT)
                if name == "Write":
                    files[rel] = inp.get("contents") or ""
                elif name == "StrReplace":
                    old, new = inp.get("old_string"), inp.get("new_string")
                    if not old or new is None:
                        continue
                    if rel not in files:
                        base = git_head(rel)
                        if base is not None:
                            files[rel] = base
                    if rel in files and old in files[rel]:
                        files[rel] = files[rel].replace(old, new, 1)
    return files


def apply_post_patches(files: dict[str, str]) -> None:
    """Unsaved-but-required patches from agent sessions (not always in Local History)."""
    events: list[tuple[str, str, dict]] = []
    for transcript in TRANSCRIPTS:
        if not transcript.is_file():
            continue
        for line in transcript.read_text().splitlines():
            if "calendarBlocksTrainingForDate" not in line and "findGameStatByDateAndContext" not in line:
                if "gamesPlayed" not in line and "teamFormat" not in line:
                    continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            for part in obj.get("message", {}).get("content", []):
                if not isinstance(part, dict) or part.get("name") != "StrReplace":
                    continue
                inp = part.get("input", {})
                if not isinstance(inp, dict):
                    continue
                p = inp.get("path", "")
                if not p or not str(p).startswith(str(ROOT)):
                    continue
                rel = os.path.relpath(p, ROOT)
                if rel in ("lib/activity-calendar.ts", "lib/game-stats.ts"):
                    events.append(("StrReplace", rel, inp))

    for _name, rel, inp in events:
        old, new = inp.get("old_string"), inp.get("new_string")
        if not old or new is None:
            continue
        if rel not in files:
            base = git_head(rel)
            if base is not None:
                files[rel] = base
        if rel in files and old in files[rel]:
            files[rel] = files[rel].replace(old, new, 1)


def write_files(files: dict[str, str], remove_post_disaster: bool) -> None:
    for rel, content in files.items():
        if remove_post_disaster and rel in POST_DISASTER_ONLY:
            continue
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)

    if remove_post_disaster:
        for rel in POST_DISASTER_ONLY:
            dest = ROOT / rel
            if dest.exists() and git_head(rel) is None:
                dest.unlink()
            elif dest.exists() and git_head(rel) is not None:
                dest.write_text(git_head(rel) or "")

    gp = ROOT / "app/globals.css"
    if gp.is_file():
        gp.write_text(
            gp.read_text().replace(
                '@import "../node_modules/tailwindcss/index.css";',
                '@import "tailwindcss";',
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours-ago", type=float, default=10.0)
    parser.add_argument("--keep-security", action="store_true", help="Keep today's legal/security files")
    args = parser.parse_args()

    target_ms = int(time.time() * 1000) - int(args.hours_ago * 3600 * 1000)
    print(f"Target timestamp: {target_ms} ({args.hours_ago}h ago)")

    transcript_files = replay_transcripts()
    history_files = load_history_at(target_ms)

    merged = dict(transcript_files)
    merged.update(history_files)

    apply_post_patches(merged)
    write_files(merged, remove_post_disaster=not args.keep_security)

    print(f"Transcript files: {len(transcript_files)}")
    print(f"History files at/before target: {len(history_files)}")
    print(f"Written (merged): {len(merged)}")


if __name__ == "__main__":
    main()
