"""Record AssetHub run progress until each run ends.

python poll_progress.py [--out-dir DIR] [--interval 45] <name>=<run-uuid> [<name>=<run-uuid> ...]

Appends a JSON line to DIR/<name>_progress.jsonl whenever the run's status or progress
changes (status, progress, outputs, usage, error, history). Stops once every run has left
queued/running. Transient CLI or API failures are logged as poll_error lines and retried.
Read-only: it only calls `assethub runs get`.
"""
import argparse
import datetime
import json
import pathlib
import subprocess
import time


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="+", help="name=run-uuid pairs")
    ap.add_argument("--out-dir", default=".", help="folder for <name>_progress.jsonl (default: current)")
    ap.add_argument("--interval", type=int, default=45, help="seconds between polls (default 45)")
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    runs = dict(r.split("=", 1) for r in args.runs)
    last, done = {}, set()
    while len(done) < len(runs):
        for name, rid in runs.items():
            if name in done:
                continue
            out = out_dir / f"{name}_progress.jsonl"
            now = datetime.datetime.now().isoformat(timespec="seconds")
            try:
                raw = subprocess.run(f"assethub runs get {rid}", shell=True, capture_output=True,
                                     text=True, encoding="utf-8", timeout=120).stdout
                r = json.loads(raw)["execution"]
                p = r.get("progress") or {}
                key = json.dumps([r.get("status"), p], sort_keys=True)
                if key != last.get(name):
                    last[name] = key
                    snap = {"t": now, "status": r.get("status"), "progress": p, "outputs": r.get("outputs"),
                            "usage": r.get("usage"), "error": r.get("error"), "history": r.get("history")}
                    with out.open("a", encoding="utf-8") as f:
                        f.write(json.dumps(snap, ensure_ascii=False) + "\n")
                    print(f"{now} {name}: {r.get('status')} · {p.get('summary', '')}", flush=True)
                if r.get("status") not in ("queued", "running"):
                    done.add(name)
            except Exception as ex:  # keep polling through transient failures
                with out.open("a", encoding="utf-8") as f:
                    f.write(json.dumps({"t": now, "poll_error": repr(ex)[:300]}) + "\n")
        if len(done) < len(runs):
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
