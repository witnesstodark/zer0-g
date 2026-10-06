// DEEP SPACE round the track: a station deck floating in the void instead of the city's arena floor, a sky of
// stars and nebulae with a hard white sun, a ringed giant, two moons, an asteroid belt drifting round, a station
// ring where the crowd watches from, tractor beams holding the course up instead of pylons and shuttles on
// their orbits instead of traffic. The arena itself (stands, glow sticks, screens, ribbons) is the city's.
// Everything is generated: no files.

import * as THREE from 'three'
import { fogChunk, shared } from './look.js'
import { City } from './city.js'

// where the sun is (the scene's light comes from there too: LOOKS.space.sunAt)
const SUN = new THREE.Vector3(-45, 35, 55).normalize()
const SUN_GLSL = `vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)})`

// a 3D value noise and its sum of octaves, for the nebulae, the gas giant and the rocks
const NOISE = /* glsl */`
float vh3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vh3(i), vh3(i + vec3(1, 0, 0)), f.x), mix(vh3(i + vec3(0, 1, 0)), vh3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vh3(i + vec3(0, 0, 1)), vh3(i + vec3(1, 0, 1)), f.x), mix(vh3(i + vec3(0, 1, 1)), vh3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { if (k >= oct) break; s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
`

export class Space extends City {
  update(dt, camera) {
    this.sky.position.copy(camera.position)
  }

  // ------------------------------------------------------------ the sky: stars, nebulae, the galaxy, the sun
  makeSky() {
    // the broad, slow noise (the nebulae's fold and colour, the galaxy's band) is worked out at the vertices of
    // a fine sphere, only the nebulae's detail per pixel: the sky covers the screen (a software renderer felt it)
    const geo = new THREE.SphereGeometry(400, 128, 64)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: NOISE + /* glsl */`
        uniform float uTime;
        varying vec3 vDir; varying float vN1; varying float vBand;
        void main() {
          vec3 d = normalize(position);
          vDir = d;
          vN1 = fbm(d * 2.1 + vec3(0.0, 0.0, uTime * 0.002), 3);
          float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.85, -0.25))) * 3.2, 2.0));
          vBand = band * (0.25 + 0.75 * fbm(d * 8.0, 2));
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: NOISE + /* glsl */`
        uniform float uTime;
        varying vec3 vDir; varying float vN1; varying float vBand;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = vec3(0.004, 0.005, 0.016);
          // two nebulae, folded into each other
          float n1 = vN1;
          float n2 = fbm(d * 3.6 + n1 * 1.6 + 7.3, 4);
          float neb = smoothstep(0.42, 0.86, n2);
          col += mix(vec3(0.42, 0.04, 0.34), vec3(0.03, 0.22, 0.42), smoothstep(0.3, 0.7, n1)) * neb * 0.6;
          col += vec3(0.9, 0.35, 0.7) * pow(neb, 5.0) * 0.3;
          // the galaxy's band across the sky
          float band = vBand;
          col += vec3(0.24, 0.22, 0.36) * band * 0.5;
          // stars in three sizes
          for (int L = 0; L < 3; L++) {
            float sc = L == 0 ? 70.0 : (L == 1 ? 150.0 : 320.0);
            vec3 q = d * sc, c = floor(q), f = fract(q) - 0.5;
            float r = vh3(c + float(L) * 17.0);
            float keep = L == 2 ? 0.86 - band * 0.12 : 0.93;
            if (r > keep) {
              float s = smoothstep(0.22, 0.0, length(f)) * (r - keep) / (1.0 - keep);
              vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.6), vh3(c * 1.7));
              col += tint * s * (L == 0 ? 2.4 : 1.1) * (0.75 + 0.25 * sin(uTime * 3.0 + r * 40.0));
            }
          }
          // the sun: a hard disc, its glare and a wide glow
          float sd = dot(d, ${SUN_GLSL});
          col += vec3(2.2, 2.0, 1.7) * smoothstep(0.99935, 0.9996, sd);
          col += vec3(0.7, 0.55, 0.4) * pow(max(sd, 0.0), 140.0) + vec3(0.12, 0.08, 0.1) * pow(max(sd, 0.0), 7.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthWrite: false,
      side: THREE.BackSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'sky'
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    return mesh
  }

  // ------------------------------------------------------------ the station deck the arena stands on
  makeGround() {
    const L = this.lot
    const geo = new THREE.BoxGeometry(L.width + 3, 1.6, L.depth + 3)
    geo.translate(0, -0.8, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uHalf: { value: new THREE.Vector2(L.width / 2 + 1.5, L.depth / 2 + 1.5) } },
      vertexShader: /* glsl */`
        varying vec3 vWorld; varying vec3 vNormal;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vNormal = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: fogChunk + /* glsl */`
        uniform float uTime;
        uniform vec2 uHalf;
        varying vec3 vWorld; varying vec3 vNormal;
        float seam(float x, float w) { float d = fwidth(x); return 1.0 - smoothstep(w, w + d * 1.5, abs(fract(x) - 0.5) * 2.0); }
        void main() {
          vec3 n = normalize(vNormal);
          vec2 p = vWorld.xz;
          vec3 col;
          if (n.y > 0.5) {
            // plates 2.6 m square, each a little different, faint seams, a light running round the edge
            vec2 q = p / 2.6;
            vec2 cell = floor(q);
            col = vec3(0.03, 0.035, 0.055) * (0.75 + 0.5 * hash21(cell));
            vec2 fw = fwidth(q);
            float fade = clamp(1.0 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
            col += vec3(0.1, 0.35, 0.6) * max(seam(q.x, 0.03), seam(q.y, 0.03)) * fade * 0.5;
            vec2 e = uHalf - abs(p);
            float edge = min(e.x, e.y);
            col += vec3(0.2, 1.0, 1.7) * smoothstep(0.5, 0.0, edge) * (0.7 + 0.3 * sin(uTime * 3.0 + (p.x + p.y) * 0.4));
            // hazard bands just inside the edge
            float hz = step(0.6, edge) * step(edge, 1.3) * step(0.5, fract((p.x + p.y) * 0.5));
            col = mix(col, vec3(0.6, 0.45, 0.05), hz * 0.6);
          } else if (n.y < -0.5) {
            // the underside: a hex of lights, the station's belly glowing into the void
            vec2 q = p / 3.0;
            float g = max(seam(q.x + q.y * 0.5, 0.06), seam(q.y, 0.06));
            col = vec3(0.01, 0.012, 0.02) + vec3(0.6, 0.1, 0.9) * g * 0.7;
          } else {
            // the deck's side: dark, a row of windows, a bright strip on top
            col = vec3(0.02, 0.022, 0.04);
            float along = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
            float win = step(0.6, fract(along * 0.8)) * step(-1.2, vWorld.y) * step(vWorld.y, -0.5);
            col += vec3(0.9, 0.75, 0.45) * win * step(0.4, hash11(floor(along * 0.8))) * 0.7;
            col += vec3(0.2, 1.0, 1.7) * smoothstep(0.1, 0.0, abs(vWorld.y + 0.05));
          }
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
      extensions: { derivatives: true },
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'ground'
    return mesh
  }

  // ------------------------------------------------------------ station towers under the track, the asteroid belt
  makeBuildings() {
    const group = new THREE.Group()
    group.name = 'buildings'
    const rnd = this.random, L = this.lot
    const blocks = []
    for (let x = -L.width / 2 + 3; x < L.width / 2 - 3; x += 2.9) {
      for (let z = -L.depth / 2 + 3; z < L.depth / 2 - 3; z += 2.9) {
        const cx = x + (rnd() - 0.5) * 0.8, cz = z + (rnd() - 0.5) * 0.8
        if (Math.abs(cx) > 10.8 || rnd() < 0.35) continue
        const r = 0.45 + rnd() * 0.5
        const room = this.roomUnder(cx, cz, r)
        if (room < 1.2) continue
        blocks.push([cx, cz, r, Math.min(room, 1.5 + Math.pow(rnd(), 1.5) * 12)])
        this.solid(cx - r, cx + r, blocks[blocks.length - 1][3], cz - r, cz + r)
      }
    }
    // towers: eight-sided, panelled, rings of light round them
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        attribute vec2 aSize; attribute float aSeed;
        varying vec3 vWorld; varying vec3 vNormal; varying float vH; varying float vTop; flat varying float vSeed;
        void main() {
          vSeed = aSeed; vTop = aSize.y; vH = position.y * aSize.y;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz; vNormal = normalize(mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: fogChunk + /* glsl */`
        uniform float uTime;
        varying vec3 vWorld; varying vec3 vNormal; varying float vH; varying float vTop; flat varying float vSeed;
        void main() {
          vec3 n = normalize(vNormal);
          float sun = max(dot(n, ${SUN_GLSL}), 0.0);
          vec3 col = vec3(0.05, 0.055, 0.08) * (0.4 + sun * 0.9);
          vec3 accent = hash11(vSeed) < 0.5 ? vec3(0.2, 1.0, 1.7) : vec3(1.6, 0.3, 1.4);
          if (abs(n.y) < 0.5) {
            col += accent * smoothstep(0.06, 0.0, 0.5 - abs(fract(vH * 0.7 - uTime * 0.15 * hash11(vSeed * 3.0)) - 0.5)) * 0.8;
            col += vec3(0.9, 0.8, 0.55) * step(0.7, hash21(floor(vec2(atan(n.z, n.x) * 2.0, vH * 3.0)) + vSeed)) * 0.25;
          } else col += accent * 0.5;
          col += accent * smoothstep(0.12, 0.0, vTop - vH) * 0.9;
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
    })
    const towers = new THREE.InstancedMesh(geo, mat, Math.max(1, blocks.length))
    const size = new Float32Array(Math.max(1, blocks.length) * 2), seed = new Float32Array(Math.max(1, blocks.length))
    const m = new THREE.Matrix4()
    blocks.forEach(([x, z, r, h], i) => { m.makeScale(r, h, r).setPosition(x, 0, z); towers.setMatrixAt(i, m); size.set([r, h], i * 2); seed[i] = i * 0.618 + 0.3 })
    towers.count = blocks.length
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2))
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
    towers.name = 'towers'
    group.add(towers)
    this.blockCount = blocks.length

    // the asteroid belt: lumpy rocks on slow orbits round the station, each turning on its own axis
    const n = 360
    const rock = new THREE.IcosahedronGeometry(1, 1)
    const orbit = new Float32Array(n * 4), spin = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const r = 70 + Math.pow(rnd(), 0.8) * 150
      const y = (rnd() + rnd() + rnd() - 1.5) * 18 + 4
      orbit.set([r, rnd() * Math.PI * 2, y, (rnd() < 0.85 ? 1 : -1) * (0.6 + rnd() * 0.6) / r], i * 4)
      spin.set([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, 0.4 + Math.pow(rnd(), 3) * 5], i * 4)
    }
    rock.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4))
    rock.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4))
    const rockMat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: NOISE + /* glsl */`
        attribute vec4 aOrbit; attribute vec4 aSpin;
        uniform float uTime;
        varying vec3 vWorld; varying vec3 vLocal; flat varying float vSeed;
        mat3 rot(vec3 ax, float a) {
          ax = normalize(ax); float s = sin(a), c = cos(a), oc = 1.0 - c;
          return mat3(oc * ax.x * ax.x + c, oc * ax.x * ax.y + ax.z * s, oc * ax.z * ax.x - ax.y * s,
                      oc * ax.x * ax.y - ax.z * s, oc * ax.y * ax.y + c, oc * ax.y * ax.z + ax.x * s,
                      oc * ax.z * ax.x + ax.y * s, oc * ax.y * ax.z - ax.x * s, oc * ax.z * ax.z + c);
        }
        void main() {
          vSeed = aSpin.w * 13.7 + aOrbit.y;
          // a lump: the sphere pushed in and out by noise
          vec3 p = position * (0.7 + 0.6 * vnoise(position * 1.7 + vSeed));
          vLocal = p;
          p = rot(aSpin.xyz + 0.01, uTime * 0.1 * aSpin.w + vSeed) * p * aSpin.w;
          float a = aOrbit.y + uTime * aOrbit.w;
          vec3 c = vec3(cos(a) * aOrbit.x, aOrbit.z, sin(a) * aOrbit.x * 1.15);
          vec4 w = vec4(c + p, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: fogChunk + /* glsl */`
        varying vec3 vWorld; varying vec3 vLocal; flat varying float vSeed;
        void main() {
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          float sun = max(dot(n, ${SUN_GLSL}), 0.0);
          vec3 base = mix(vec3(0.16, 0.14, 0.13), vec3(0.22, 0.16, 0.24), hash11(vSeed));
          vec3 col = base * (0.08 + sun * 1.1);
          // a cold rim from the nebula side
          vec3 v = normalize(cameraPosition - vWorld);
          col += vec3(0.15, 0.25, 0.5) * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.5;
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
      extensions: { derivatives: true },
    })
    const belt = new THREE.InstancedMesh(rock, rockMat, n)
    belt.frustumCulled = false
    belt.name = 'asteroids'
    group.add(belt)
    return group
  }

  // ------------------------------------------------------------ tractor beams instead of pylons
  makePylons() {
    const t = this.track
    const spots = []
    for (let i = 0; i < t.n; i += 24) {
      const px = t.P[i * 3], py = t.P[i * 3 + 1], pz = t.P[i * 3 + 2]
      if (py < 2.5 || t.gap[i]) continue
      if (t.U[i * 3 + 1] < 0.85) continue
      let clear = true
      for (let j = 0; j < t.n; j += 2) {
        if (Math.abs(j - i) < 40) continue
        if (t.P[j * 3 + 1] < py - 0.5 && Math.hypot(t.P[j * 3] - px, t.P[j * 3 + 2] - pz) < t.width / 2 + 0.6) { clear = false; break }
      }
      if (clear) spots.push([px, py - 0.22, pz])
    }
    const group = new THREE.Group()
    group.name = 'pylons'
    const n = Math.max(1, spots.length)
    // the beam: an open cone of light, bands climbing it
    const geo = new THREE.CylinderGeometry(0.22, 0.5, 1, 16, 1, true)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying vec3 vWorld; varying vec3 vN; varying float vY;
        void main() { vY = position.y; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorld; varying vec3 vN; varying float vY;
        void main() {
          vec3 v = normalize(cameraPosition - vWorld);
          float edge = pow(1.0 - abs(dot(normalize(vN), v)), 1.5);
          float bands = pow(fract(vWorld.y * 0.6 - uTime * 1.2), 6.0);
          float k = (0.25 + edge * 0.7 + bands * 0.6) * (0.55 + 0.45 * vY);
          gl_FragColor = vec4(vec3(0.25, 0.85, 1.4) * k * 0.55, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const beams = new THREE.InstancedMesh(geo, mat, n)
    // the emitter on the deck: a ring of light
    const ringGeo = new THREE.RingGeometry(0.42, 0.62, 24)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.5, 2.2) })
    const rings = new THREE.InstancedMesh(ringGeo, ringMat, n)
    const m = new THREE.Matrix4()
    spots.forEach(([x, y, z], i) => {
      m.makeScale(1, y, 1).setPosition(x, 0, z); beams.setMatrixAt(i, m)
      m.makeTranslation(x, 0.02, z); rings.setMatrixAt(i, m)
    })
    beams.count = rings.count = spots.length
    beams.name = 'beams of light'
    rings.name = 'emitters'
    group.add(beams, rings)
    return group
  }

  // ------------------------------------------------------------ shuttles on their orbits
  makeTraffic() {
    const n = 120
    const geo = new THREE.PlaneGeometry(1, 1)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        attribute vec4 aLane;       // radius, tilt, speed (rad/s, signed), phase
        uniform float uTime;
        varying vec3 vColor; varying vec2 vUv; varying vec3 vWorld;
        void main() {
          float a = aLane.w + uTime * aLane.z;
          float ct = cos(aLane.y), st = sin(aLane.y);
          vec3 c = vec3(cos(a) * aLane.x, sin(a) * aLane.x * st + 8.0, sin(a) * aLane.x * ct * 1.15);
          vec3 dir = normalize(vec3(-sin(a), cos(a) * st, cos(a) * ct * 1.15) * sign(aLane.z));
          vec3 toCam = normalize(cameraPosition - c);
          vec3 side = normalize(cross(dir, toCam));
          vec3 p = c + dir * position.x * 5.0 + side * position.y * 0.22;
          vUv = uv; vWorld = p;
          vColor = fract(aLane.w * 3.7) < 0.5 ? vec3(0.4, 1.0, 1.6) : vec3(1.5, 0.5, 1.4);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: fogChunk + /* glsl */`
        varying vec3 vColor; varying vec2 vUv; varying vec3 vWorld;
        void main() {
          float k = smoothstep(0.5, 0.0, abs(vUv.y - 0.5)) * pow(vUv.x, 2.5);
          gl_FragColor = vec4(applyFog(vColor * k, vWorld), 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, n)
    const lane = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const r = 40 + this.random() * 140
      lane.set([r, (this.random() - 0.5) * 0.9, (this.random() < 0.5 ? -1 : 1) * (12 + this.random() * 10) / r, this.random() * 6.283], i * 4)
    }
    geo.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 4))
    mesh.frustumCulled = false
    mesh.name = 'traffic'
    return mesh
  }

  // ------------------------------------------------------------ the ringed giant, two moons, the station ring
  makeBeams() {
    const group = new THREE.Group()
    group.name = 'worlds'
    this.beams = []
    const lit = /* glsl */`
      varying vec3 vN; varying vec3 vP; varying vec3 vWorld;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`
    // the gas giant: bands stirred by noise, lit from the sun, a thin atmosphere at its rim
    const giant = new THREE.Mesh(new THREE.SphereGeometry(110, 64, 32), new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: lit,
      fragmentShader: NOISE + /* glsl */`
        uniform float uTime;
        varying vec3 vN; varying vec3 vP; varying vec3 vWorld;
        void main() {
          vec3 p = normalize(vP);
          float t = p.y * 9.0 + fbm(p * 3.0 + vec3(uTime * 0.004, 0.0, 0.0), 4) * 2.2;
          vec3 a = vec3(0.2, 0.45, 0.6), b = vec3(0.55, 0.3, 0.6), c = vec3(0.85, 0.75, 0.6);
          vec3 col = mix(mix(a, b, 0.5 + 0.5 * sin(t)), c, smoothstep(0.6, 1.0, sin(t * 2.3 + 1.0)) * 0.5);
          float sun = dot(normalize(vN), ${SUN_GLSL});
          col *= smoothstep(-0.15, 0.6, sun) * 1.1 + 0.02;
          vec3 v = normalize(cameraPosition - vWorld);
          col += vec3(0.3, 0.6, 1.0) * pow(1.0 - max(dot(normalize(vN), v), 0.0), 4.0) * smoothstep(-0.3, 0.5, sun) * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }))
    giant.position.set(-260, 70, -470)
    giant.rotation.z = 0.35
    giant.name = 'giant'
    group.add(giant)
    // its rings: bands of dust, lit on the sunny side
    const ringGeo = new THREE.RingGeometry(150, 250, 128, 1)
    const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */`varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vP;
        float h(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
        void main() {
          float r = (length(vP.xy) - 150.0) / 100.0;
          float i = floor(r * 60.0);
          float k = mix(h(i), h(i + 1.0), fract(r * 60.0)) * smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r);
          k *= 0.6 + 0.4 * step(0.18, abs(r - 0.55));
          gl_FragColor = vec4(vec3(0.85, 0.78, 0.7) * k * 0.55, 1.0);
        }`,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }))
    ring.position.copy(giant.position)
    ring.rotation.set(Math.PI / 2 - 0.25, 0.1, 0.35)
    ring.name = 'rings'
    group.add(ring)
    // two moons, cratered grey and icy blue
    const moonMat = tint => new THREE.ShaderMaterial({
      uniforms: { uTint: { value: tint } },
      vertexShader: lit,
      fragmentShader: NOISE + /* glsl */`
        uniform vec3 uTint;
        varying vec3 vN; varying vec3 vP; varying vec3 vWorld;
        void main() {
          vec3 p = normalize(vP);
          float cr = smoothstep(0.55, 0.62, fbm(p * 5.0, 4)) * 0.35;
          vec3 col = uTint * (0.75 + 0.5 * fbm(p * 12.0, 3) - cr);
          col *= max(dot(normalize(vN), ${SUN_GLSL}), 0.0) * 1.2 + 0.015;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    const moon1 = new THREE.Mesh(new THREE.SphereGeometry(26, 40, 20), moonMat(new THREE.Color(0.5, 0.48, 0.46)))
    moon1.position.set(280, 120, -330)
    const moon2 = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 16), moonMat(new THREE.Color(0.45, 0.6, 0.75)))
    moon2.position.set(330, 40, 210)
    group.add(moon1, moon2)
    // the station ring round the arena: where the crowd watches from, windows lit, beacons blinking
    const station = new THREE.Mesh(new THREE.TorusGeometry(95, 2.4, 10, 200), new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vWorld; varying vec2 vUv;
        void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: fogChunk + /* glsl */`
        uniform float uTime;
        varying vec3 vN; varying vec3 vWorld; varying vec2 vUv;
        void main() {
          vec3 n = normalize(vN);
          vec3 col = vec3(0.06, 0.065, 0.09) * (0.3 + max(dot(n, ${SUN_GLSL}), 0.0));
          float around = vUv.x * 600.0;
          float win = step(0.45, fract(around)) * smoothstep(0.08, 0.0, abs(vUv.y - 0.5) - 0.06);
          col += vec3(1.0, 0.85, 0.55) * win * step(0.35, hash11(floor(around))) * 0.6;
          col += vec3(0.2, 1.0, 1.7) * smoothstep(0.03, 0.0, abs(vUv.y - 0.25)) * 0.8;
          float beacon = step(0.995, fract(vUv.x * 24.0)) * step(0.5, fract(uTime * 0.8 + floor(vUv.x * 24.0) * 0.37));
          col += vec3(2.0, 0.3, 0.4) * beacon;
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
    }))
    station.rotation.x = Math.PI / 2 + 0.08
    station.position.y = 6
    station.name = 'station'
    this.station = station
    group.add(station)
    return group
  }

  animate(time) {
    if (this.station) this.station.rotation.z = time * 0.01
  }
}
