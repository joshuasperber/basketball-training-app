#!/usr/bin/env python3
"""Browse and restore Cursor Local History for this project (macOS).

Cursor stores snapshots under:
  ~/Library/Application Support/Cursor/User/History/

Usage:
  python3 scripts/local-history.py list
  python3 scripts/local-history.py list app/game-track/page.tsx
  python3 scripts/local-history.py show app/game-track/page.tsx
  python3 scripts/local-history.py restore app/game-track/page.tsx --pick 3
  python3 scripts/local-history.py restore app/game-track/page.tsx --at "2026-06-27 08:40"
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HIST_ROOT = Path.home() / "Library/Application Support/Cursor/User/History"
PROJECT_MARKER = str(ROOT)


def normalize_rel(path: str) -> str:
    p = path.strip().lstrip("./")
    if p.startswith(str(ROOT) + "/"):
        p = p[len(str(ROOT)) + 1 :]
    return p.replace("\\", "/")


def find_history(rel: str) -> tuple[Path, list[dict]] | None:
    rel = normalize_rel(rel)
    target_suffix = rel
    for entries_path in HIST_ROOT.glob("**/entries.json"):
        try:
            data = json.loads(entries_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        resource = data.get("resource", "")
        if PROJECT_MARKER not in resource:
            continue
        file_rel = resource.replace(f"file://{PROJECT_MARKER}/", "").replace("%5B", "[").replace("%5D", "]")
        if file_rel != target_suffix:
            continue
        entries = sorted(data.get("entries", []), key=lambda e: e["timestamp"])
        return entries_path.parent, entries
    return None


def fmt_ts(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M:%S")


def list_tracked_files() -> list[str]:
    files: list[str] = []
    for entries_path in HIST_ROOT.glob("**/entries.json"):
        try:
            data = json.loads(entries_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        resource = data.get("resource", "")
        if PROJECT_MARKER not in resource:
            continue
        rel = resource.replace(f"file://{PROJECT_MARKER}/", "").replace("%5B", "[").replace("%5D", "]")
        if data.get("entries"):
            files.append(rel)
    return sorted(set(files))


def cmd_list(args: argparse.Namespace) -> int:
    if args.file:
        found = find_history(args.file)
        if not found:
            print(f"Keine Local History für: {normalize_rel(args.file)}")
            return 1
        folder, entries = found
        print(f"{normalize_rel(args.file)}  ({len(entries)} Snapshots)")
        print(f"Ordner: {folder}\n")
        for i, entry in enumerate(entries, start=1):
            snap = folder / entry["id"]
            size = snap.stat().st_size if snap.is_file() else 0
            mark = " ← latest" if i == len(entries) else ""
            print(f"  [{i:2}] {fmt_ts(entry['timestamp'])}  {entry['id']}  {size} bytes{mark}")
        return 0

    files = list_tracked_files()
    print(f"{len(files)} Dateien mit Local History in diesem Projekt:\n")
    for rel in files:
        print(f"  {rel}")
    print("\nDetails: python3 scripts/local-history.py list <pfad/zur/datei>")
    return 0


def pick_entry(entries: list[dict], args: argparse.Namespace) -> dict | None:
    if args.pick is not None:
        idx = args.pick - 1
        if idx < 0 or idx >= len(entries):
            print(f"Ungültige Nummer. Wähle 1–{len(entries)}.")
            return None
        return entries[idx]
    if args.at:
        try:
            target = datetime.strptime(args.at, "%Y-%m-%d %H:%M")
        except ValueError:
            print('Datum-Format: --at "YYYY-MM-DD HH:MM"')
            return None
        target_ms = int(target.timestamp() * 1000)
        before = [e for e in entries if e["timestamp"] <= target_ms]
        return max(before, key=lambda e: e["timestamp"]) if before else entries[0]
    return entries[-1]


def cmd_show(args: argparse.Namespace) -> int:
    found = find_history(args.file)
    if not found:
        print(f"Keine Local History für: {normalize_rel(args.file)}")
        return 1
    folder, entries = found
    entry = pick_entry(entries, args)
    if not entry:
        return 1
    snap = folder / entry["id"]
    print(f"# {normalize_rel(args.file)} @ {fmt_ts(entry['timestamp'])}")
    print(f"# Snapshot: {snap}\n")
    print(snap.read_text())
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    rel = normalize_rel(args.file)
    found = find_history(rel)
    if not found:
        print(f"Keine Local History für: {rel}")
        return 1
    folder, entries = found
    entry = pick_entry(entries, args)
    if not entry:
        return 1
    snap = folder / entry["id"]
    if not snap.is_file():
        print(f"Snapshot fehlt: {snap}")
        return 1

    dest = ROOT / rel
    if dest.is_file() and not args.yes:
        print(f"Aktuelle Datei wird überschrieben: {dest}")
        print(f"Snapshot: {fmt_ts(entry['timestamp'])} ({entry['id']})")
        answer = input("Fortfahren? [y/N] ").strip().lower()
        if answer not in {"y", "yes", "j", "ja"}:
            print("Abgebrochen.")
            return 0

    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file():
        backup = dest.with_suffix(dest.suffix + f".bak-{datetime.now():%Y%m%d-%H%M%S}")
        shutil.copy2(dest, backup)
        print(f"Backup: {backup}")
    shutil.copy2(snap, dest)
    print(f"Wiederhergestellt: {dest} ← {fmt_ts(entry['timestamp'])}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Cursor Local History für basketball-training-app")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="Snapshots einer Datei oder alle getrackten Dateien")
    p_list.add_argument("file", nargs="?", help="Relativer Pfad, z.B. app/training/page.tsx")
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser("show", help="Snapshot-Inhalt anzeigen")
    p_show.add_argument("file")
    p_show.add_argument("--pick", type=int, help="Nummer aus list (1-basiert)")
    p_show.add_argument("--at", help='Zeitpunkt, z.B. "2026-06-27 08:40"')
    p_show.set_defaults(func=cmd_show)

    p_restore = sub.add_parser("restore", help="Snapshot in die Arbeitskopie zurückschreiben")
    p_restore.add_argument("file")
    p_restore.add_argument("--pick", type=int, help="Nummer aus list (1-basiert)")
    p_restore.add_argument("--at", help='Zeitpunkt, z.B. "2026-06-27 08:40"')
    p_restore.add_argument("-y", "--yes", action="store_true", help="Ohne Rückfrage überschreiben")
    p_restore.set_defaults(func=cmd_restore)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
