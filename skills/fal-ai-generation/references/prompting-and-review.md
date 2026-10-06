# Prompting and review

## Concepts and accepted designs

For exploration, vary meaningful design dimensions: silhouette, proportions,
construction, palette or mood. Label candidates so a user can select one without
retyping its prompt. Use the requested number of variations; a model's ability
to generate more is not a reason to expand the batch.

For faithful editing, name what stays and the precise change. Reuse the accepted
image rather than rebuilding it from a long prose description. When combining
references, assign each a role: body from image A, material from image B, or pose
from image C. Preserve the chosen framing and exclude unrelated style cues.

Material-only edits keep the mesh, silhouette, camera and background stable.
A supplementary character sheet is not automatically the source for isolated
parts. Neutral reference work needs flat light and readable anatomy; cinematic
hero lighting can hide structure or bake misleading shadows into the reference.

## Materials and meshes

Patina-style material generation, mesh retexturing and mesh generation solve
different problems. Discover the current endpoint and its input schema for the
selected operation. Do not substitute a texture generator for a requested mesh
or promise a game-ready mesh from a high-poly generation alone.

For PBR maps, identify each channel, resolution, UV use and color space. Inspect
tiling and roughness response in the target renderer. Normal conventions and
packed channels differ between engines. Preserve high-poly texture detail when
baking onto an unwrapped low-poly mesh; verify the exported material separately.

## Motion references

Specify the opening pose, action, contact/recovery, camera and duration. Reuse
an accepted video as motion authority when the request is a human or costume
transfer. A newly generated clip is a visual reference, not measured mocap data.
Keep readable source motion separate from shorter gameplay timing.

## Delivery review

- Compare the result with the input and brief at full size, not only a thumbnail.
- Check count, framing, identity, missing parts and unintended additions.
- Check that each saved file opens and that the report links to its actual file.
- Keep one review verdict per output and record why a take was accepted/rejected.
- When revising, change the failed criterion without discarding approved features.
- Stop at the requested result; additional attempts need a reason and available
  task budget. Never hide failed takes or call an unchecked batch approved.

Examples in this package are neutral instructions, not paid generation results.
