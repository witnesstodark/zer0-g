// What every shader shares: the clock, the night fog, and a few helpers.

import * as THREE from 'three'

export const shared = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0.035, 0.02, 0.085) },
  uFogDensity: { value: 0.011 },
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
