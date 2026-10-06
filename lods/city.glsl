// The arena round the course: a dark floor with a fine grid of light, the city's blocks with their lit
// windows and a neon line under each roof (uv.y = the block's height), the stands full of glow sticks
// waving, the ring of light and its towers with bands running round, the pylons with light climbing them.
// uv.x: 0.05 floor, 0.15 blocks, 0.35 stands (uv.y their height), 0.55 ring, 0.6 towers, 0.75 pylons.
// a hash without sin (sin of large numbers is noisy on GPUs: patterns crawl and flicker)
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void p0Surface(inout P0Surface s) {
  vec3 p = s.position;
  vec3 n = s.normal;
  float code = s.uv.x;
  float fw = max(max(length(fwidth(p.xz)), length(fwidth(p.xy))), length(fwidth(p.zy)));
  // how fine a pattern this pixel can hold, from the distance and the angle: smooth from pixel to pixel
  // (a fade by fwidth jumps between 2x2 pixel blocks, and the windows crawled like sand)
  float dist = length(cameraPosition - s.world);
  float facing = max(abs(dot(n, s.view)), 0.12);
  float fine = clamp(1.6 - dist * 0.0013 / facing / 0.45 * 2.5, 0.0, 1.0);
  s.metalness = 0.0;
  s.roughness = 0.75;
  if (code < 0.1) {
    vec2 f = abs(fract(p.xz / 2.0) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.04 + fw, min(f.x, f.y));
    s.color = vec3(0.012, 0.012, 0.03);
    s.emissive = vec3(0.1, 0.45, 0.9) * line * 0.35 * fine;
  } else if (code < 0.25) {
    float hgt = s.uv.y;
    float seed = h21(floor(p.xz * 0.37 + 0.5));
    vec3 accent = seed < 0.33 ? vec3(0.2, 1.0, 1.6) : seed < 0.66 ? vec3(1.6, 0.2, 1.2) : vec3(1.6, 0.8, 0.2);
    s.color = vec3(0.025, 0.022, 0.05);
    if (abs(n.y) < 0.5) {
      float along = abs(n.x) > 0.5 ? p.z : p.x;
      vec2 w = vec2(along / 0.45, p.y / 0.55);
      vec2 cell = floor(w);
      float lit = step(0.55, h21(cell + seed * 17.0));
      float win = step(0.22, fract(w.x)) * step(0.3, fract(w.y));
      vec3 wc = mix(vec3(1.0, 0.75, 0.45), vec3(0.4, 0.85, 1.0), h21(cell * 1.3));
      s.emissive = wc * mix(0.1, lit * win, fine) * 0.5 + accent * smoothstep(0.25, 0.0, hgt - p.y) * 0.8;
    } else {
      s.emissive = accent * 0.12;
    }
  } else if (code < 0.45) {
    s.color = vec3(0.03, 0.025, 0.06);
    if (n.y > 0.5) {
      vec2 c = floor(p.xz * 6.0);
      float on = step(0.55, h21(c));
      float k = h21(c + 3.1);
      vec3 col = k < 0.33 ? vec3(0.2, 1.2, 1.8) : k < 0.66 ? vec3(1.8, 0.25, 1.4) : vec3(1.8, 1.2, 0.3);
      float spot = smoothstep(0.3, 0.1, length(fract(p.xz * 6.0) - 0.5));
      float wave = 0.55 + 0.45 * sin(p0Time * 4.0 + k * 6.28 + p.z * 0.3);
      s.emissive = col * on * mix(0.3, spot, fine) * wave * 0.9;
    } else {
      s.emissive = vec3(0.8, 0.15, 1.2) * smoothstep(0.1, 0.0, s.uv.y - p.y) * 0.9;
    }
  } else if (code < 0.7) {
    float run = pow(0.5 + 0.5 * sin((p.x + p.z + p.y) * 0.4 - p0Time * 3.0), 4.0);
    s.color = vec3(0.02);
    s.emissive = mix(vec3(0.2, 1.2, 1.8), vec3(1.6, 0.25, 1.3), step(0.58, code)) * (0.7 + run * 1.3);
  } else {
    s.color = vec3(0.04, 0.04, 0.08);
    s.emissive = vec3(0.2, 0.9, 1.5) * pow(fract(p.y * 0.25 - p0Time * 0.8), 8.0) * 1.2;
  }
}
