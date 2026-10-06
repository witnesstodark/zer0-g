// HYPERLANE's course from the street: a dark glass road with cyan edge lines and violet chevrons that a
// light runs forward through, a checker band at the start line; magenta strips under the slab; barriers of
// light with scanlines. uv.x: 0..1 the road across, 2..3 the underside, 4..5 a barrier's height; uv.y: metres.
float band(float x, float a, float b, float aa) { return smoothstep(a - aa, a, x) - smoothstep(b, b + aa, x); }
void p0Surface(inout P0Surface s) {
  float u = s.uv.x, v = s.uv.y;
  vec2 d = fwidth(s.uv);
  float aa = max(d.x * 3.2, 0.004) * 1.5;
  float fade = clamp(1.0 - d.y * 2.0, 0.0, 1.0);
  s.metalness = 0.0;
  if (u < 1.5) {
    float x = (u - 0.5) * 3.2;
    float edge = band(abs(x), 1.49, 1.57, aa);
    float chev = band(fract(v / 4.0) - abs(x) * 0.18, 0.0, 0.07, max(d.y * 0.25, 0.01)) * step(abs(x), 0.55) * fade;
    float pulse = 0.3 + 0.7 * pow(0.5 + 0.5 * sin((v - p0Time * 25.0) * 0.08), 6.0);
    s.color = vec3(0.015, 0.02, 0.045);
    s.roughness = 0.25;
    s.emissive = vec3(0.1, 0.85, 1.5) * edge * 1.2 + vec3(0.55, 0.15, 1.3) * chev * pulse;
    if (v < 0.6) {
      float chk = mod(floor(x * 4.0) + floor(v * 4.0), 2.0);
      s.color = vec3(0.6 * chk + 0.02);
      s.emissive = vec3(0.5 * chk);
    }
  } else if (u < 3.5) {
    float k = u - 2.0;
    float strip = smoothstep(0.05, 0.0, abs(k - 0.2)) + smoothstep(0.05, 0.0, abs(k - 0.8));
    s.color = vec3(0.02, 0.02, 0.04);
    s.roughness = 0.6;
    s.emissive = vec3(0.9, 0.1, 1.2) * strip;
  } else {
    float h = u - 4.0;
    float top = smoothstep(0.14, 0.0, abs(h - 0.9));
    float foot = smoothstep(0.45, 0.0, h);
    float scan = pow(0.5 + 0.5 * sin(v * 3.0 - p0Time * 8.0), 4.0) * fade;
    s.color = vec3(0.02, 0.05, 0.08);
    s.roughness = 0.4;
    s.emissive = vec3(0.15, 0.7, 1.3) * (top * 1.3 + foot * 0.3 + scan * 0.3 * (1.0 - h));
  }
}
