// The racing machines: their own paint (the atlas), its brightest seams glowing, a rim of light; behind each
// a thruster flame (the white strip at the bottom of the atlas, uv.x from the nozzle to the tail).
void p0Surface(inout P0Surface s) {
  if (s.uv.y > 0.94) {
    float k = clamp(s.uv.x / 0.3, 0.0, 1.0);
    float across = abs(s.uv.y - 0.97) / 0.025;
    float body = (1.0 - k) * (1.0 - across * across);
    if (body < 0.12) discard;
    float flick = 0.8 + 0.2 * sin(p0Time * 40.0 + s.world.x * 3.0 + s.world.z * 2.0);
    s.color = vec3(0.0);
    s.emissive = mix(vec3(1.5, 1.7, 2.2), vec3(0.3, 0.6, 1.8), k) * body * flick * 1.8;
    return;
  }
  float rim = pow(1.0 - max(dot(s.normal, s.view), 0.0), 3.0);
  float lum = max(max(s.color.r, s.color.g), s.color.b);
  s.emissive += s.color * (smoothstep(0.55, 0.9, lum) * 0.7 + rim * 0.6);
  s.metalness = 0.35;
  s.roughness = 0.35;
}
