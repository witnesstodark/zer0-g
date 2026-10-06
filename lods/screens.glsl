// The screens of the street view (written by tools/screens_glsl.mjs from experience/boards_glsl.js: the same
// show as in the game). Their codes are in uv.x, kept inside 0..1 (the server quantizes texture coordinates):
// below 0.5 a jumbotron, (k + u) / 16 for screen k (each side of each screen its own place in the show);
// 0.7 the ribbon round the arena read from inside, 0.9 from outside, 0.8 the boards along the stands. uv.y
// runs down the screen. board.png comes in as stored (sRGB values), read at its full size (the dots of light
// pick single points of it, so mipmaps would only blur their edges).
#define BOARD(uv) pow(textureLod(board, uv, 0.0).rgb, vec3(2.2))

  #ifndef BOARD
  uniform sampler2D uBoard;
  #define BOARD(uv) texture2D(uBoard, uv).rgb
  #endif
  #define SHOW_N 43
  const float SHOW_F[SHOW_N] = float[SHOW_N](0.0, 1.0, 2.0, 40.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 27.0, 39.0, 4.0, 3.0, 9.0, 6.0, 7.0, 8.0, 28.0, 29.0, 30.0, 31.0, 32.0, 5.0, 34.0, 35.0, 36.0, 37.0, 38.0, 33.0, 1.0);
  const float SHOW_T[SHOW_N] = float[SHOW_N](0.0, 3.0, 5.2, 8.2, 9.2, 9.37, 9.54, 9.71, 9.88, 10.05, 10.22, 10.39, 10.56, 10.73, 10.9, 11.07, 11.24, 11.41, 11.58, 11.75, 11.92, 12.09, 12.26, 13.66, 14.36, 16.96, 19.96, 21.96, 23.56, 25.16, 26.76, 28.06, 29.36, 30.66, 31.96, 33.26, 35.86, 37.06, 37.66, 38.26, 38.86, 39.86, 41.46);
  const float SHOW_LEN = 43.06;

  float bHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

  // the frame on at time t, and how long it has been on
  vec2 showAt(float t) {
    t = mod(t, SHOW_LEN);
    vec2 s = vec2(SHOW_F[0], t);
    for (int i = 1; i < SHOW_N; i++) {
      if (t >= SHOW_T[i]) s = vec2(SHOW_F[i], t - SHOW_T[i]);
    }
    return s;
  }

  vec3 cellAt(float f, vec2 uv) {
    uv = clamp(uv, vec2(0.004), vec2(0.996));
    vec2 px = vec2(mod(f, 6.0) * 340.0 + uv.x * 340.0, floor(f / 6.0) * 192.0 + (1.0 - uv.y) * 192.0);
    return BOARD(vec2(px.x, 2048.0 - px.y) / 2048.0);
  }

  // the dots of light: round, smoothed into an even glow where they get smaller than a pixel
  float ledDots(vec2 g) {
    vec2 f = fract(g) - 0.5;
    float aa = max(fwidth(g.x), fwidth(g.y));
    return mix(1.0 - smoothstep(0.3, 0.5, length(f)), 0.6, smoothstep(0.2, 0.6, aa));
  }

  vec3 jumbotron(vec2 uv, float t) {
    vec2 s = showAt(t);
    vec2 led = vec2(226.0, 128.0);
    vec2 g = uv * led;
    vec2 cell = floor(g);
    // at a cut: rows torn sideways, the colours split, a white flash
    float gl = 1.0 - smoothstep(0.0, 0.18, s.y);
    float tear = (bHash(vec2(floor(cell.y / 4.0), floor(t * 24.0))) - 0.5) * gl * 0.3;
    vec2 cu = (cell + 0.5) / led + vec2(tear, 0.0);
    float split = gl * 0.025 + 0.002;
    vec3 c = vec3(cellAt(s.x, cu + vec2(split, 0.0)).r, cellAt(s.x, cu).g, cellAt(s.x, cu - vec2(split, 0.0)).b);
    c = floor(c * 7.0 + 0.5) / 7.0;
    c += vec3(0.5) * (1.0 - smoothstep(0.0, 0.07, s.y));
    float band = 0.82 + 0.35 * pow(fract(uv.y * 0.6 - t * 0.4), 12.0);
    return c * band * ledDots(g) * 1.7;
  }

  // the ribbon: x in metres along it, y 0-1 up its height h; the strip scrolls along
  vec3 ribbonBoard(vec2 uv, float t, float h) {
    float rows = 32.0;
    float gx = uv.x / (h / rows) + t * 36.0;
    vec2 g = vec2(gx, uv.y * rows);
    vec2 cell = floor(g);
    float sx = fract((cell.x + 0.5) / (rows * 32.0));
    float row = step(0.5, sx);
    vec2 px = vec2((sx - row * 0.5) * 2.0 * 2048.0, 1344.0 + row * 128.0 + (1.0 - (cell.y + 0.5) / rows) * 128.0);
    vec3 c = BOARD(vec2(px.x, 2048.0 - px.y) / 2048.0);
    c = floor(c * 6.0 + 0.5) / 6.0;
    // now and then a wave of colour runs round the arena
    float wave = smoothstep(0.75, 1.0, sin(uv.x * 0.08 - t * 2.2)) * step(0.6, fract(t / 23.0));
    c += vec3(1.0, 0.17, 0.84) * wave * 0.35;
    return c * ledDots(g) * 1.7;
  }

const float RHW = 15.65;
const float RHD = 21.65;
const float PERIM = 149.20;

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
