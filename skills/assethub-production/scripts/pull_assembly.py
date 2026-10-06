"""Download V4 assembly rounds from an AssetHub production order, finished or not.

python pull_assembly.py <order-id> <out-dir> [--glb]

Exports the order graph (`assethub graph show --graph <order-id>`), then for every assembly
round saves the review renders (assembly views, concept overlay, placement dots) with
`assethub graph image`, the round's review/decision text as JSON, and with --glb the
assembled character via `assethub mesh download mesh_<meshId>`. Read-only on AssetHub;
no credits are spent. Images over the endpoint's 3 MB inline limit are reported and skipped.
"""
import argparse
import json
import pathlib
import re
import subprocess

RENDER_ROLES = {"role:assembly_views": "assembly_views", "role:assembly_overlay": "concept_overlay",
                "role:assembly_dots": "dots", "role:assembly_interfaces": "interfaces"}
TEXT_ROLES = {"role:assembly_review": "review", "role:assembly_decision": "decision",
              "role:assembly_report": "placement_report"}


def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def short(msg):
    lines = [l for l in msg.strip().splitlines() if "error" in l.lower()]
    return (lines[0] if lines else msg.strip()[-160:])[:200]


def round_of(node):
    m = re.search(r"round (\d+)", node["metadata"].get("title", ""))
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("order_id")
    ap.add_argument("out_dir")
    ap.add_argument("--glb", action="store_true", help="also download each round's assembled mesh (can be 200 MB+)")
    args = ap.parse_args()

    out = pathlib.Path(args.out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    graph_file = out / "order_graph.json"
    code, msg = run(f'assethub graph show --graph {args.order_id} --out "{graph_file}"')
    if code != 0:
        raise SystemExit(f"graph export failed: {msg[-400:]}")
    nodes = json.loads(graph_file.read_text(encoding="utf-8"))["nodes"]

    summary = []
    for n in nodes:
        rnd = round_of(n)
        if rnd is None:
            continue
        tags = set(n["tags"])
        folder = out / f"round{rnd}"
        folder.mkdir(exist_ok=True)
        for role, name in RENDER_ROLES.items():
            if role in tags:
                code, msg = run(f'assethub graph image {args.order_id} {n["id"]} --out "{folder / (name + ".png")}"')
                summary.append(f"round {rnd} {name}: {'ok' if code == 0 else 'skipped, ' + short(msg)}")
        for role, name in TEXT_ROLES.items():
            if role in tags:
                (folder / f"{name}.json").write_text(json.dumps(n.get("payload"), ensure_ascii=False, indent=1),
                                                     encoding="utf-8")
                summary.append(f"round {rnd} {name}: saved")
        if "role:assembled_character" in tags:
            p = n.get("payload") or {}
            mesh_id = p.get("meshId")
            summary.append(f"round {rnd} assembled mesh: mesh_{mesh_id}, {round((p.get('size') or 0) / 1e6)} MB")
            if args.glb and mesh_id:
                code, msg = run(f'assethub mesh download mesh_{mesh_id} --out-dir "{folder}"')
                summary.append(f"round {rnd} GLB: {'downloaded' if code == 0 else 'failed, ' + short(msg)}")
    print("\n".join(summary) or "no assembly rounds in this order yet")


if __name__ == "__main__":
    main()
