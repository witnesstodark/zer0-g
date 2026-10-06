// The GLSL of the arena's screens (no imports: tools/screens_glsl.mjs also writes it into the street view's
// screens.glsl). The show's script, the atlas layout, the LED look: see boards.js.

// the atlas: cells of 340 x 192 px, six to a row; the ribbon's strip as two rows of 2048 x 128 below them
const CW = 340, CH = 192, COLS = 6, STRIP_Y = 1344, STRIP_H = 128

// the show: [frame, seconds]. Frames: 0 logo, 1 win the cup, 2-5 key art (cup, race, face-off, volt),
// 6-8 live, 9 tonight, 10-27 the pilots, 28-32 sponsors, 33 ZER0-G, 34 GET READY, 35-37 3 2 1, 38 GO!,
// 39 VS, 40 THE PILOTS
const pilots = (dur, from = 10, to = 27) => Array.from({ length: to - from + 1 }, (_, k) => [from + k, dur])
export const SHOW = [
  [0, 3.0], [1, 2.2], [2, 3.0], [40, 1.0], ...pilots(0.17), [27, 1.4], [39, 0.7], [4, 2.6], [3, 3.0], [9, 2.0],
  [6, 1.6], [7, 1.6], [8, 1.6], [28, 1.3], [29, 1.3], [30, 1.3], [31, 1.3], [32, 1.3], [5, 2.6],
  [34, 1.2], [35, 0.6], [36, 0.6], [37, 0.6], [38, 1.0], [33, 1.6], [1, 1.6],
]

const starts = []
let acc = 0
for (const [, d] of SHOW) { starts.push(acc); acc += d }
export const f1 = v => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(3)))

/** The GLSL of the show and the LED look (shared with the street view's screens.glsl). */
export const boardChunk = /* glsl */`
  #ifndef BOARD
  uniform sampler2D uBoard;
  #define BOARD(uv) texture2D(uBoard, uv).rgb
  #endif
  #define SHOW_N ${SHOW.length}
  const float SHOW_F[SHOW_N] = float[SHOW_N](${SHOW.map(s => f1(s[0])).join(', ')});
  const float SHOW_T[SHOW_N] = float[SHOW_N](${starts.map(f1).join(', ')});
  const float SHOW_LEN = ${f1(acc)};

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
    vec2 px = vec2(mod(f, ${f1(COLS)}) * ${f1(CW)} + uv.x * ${f1(CW)}, floor(f / ${f1(COLS)}) * ${f1(CH)} + (1.0 - uv.y) * ${f1(CH)});
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
    vec2 px = vec2((sx - row * 0.5) * 2.0 * 2048.0, ${f1(STRIP_Y)} + row * ${f1(STRIP_H)} + (1.0 - (cell.y + 0.5) / rows) * ${f1(STRIP_H)});
    vec3 c = BOARD(vec2(px.x, 2048.0 - px.y) / 2048.0);
    c = floor(c * 6.0 + 0.5) / 6.0;
    // now and then a wave of colour runs round the arena
    float wave = smoothstep(0.75, 1.0, sin(uv.x * 0.08 - t * 2.2)) * step(0.6, fract(t / 23.0));
    c += vec3(1.0, 0.17, 0.84) * wave * 0.35;
    return c * ledDots(g) * 1.7;
  }
`

