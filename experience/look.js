// What every shader shares: the clock, the night fog, and a few helpers.

import * as THREE from 'three'

export const shared = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0.035, 0.02, 0.085) },
  uFogDensity: { value: 0.011 },
  uPx: { value: 620 },          // pixels per metre at a metre from the camera (the shaders size their detail by it)
}

/** applyFog(colour, world position): the night haze, thicker with distance. */
export const fogChunk = /* glsl */`
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 applyFog(vec3 c, vec3 w) {
  float d = length(w - cameraPosition) * uFogDensity;
  return mix(c, uFogColor, 1.0 - exp(-d * d));
}
// hashes without sin (sin of large numbers is noisy on GPUs: patterns crawl and flicker)
float hash11(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// how much of [x - w/2, x + w/2] has fract(x) above a: a step on every cell, box-filtered over w (one pixel), so a
// fine repeating pattern greys out evenly instead of crawling
float boxStep(float x, float a, float w) {
  w = max(w, 1e-4);
  float x0 = x - 0.5 * w, x1 = x + 0.5 * w;
  float f1 = floor(x1) * (1.0 - a) + max(fract(x1) - a, 0.0);
  float f0 = floor(x0) * (1.0 - a) + max(fract(x0) - a, 0.0);
  return (f1 - f0) / w;
}
`

export const ACCENTS = {
  cyan: 0x29d3ff,
  magenta: 0xff2bd6,
  gold: 0xffb21f,
  lime: 0x7dff3a,
  pink: 0xff6fb5,
  violet: 0x9a4dff,
  red: 0xff3b30,
  white: 0xeaf6ff,
}
