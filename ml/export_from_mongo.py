"""
MindLens — export collected samples out of MongoDB for training
==================================================================
© MindLens — Developed by Bhuvanidharan V

collect.html can now optionally upload consented samples straight to a
MongoDB instance instead of (or alongside) downloading them locally — see
db.py and the POST /api/collect route in server.py.

This script is the other half of that: it pulls samples back OUT of
MongoDB and writes them to disk in exactly the same filename layout
collect.html's local "Prepare & download all" button already produces
(`{pid}-audio.webm`, `{pid}-selfie-{expression}.png`, `{pid}-metadata.json`,
`{pid}-text.txt`). That means every existing downstream tool — 
ml/convert_webm.py, ml/augment.py, ml/pipeline.py, and the
train_*_model_TEMPLATE.py scripts — keeps working completely unmodified,
regardless of whether a given sample arrived via local download+manual
copy or via the database.

Usage:
    python ml/export_from_mongo.py --output /path/to/collected

    # only samples newer than a previous export run:
    python ml/export_from_mongo.py --output /path/to/collected --since 2026-08-01

Then feed that folder into the existing pipeline as usual, e.g.:
    python ml/pipeline.py --collected /path/to/collected --work /path/to/workdir ...

Requires: pip install -r requirements-server.txt (for pymongo) and a
reachable MongoDB — same MONGODB_URI / MONGODB_DB environment variables
server.py uses.
"""

import argparse
import datetime
import json
import os
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402  (project's db.py, one directory up)


def _safe_pid(pid, fallback_index):
    """Mirrors collect.js's `meta.pid || "participant"`, plus a numeric
    suffix so multiple pid-less/duplicate-pid samples don't overwrite each
    other on export the way a single browser session downloading once
    never had to worry about."""
    base = (pid or f"participant{fallback_index}").strip()
    # keep exports filesystem-safe regardless of what a researcher typed
    # into the PID field
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in base) or f"participant{fallback_index}"


def export_samples(output_dir: str, since: Optional[str], limit: int) -> int:
    if not db.available():
        print(f"[export_from_mongo] No MongoDB reachable: {db.status()}", file=sys.stderr)
        return 1

    os.makedirs(output_dir, exist_ok=True)
    samples = db.list_samples(limit=limit)

    if since:
        samples = [s for s in samples if s.get("created_at", "") >= since]

    if not samples:
        print("[export_from_mongo] No matching samples found.")
        return 0

    written = 0
    for i, sample in enumerate(samples):
        pid = _safe_pid(sample.get("pid"), i)

        meta = {
            "pid": sample.get("pid"),
            "age": sample.get("age"),
            "gender": sample.get("gender"),
            "expressionsCaptured": sample.get("expressions_captured", []),
            "timestamp": sample.get("created_at"),
            "source": "mongodb",
            "mongoId": sample.get("_id"),
        }
        with open(os.path.join(output_dir, f"{pid}-metadata.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        if sample.get("text_sample"):
            with open(os.path.join(output_dir, f"{pid}-text.txt"), "w", encoding="utf-8") as f:
                f.write(sample["text_sample"])

        for field, file_id in (sample.get("files") or {}).items():
            data = db.get_file(file_id)
            if field == "audio":
                out_name = f"{pid}-audio.webm"
            elif field.startswith("selfie_"):
                expression = field[len("selfie_"):]
                out_name = f"{pid}-selfie-{expression}.png"
            else:
                out_name = f"{pid}-{field}.bin"
            with open(os.path.join(output_dir, out_name), "wb") as f:
                f.write(data)

        written += 1

    print(f"[export_from_mongo] Wrote {written} sample(s) to {output_dir}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", required=True, help="Folder to write exported files into (created if missing)")
    parser.add_argument("--since", default=None, help="Only export samples with created_at >= this ISO date/time (e.g. 2026-08-01)")
    parser.add_argument("--limit", type=int, default=500, help="Max samples to export in one run (default 500)")
    args = parser.parse_args()

    sys.exit(export_samples(args.output, args.since, args.limit))


if __name__ == "__main__":
    main()
