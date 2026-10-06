// The worlds round the courses: NEON CITY (city.js), DEEP SPACE (space.js) and the DESERT (desert.js). Each is
// built the same way (constructor(lot, track, pictures, random), .group, .update(dt, camera), .animate(time),
// .crowd for the cheer, objects named 'crowd' and 'traffic' that the light version hides) and carries a look:
// its fog, sun, ambient light and bloom, applied when its course comes up.

import * as THREE from 'three'
import { shared } from './look.js'
import { City } from './city.js'
import { Space } from './space.js'
import { Desert } from './desert.js'

const C = (r, g, b) => new THREE.Color(r, g, b)

export const LOOKS = {
  // the neon city at night (what main.js always set up)
  city: { fog: C(0.035, 0.02, 0.085), fogDensity: 0.011, sun: new THREE.Color(0xbfd8ff), sunIntensity: 0.9, sunAt: [-10, 30, 14], ambient: new THREE.Color(0x6a4cff), ambientIntensity: 0.25, hemi: 0.5, bloom: 0.85 },
  // deep space: clear and dark, one hard white star
  space: { fog: C(0.006, 0.008, 0.026), fogDensity: 0.0032, sun: C(1.0, 0.95, 0.88), sunIntensity: 1.7, sunAt: [-45, 35, 55], ambient: C(0.3, 0.32, 0.7), ambientIntensity: 0.3, hemi: 0.3, bloom: 0.9 },
  // the desert at the hot end of the afternoon: warm haze, a low sun, teal shadows
  desert: { fog: new THREE.Color().setRGB(1.0, 0.64, 0.36, THREE.SRGBColorSpace), fogDensity: 0.0032, sun: C(1.0, 0.8, 0.58), sunIntensity: 2.3, sunAt: [60, 24, -75], ambient: C(0.42, 0.62, 0.68), ambientIntensity: 0.7, hemi: 0.85, bloom: 0.45 },
}

const KINDS = { city: City, space: Space, desert: Desert }

/** The world for a course: name is 'city', 'space' or 'desert' (anything else: the city). */
export function makeEnvironment(name, lot, track, pictures, random) {
  const kind = KINDS[name] ? name : 'city'
  const env = new KINDS[kind](lot, track, pictures, random)
  env.kind = kind
  env.look = LOOKS[kind]
  return env
}

/** Put a world's look on the shared fog, the sun, the scene's ambient and sky lights, and the bloom. */
export function applyLook(look, { sun, bloom, scene }) {
  const L = look ?? LOOKS.city
  shared.uFogColor.value.copy(L.fog)
  shared.uFogDensity.value = L.fogDensity
  if (sun) { sun.color.copy(L.sun); sun.intensity = L.sunIntensity; sun.position.set(...L.sunAt) }
  for (const o of scene?.children ?? []) {
    if (o.isAmbientLight) { o.color.copy(L.ambient); o.intensity = L.ambientIntensity }
    if (o.isHemisphereLight) o.intensity = L.hemi
  }
  if (bloom) bloom.strength = L.bloom
}
