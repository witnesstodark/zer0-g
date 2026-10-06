# AssetHub notes

AssetHub (app.assethub.io) is a hosted 3D production platform: image edits, image-to-3D
across several providers, mesh processing, rigging, and production agents that split a
character concept into parts, mesh each part and assemble them. The same account and
credits are reachable three ways: the browser canvas, the `assethub` CLI and the hosted
MCP. The step-by-step procedure, scripts and prompt templates are in the
[assethub-production skill](../assethub-production/SKILL.md). Facts below were observed
in October 2026 with CLI 0.1.39; check them against the current CLI.

## Setup

- **CLI:** `npm i -g @assethub/cli@latest` (0.1.31 or newer for V4). Log in with your own
  key: `assethub auth login --api-key-stdin`. The CLI stores the login in
  `~/.assethub/config.json`. Auto-update runs once a day.
- **MCP:** endpoint `https://app.assethub.io/api/mcp` with an `Authorization: Bearer <key>`
  header. Keep the key in an ignored `.env` or your client's secret storage and reference
  it from the MCP config; never commit it.
- **Vendor skill:** `assethub setup --only skills` installs the vendor's own `assethub`
  skill. It is managed and refreshed by the CLI; keep it outside your repository.
- `assethub setup --project` writes the API key and workspace ID into project config.
  Skip it in a shared repository and use environment variables instead.
- Check a machine with `assethub doctor --mcp`.

## Discover before spending (all free)

```powershell
assethub update --check
assethub capabilities
assethub doctor --mcp
assethub production agents          # V4 shows as "V4 Character Assembly"
assethub models list                # ids + creditCost per model
assethub models list --domain imageGen   # "--domain image" returns nothing
assethub models get <model-id>      # options: resolutions, aspect ratios, batch
assethub api search "<words>"
assethub api describe "<METHOD /path>"
assethub api call "GET /account"         # balance, availableBalance, reservedCredits
assethub api call "GET /account/usage"   # authoritative per-job charges
```

Read `api describe` before any `api call`; do not guess field names. The public reference
is the OpenAPI file at `https://app.assethub.io/api/v2/openapi.json`. V1 production
endpoints appear only in the logged-in catalog (`api search`). Early-access agents are
gated per account: V4 is visible only to accounts AssetHub enabled, and API keys inherit
access from the account that created them.

## Single meshes with Tripo P2

- `assethub mesh generate --input-json @request.json --canvas <id> --operation-id <uuid> --wait`
  with `{"source":{"resourceId":"<image-asset-id>"},"modelId":"meshGen.tripo_p2_preview","faceLimit":10000,"params":{"quad":false,"texture":true,"pbr":true,"textureQuality":"detailed"}}`.
- Costs seen: 145 credits with `textureQuality: "standard"` (three 2048 px maps), 155 with
  `"detailed"` (4096 px maps). About 10k triangles at the default face limit.
- "Tripo is busy" (too many generations at once) refusals were released, not charged.
  Keep at most four jobs running and resubmit those.
- Uploads are limited to 4 MB: a 1536 px PNG fits; avoid JPEG inputs where you can.

## V4 Character Assembly

Concept image → part plan → part images → per-part meshes → assembled character, with a
recovery loop that regenerates broken part images or meshes. Graph endpoint
`/api/v1/production/analyze`. A full run takes about an hour; the CLI reports four phases
("1/4 Planning the parts" first).

```powershell
assethub canvas create --name "<project> - <character>"
assethub canvas use <canvas-id>     # analyze has no --canvas flag; this pins the canvas
assethub canvas import --canvas <canvas-id> --file input/concept.webp --name "Source"
assethub production analyze --source-id <image-asset-id> --part-extractor v4 `
  --name "<character>" --wait --download --out-dir <out>/v4
assethub production batch --file a.png --file b.png --part-extractor v4 --yes --wait `
  --download --out-dir <out>/batch      # --yes starts paid runs; --repeat N repeats
```

- **Mesh model:** without an override V4 picks per part itself (Tripo 3.1, Rodin Gen-2.5
  and, on a repair, Meshy V7.1). Pass the model explicitly; the server validates it before
  billing: `--mesh-generation-json @mesh_p2.json`. AssetHub documents a P2 Quad variant
  (`quad: true`, FBX, faceLimit max 25,000), but in V4 it was billed and built as standard
  P2. For a single prop, `mesh generate` takes the same `modelId`, `faceLimit` and
  `params`, and quad does apply there.
- There is no estimate and no `maxCostCredits` for analyze. Check the balance before a
  batch and read the real charge from `GET /account/usage` afterwards. The usage log has
  no run ID; split concurrent runs by model and time.
- Observed costs (a faun character): default models about 1,050 credits for a 7-part run
  with four assembly rounds (1 h 44 min); with Tripo P2 forced, about 2,600 credits in
  57 min, since each part-mesh attempt costs 145 and retries multiply it. A part that fails
  P2 five times falls back to another model (Tripo 3.1), which can bring millions of
  triangles back. Choose P2 for game budgets and check the look before committing to it.
- Do not send `pipelineDepth`, `assemblyPolicy`, `baseBodyAssetId` or `autoRepair` with
  V4; they belong to V3.x agents.
- Progress phases: plan → body → parts → assembly → done. Each part reports a state
  (drawing, meshing, checking, redoing, ready, kept, failed), its mesh model and attempts.
  `assethub runs list --canvas <id>` shows it; `runs get` needs the full UUID.
- `--wait` blocks up to about two hours. **Exit 3 is not a failure.** It means either a
  timeout (the run continues server-side: `assethub runs wait <run-id>`) or `needs_review`
  (finished; the best assembly is kept in `outputs[]`). `completed` means the assembly
  passed AssetHub's review; `failed` with `CHARACTER_ASSEMBLY_NOT_ACCEPTED` means no
  assembly. A fresh command is a second paid run; `production resume` picks up a stalled
  run without a new charge. CLI 0.1.39 exited 0 for a `needs_review` run, so read
  `execution.status` instead of relying on the exit code.
- Batches: `production batch` (or MCP `production_analyze_batch`) take up to 20 runs;
  extra runs are deferred at the plan's concurrent agent-run limit. The MCP
  `production_analyze` tool exposes only the image, agent version and name; anything else
  needs `operation_call`. There are no run-level webhooks, so poll.
- In the browser: open the canvas, select the image, **Add 3D Production**, model
  **V4 Character Assembly**, **Start 3D Production**.

### Prepare the concept first

1. Repose to a strict-front A-pose with empty hands (dead-front camera, palms forward,
   white background, flat light). A held prop fuses with the hand and arm, and a 3/4 pose
   skews the part plan.
2. Generate a large held prop (bow, staff, sword) as its own strict-front image and mesh it
   separately. Body-mounted gear such as a quiver can stay on the character.
3. Inspect the result for anatomy drift before spending an hour of V4. Non-human legs
   (digitigrade, hooves) must be named explicitly in the prompt.

### Image edits inside AssetHub

- `assethub image generate --input-json @req.json --canvas <id> --operation-id <uuid> --wait`
  with `source.resourceId`, `modelId`, `resolution`, `aspectRatio`, `batchSize`.
- Nano Banana Pro (`imageGen.nanoBanana.pro.openrouter`, 25 credits per image) returned
  896×1200 for 3:4 even with `resolution: 2048`. Use fal.ai (Nano Banana Pro 2K) when a
  reference must be 2K, then `canvas import` it.
- `negativePrompt` is ignored by Nano Banana Pro (returned as a warning). Put exclusions
  in the main prompt.
- Outputs land on the canvas automatically. Signed output URLs expire after one hour;
  download immediately and keep the durable `assetId` (`GET /assets/{assetId}` issues a
  fresh URL).

## Records

Keep with your outputs: canvas ID, run ID, order ID, operation IDs, input asset IDs,
request JSON, downloaded outputs with the CLI `manifest.json`, and the observed credit
charges. An agent verdict (`evaluations submit`) is not your approval.

References: [CLI on npm](https://www.npmjs.com/package/@assethub/cli),
[OpenAPI reference](https://app.assethub.io/api/v2/openapi.json),
[CLI repository](https://github.com/AssetHub-inc/assethub-cli).
