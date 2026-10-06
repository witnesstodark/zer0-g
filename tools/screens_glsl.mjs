// Writes the street view's screens.glsl from the game's own screen code (experience/boards_glsl.js), so the
// jumbotrons and the ribbons play the same show inside and outside. node tools/screens_glsl.mjs
import { writeFileSync } from 'node:fs'
import { boardChunk } from '../experience/boards_glsl.js'

const HW = 15.65, HD = 21.65                 // the ribbon round the arena (lods_build.py: the walls less 0.35 m)
const glsl = `// The screens of the street view (written by tools/screens_glsl.mjs from experience/boards_glsl.js: the same
// show as in the game). Their codes are in uv.x, kept inside 0..1 (the server quantizes texture coordinates):
// below 0.5 a jumbotron, (k + u) / 16 for screen k (each side of each screen its own place in the show);
// 0.7 the ribbon round the arena read from inside, 0.9 from outside, 0.8 the boards along the stands. uv.y
// runs down the screen. board.png comes in as stored (sRGB values), read at its full size (the dots of light
// pick single points of it, so mipmaps would only blur their edges).
#define BOARD(uv) pow(textureLod(board, uv, 0.0).rgb, vec3(2.2))
${boardChunk}
const float RHW = ${HW.toFixed(2)};
const float RHD = ${HD.toFixed(2)};
const float PERIM = ${(4 * HW + 4 * HD).toFixed(2)};

// metres along the ribbon for someone inside: the north wall west to east, then the east wall, and on round
float alongIn(vec3 p) {
  if (abs(p.z + RHD) < 0.3) return p.x + RHW;
  if (abs(p.x - RHW) < 0.3) return 2.0 * RHW + p.z + RHD;
  if (abs(p.z - RHD) < 0.3) return 2.0 * RHW + 2.0 * RHD + RHW - p.x;
  return 4.0 * RHW + 2.0 * RHD + RHD - p.z;
}

void p0Surface(inout P0Surface s) {
  float x = s.uv.x;
  float v = 1.0 - s.uv.y;
  vec3 c;
  if (x < 0.5) {
    float k = floor(x * 16.0);
    c = jumbotron(vec2(fract(x * 16.0), v), p0Time + k * 5.3);
  } else {
    float code = floor(x * 10.0 + 0.5);
    vec3 p = s.position;
    if (code < 7.5) c = ribbonBoard(vec2(alongIn(p), v), p0Time, 1.2);
    else if (code < 8.5) c = ribbonBoard(vec2(p.x > 0.0 ? p.z + 17.4 : 17.4 - p.z, v), p0Time, 0.6);
    else c = ribbonBoard(vec2(PERIM - alongIn(p), v), p0Time, 1.2);
  }
  s.color = vec3(0.01);
  s.emissive = c;
  s.roughness = 0.6;
  s.metalness = 0.0;
}
`
writeFileSync(new URL('../lods/screens.glsl', import.meta.url), glsl)
console.log('screens.glsl', glsl.length, 'bytes')
