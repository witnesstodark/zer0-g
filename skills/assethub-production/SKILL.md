---
name: assethub-production
description: Make 3D meshes with AssetHub through the assethub CLI or hosted MCP. Single image-to-mesh jobs with a chosen model (Tripo P2 by default), as used for the ZER0-G machines, and AssetHub's V4 Character Assembly agent, which turns one character concept into separate part meshes and an assembled character. Covers setup checks, input preparation, runs, monitoring, pulling results, Blender previews and records.
---

# AssetHub production

AssetHub (app.assethub.io) runs image-to-mesh jobs across several providers, and a
concept → part plan → part images → per-part meshes → Blender assembly pipeline
server-side. This skill is the working procedure. Setup details, API facts and observed
limits live in [the AssetHub notes](../_support/assethub-notes.md); read them before the
first paid call in a session. The vendor-managed `assethub` skill (installed by
`assethub setup --only skills`) covers generic CLI mechanics.

Paths below are relative to this skill folder. Outputs go to your project's own output
folder, never into the skill folder.

## 1. Check before spending (free)

```powershell
assethub update --check
assethub doctor --mcp
assethub models list               # model ids and credit cost
assethub production agents         # "V4 Character Assembly" must be listed for section 4
assethub api call "GET /account"   # availableBalance, reservedCredits
```

V4 is enabled per account by AssetHub. If it is missing from `production agents`, stop
and ask the account owner to get it enabled; an API key inherits access from the account
that created it.

## 2. Single meshes (how the ZER0-G machines were made)

One concept image per machine, side or three-quarter view, on a plain background.

```powershell
assethub canvas create --name "<project> - machines"
assethub canvas import --canvas <canvas-id> --file <concept.png> --name "<machine>"
assethub mesh generate --input-json @request.json --canvas <canvas-id> --operation-id <uuid> --wait
assethub jobs get <job-id> --download --out-dir <out>/<machine>
```

`request.json`:

```json
{"source": {"resourceId": "<image-asset-id>"}, "modelId": "meshGen.tripo_p2_preview",
 "faceLimit": 10000, "params": {"quad": false, "texture": true, "pbr": true, "textureQuality": "detailed"}}
```

- `textureQuality: "detailed"` cost 155 credits per mesh and returned 4096 px maps;
  `"standard"` cost 145 and returned 2048 px maps. For ZER0-G the detailed textures
  were visibly sharper even after shrinking the maps to 1024 px for the game.
- Upload a PNG when it fits AssetHub's 4 MB upload limit (a 1536 px PNG did). JPEG
  inputs carry their compression into the texture.
- Save the operation id before each call. A polling timeout is not a failure: resume
  with `jobs get <job-id>`, never submit the same machine twice. "Tripo is busy"
  refusals were released, not charged; resubmit with at most four jobs running.
- The game-side preparation (orientation, scale, decimation, glow maps, quantisation) is
  in this repository's `tools/machine_prep.py` and `tools/machine_pack.mjs`; the
  resumable submit script is `sources/machines/run_p2d.py`.

## 3. Prepare a character concept (V4)

V4 reads parts from the concept as drawn.

- Strict-front A-pose, empty hands, white background, flat light:
  [prompts/apose_front.txt](prompts/apose_front.txt). Fill in the character
  description and name non-human anatomy (hooves, digitigrade legs, tails, wings).
- Every large held prop (bow, staff, sword, shield) as its own strict-side or
  strict-front image: [prompts/prop_isolated.txt](prompts/prop_isolated.txt).
  Body-mounted gear (quiver, backpack) can stay on the character.
- Inside AssetHub: `assethub image generate --input-json @request.json --canvas <id>
  --operation-id <uuid> --wait`; template:
  [prompts/image_request.example.json](prompts/image_request.example.json).
  Nano Banana Pro there returns about 1K (896×1200 for 3:4) and ignores
  `negativePrompt`. Generate two candidates, inspect them yourself, and pick one.
  When a 2K reference is required, generate elsewhere (for example with the
  `fal-ai-generation` skill) and `canvas import` it.

## 4. Canvas and V4 run

```powershell
assethub canvas create --name "<project> - <character>"
assethub canvas use <canvas-id>    # analyze has no --canvas flag
assethub canvas import --canvas <canvas-id> --file <concept> --name "Source"
assethub production analyze --source-id <image-asset-id> --part-extractor v4 `
  --name "<character>" --mesh-generation-json @<skill>/prompts/mesh_tripo_p2.json `
  --wait --download --out-dir <out>/v4
```

- **Mesh model:** pass one explicitly. I default to Tripo P2
  ([settings](prompts/mesh_tripo_p2.json)). AssetHub documents a
  [quad variant](prompts/mesh_tripo_p2_quad.json), but in V4 it was billed and built
  as standard P2 (quad not applied); use quad for single props via `mesh generate`.
  Without an override V4 picks per part (Tripo 3.1, Rodin Gen-2.5, Meshy V7.1, Hi3D)
  and the result can reach millions of triangles. The server validates the override
  before billing.
- Run it in the background; a run takes about an hour, longer when assembly needs
  repairs. There is no cost estimate and no credit cap for analyze.
- **Read `execution.status`, not the exit code.** `needs_review` means the best assembly
  was kept in `outputs[]` (CLI 0.1.39 exited 0 for it; the docs say 3). Exit 3 can also
  be a timeout while the run continues. Never start a second paid run to "retry";
  resume or wait.

## 5. Monitor

```powershell
python <skill>/scripts/poll_progress.py --out-dir <out>/data v4=<run-uuid>
```

It appends a snapshot to `<name>_progress.jsonl` whenever status or progress changes
and stops when the run ends. Progress shows the phase (plan → body → parts →
assembly), each part's state, drawing/mesh attempts and mesh model, and assembly
review rounds. Use `runs get <full-uuid>`; `runs list --limit N` drops older runs once
newer jobs land on the canvas.

## 6. Pull assemblies, including unfinished rounds

```powershell
python <skill>/scripts/pull_assembly.py <order-id> <out>/v4/rounds [--glb]
```

It exports the order graph and downloads every round's review renders (assembly
views, concept overlay, placement dots) and, with `--glb`, the assembled GLB via
`assethub mesh download mesh_<meshId>`. Use it to show a candidate while the agent is
still repairing. The graph image endpoint refuses images over 3 MB; the script
reports and skips those.

## 7. Props

Same call as section 2. On a thin longbow (side profile): Tripo P2 triangles was clean
at 12.6K triangles; P2 quad gave clean loops but turned the string into a frame; Tripo
3.1 mirrored the profile into a double bow; Hunyuan 3.1 was clean but 377K triangles;
Rodin Gen-2.5 dropped the string. Compare at least two models on thin props.

## 8. Inspect

```powershell
& "<blender.exe>" -b --factory-startup -P <skill>/scripts/render_preview.py -- <out-prefix> <mesh.glb|fbx> [...]
```

Prints object/vertex/triangle counts and size, renders front and three-quarter views,
and a wireframe view for meshes up to 150K triangles. Judge the result against the
concept yourself. AssetHub's own review verdict is not your approval.

## 9. Records

Keep with your outputs: canvas ID, run IDs, order IDs, operation IDs, request JSON,
progress snapshots, downloaded outputs and manifests, renders, and the real charges from
`assethub api call "GET /account/usage"`. Signed URLs expire after an hour and must not
be shared or committed; asset IDs are durable. Mesh files over a few MB stay out of git.

## Example (a faun archer, V4)

Input: 3/4 concept with a held longbow, reposed in AssetHub to a strict-front A-pose,
bow generated separately. V4 with default models planned 7 parts (base body; head
with horns and hair; tunic; poncho; two bracers; quiver), redrew the head and poncho
three times, and assembled in Blender 32 minutes after start. Its review rejected
round 0 (poncho too broad, one bracer replaced by a thin wrap) and rebuilt the
assembly three more times. None passed; after 1 h 44 min the run ended `needs_review`
and kept round 0, which already matched the concept closely, including digitigrade
goat legs, at 4.0M triangles across 7 objects. Cost about 1,050 credits. A second run
with Tripo P2 forced took 57 min and about 2,600 credits (145 per mesh attempt, 23
attempts), also ended `needs_review`, and looked worse (capelet-like poncho, oversized
bracer), though its P2 parts were about 5K triangles each; the quiver fell back to
Tripo 3.1 at 1.4M triangles. P2 inside V4 was billed without quad.
