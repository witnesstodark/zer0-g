# Skills

These are the agent skills I used to make the art and sound for ZER0-G, ready to drop
into your own project. They work with Claude Code and Codex CLI. The game itself (code,
courses, asset preparation) is in the rest of this repository.

| Skill | What it did for ZER0-G |
| --- | --- |
| [3d-production-routing](3d-production-routing/SKILL.md) | Picks the route for each asset: which tool makes the concept, the mesh or the sound. |
| [fal-ai-generation](fal-ai-generation/SKILL.md) | Machine concepts with Nano Banana Pro, pilot portraits with Nano Banana, sound effects and announcer lines with ElevenLabs, all through fal.ai. Includes a queue helper that uploads local references and resumes jobs by request id. |
| [assethub-production](assethub-production/SKILL.md) | The 18 machine meshes with Tripo P2 through AssetHub ("detailed" textures), plus AssetHub's V4 character assembly for characters split into parts. |

To build and publish the game on Project 0, the agent followed Project 0's own skill:
[project0.city/skill.md](https://project0.city/skill.md). It covers lots, experiences,
the `p0` API and publishing. It is maintained by Project 0, so it is linked here rather
than copied.

The game-side steps after generation are in this repository: `tools/machine_prep.py`
(turns, scales and decimates the machines, bakes their glow maps), `tools/machine_pack.mjs`
(quantises them), `tools/audio_pack.py` (levels and packs the sound), `tools/track_design.py`
(the courses) and `sources/` (the prompts and generation scripts behind every asset).

## Install

Copy the folders you want into your project:

- Claude Code: `.claude/skills/<skill-name>/`
- Codex CLI: `.agents/skills/<skill-name>/`

Copy `_support/` next to them as well (`.claude/skills/_support/`), since
`assethub-production` links to `_support/assethub-notes.md`. Start a new agent session so
the skills are listed, then ask the agent to read the one you need before it starts.

## Accounts and keys

You bring your own accounts. Nothing in this folder contains keys.

- **fal.ai:** an API key from the [fal dashboard](https://fal.ai/dashboard/keys) in
  `FAL_KEY`, and optionally the fal MCP at `https://mcp.fal.ai/mcp`. Setup:
  [fal-ai-generation/references/setup.md](fal-ai-generation/references/setup.md).
  The helper needs Python 3.10+ and `pip install -r fal-ai-generation/scripts/requirements.txt`.
- **AssetHub:** an account at [app.assethub.io](https://app.assethub.io), the CLI
  (`npm i -g @assethub/cli`) logged in with your own key, and optionally the hosted MCP.
  Setup: [_support/assethub-notes.md](_support/assethub-notes.md). V4 character assembly
  is enabled per account by AssetHub.
- **Blender** (optional) for `assethub-production/scripts/render_preview.py` and for
  `tools/machine_prep.py`.

Copy [.env.example](.env.example) to `.env` in your project, fill it in, and keep `.env`
out of git. Generation spends credits on your account: the skills check prices first and
never resubmit a job that may still be running.

These skills are released under the repository's MIT license.
