---
name: 3d-production-routing
description: Choose a workflow for game art: concept images, generated meshes, sound and voice. Use when deciding which API, skill or production route fits a 3D or game asset task, or continuing a generation across those tools.
---

# Route 3D production

Start with the intended deliverable: image reference, textured mesh, material maps, a
sound or a voice line. Inspect the supplied assets and the target engine before
selecting a route.

| Need | Skill |
| --- | --- |
| Concept images, portraits, edits of an accepted image (Nano Banana through fal.ai) | `fal-ai-generation` |
| Sound effects and announcer lines through fal.ai (ElevenLabs endpoints); music with ElevenLabs Music and Sonilo | `fal-ai-generation` |
| Image to textured mesh (Tripo P2 and others through AssetHub) | `assethub-production` |
| A character split into part meshes and assembled (AssetHub V4) | `assethub-production` |
| Building and publishing the game itself on Project 0 | [Project 0's skill](https://project0.city/skill.md) |

This is how ZER0-G was routed: the machine concepts came from Nano Banana Pro and the
pilot portraits from Nano Banana, both through fal.ai, the machine meshes from Tripo P2 through AssetHub,
the sound effects and the announcer from ElevenLabs through fal.ai, the music from
ElevenLabs Music and Sonilo (their prompts and endpoint ids are in `sources/music/`), and the game code,
courses and asset preparation were written by the agent in this repository's
`experience/` and `tools/`.

Read the selected skill before execution. Its presence does not mean its MCP, CLI,
account or editor is connected. Inspect live capabilities and exact model schemas; keep
provider choices and accepted references from the current task.

For a game asset, separate concept acceptance from mesh acceptance. Verify topology,
scale, materials and engine import as applicable. A successful API request or an
attractive render is not an engine handoff: check the asset in the running game.
Record the chosen route, the job ids and the acceptance criteria next to the outputs.
