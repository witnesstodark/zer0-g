// THE DESERT round the track, drawn like a hand-inked racing anime: a hot sky from teal down to orange with a
// huge low sun, dunes and mesas in flat bands of colour with thick black ink round them, a rough grandstand
// full of flags, rock stacks under the track, hazard-striped pylons, roadside billboards, dust blowing across
// and heat shimmering on the horizon. All of it generated, cel-shaded: no files.

import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { fogChunk, shared } from './look.js'
import { City } from './city.js'
import { jumbotron, ribbon } from './boards.js'
import { standRuns, crowdSeats, wallPaths, placeScreens, placeLogo } from './clearance.js'

// the sun, low in the west (the scene's light comes from there too: LOOKS.desert.sunAt)
const SUN = new THREE.Vector3(60, 24, -75).normalize()
const SUN_GLSL = `vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)})`
const INK = new THREE.Color(0.03, 0.012, 0.01)

// the colours below are written as they look on screen (sRGB): toLin turns them into the renderer's linear light
const LIN = /* glsl */`
vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
`

// flat bands of light: shadow, mid, lit (the anime look)
const CEL = LIN + /* glsl */`
vec3 cel(vec3 n, vec3 shadow, vec3 mid, vec3 lit) {
  float l = dot(n, ${SUN_GLSL});
  return l > 0.42 ? lit : (l > -0.05 ? mid : shadow);
}
`

/**
 * Ink round a mesh: a copy of it drawn from inside, its surface pushed out along smooth normals by a width that
 * grows with the distance (so the line keeps about the same thickness on screen). Works on instanced meshes.
 */
function inked(mesh, px = 0.0045, min = 0.03) {
  const geo = mergeVertices(mesh.geometry.clone().deleteAttribute('uv').deleteAttribute('normal'), 1e-3)
  geo.computeVertexNormals()
  for (const [k, a] of Object.entries(mesh.geometry.attributes)) if (a.isInstancedBufferAttribute) geo.setAttribute(k, a)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: px }, uMin: { value: min }, uInk: { value: INK } },
    vertexShader: /* glsl */`
      uniform float uPx, uMin;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
        m = m * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vec3 n = normalize(mat3(m) * normal);
        float d = length(cameraPosition - w.xyz);
        w.xyz += n * max(uMin, d * uPx);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uInk;
      void main() { gl_FragColor = vec4(uInk, 1.0); }`,
    side: THREE.BackSide,
  })
  const ink = mesh.isInstancedMesh ? new THREE.InstancedMesh(geo, mat, mesh.count) : new THREE.Mesh(geo, mat)
  if (mesh.isInstancedMesh) { ink.instanceMatrix = mesh.instanceMatrix; ink.count = mesh.count }
  ink.position.copy(mesh.position); ink.rotation.copy(mesh.rotation); ink.scale.copy(mesh.scale)
  ink.frustumCulled = mesh.frustumCulled
  ink.name = `${mesh.name} ink`
  return ink
}

/** A cel-shaded material: the world position and normal (instanced or not), three bands, fog. */
function celMaterial(body, uniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, ...uniforms },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
        m = m * instanceMatrix;
        #endif
        vLocal = position;
        vec4 w = m * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: fogChunk + CEL + /* glsl */`
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
      ${body}`,
  })
}

export class Desert extends City {
  update(dt, camera) {
    this.sky.position.copy(camera.position)
  }

  // ------------------------------------------------------------ the sky: teal to orange, the sun, far mesas
  makeSky() {
    const geo = new THREE.SphereGeometry(400, 48, 24)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: LIN + /* glsl */`
        uniform float uTime;
        uniform vec3 uFogColor;
        varying vec3 vDir;
        float h(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
        void main() {
          vec3 d = normalize(vDir);
          float az = atan(d.z, d.x);
          // heat shimmer: the horizon wavers
          float el = d.y + sin(az * 60.0 + uTime * 4.0) * 0.0012 * exp(-max(d.y, 0.0) * 40.0);
          // flat bands, like painted cels: deep teal overhead, turquoise, pale gold, burning orange at the horizon
          vec3 col = vec3(0.0, 0.42, 0.47);
          col = mix(col, vec3(0.16, 0.66, 0.64), step(el, 0.4));
          col = mix(col, vec3(1.0, 0.86, 0.56), step(el, 0.19));
          col = mix(col, vec3(1.0, 0.6, 0.25), step(el, 0.085));
          // the sun: huge and low, a white core, an orange ring, inked round
          vec3 s = ${SUN_GLSL};
          float sd = acos(clamp(dot(d, s), -1.0, 1.0));
          col = mix(col, vec3(1.0, 0.62, 0.25), step(sd, 0.2));
          col = mix(col, vec3(1.0, 0.95, 0.75), step(sd, 0.165));
          col = mix(col, vec3(0.06, 0.02, 0.02), smoothstep(0.004, 0.0, abs(sd - 0.2)));
          // speed streaks across the sky, the way the old cels drew wind
          float streak = step(0.985, h(floor(el * 260.0) + 3.0)) * step(0.5, fract(az * 3.0 + uTime * 0.05 + h(floor(el * 260.0))));
          col = mix(col, vec3(1.0, 0.95, 0.85), streak * step(0.12, el) * 0.35);
          // the far mesas: flat tops, dark red, an ink line on top
          float x = (az + 3.14159) / 6.28318 * 40.0;
          float id = floor(x), fx = fract(x);
          float top = 0.025 + h(id) * 0.05;
          float shape = step(0.15 + h(id * 2.0) * 0.2, fx) * step(fx, 0.75 + h(id * 3.0) * 0.2) * step(0.45, h(id * 5.0));
          float inMesa = shape * step(el, top);
          // (faded by the distance: a dusty red, lighter towards its foot)
          col = mix(col, mix(vec3(0.78, 0.42, 0.34), vec3(0.6, 0.27, 0.24), clamp(el / max(top, 0.001), 0.0, 1.0)), inMesa);
          col = mix(col, vec3(0.06, 0.02, 0.02), shape * smoothstep(0.0025, 0.0, abs(el - top)));
          col = toLin(col);
          // the haze at the horizon (the fog's colour, so the far sand meets the sky)
          col = mix(col, uFogColor, smoothstep(0.045, 0.0, el) * (1.0 - inMesa));
          if (el < 0.0) col = uFogColor;
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

  // ------------------------------------------------------------ the ground: sand, ripples, the arena's pad, dunes
  makeGround() {
    const group = new THREE.Group()
    group.name = 'ground'
    const L = this.lot
    const flat = new THREE.PlaneGeometry(900, 900, 1, 1)
    flat.rotateX(-Math.PI / 2)
    const sand = new THREE.Mesh(flat, celMaterial(/* glsl */`
      uniform vec2 uHalf;
      void main() {
        vec2 p = vWorld.xz;
        // ripples: flat bands of two sand tones
        float rip = sin(p.x * 0.9 + sin(p.y * 0.25) * 2.0 + p.y * 0.35);
        vec3 col = rip > 0.55 ? vec3(0.95, 0.62, 0.32) : vec3(0.86, 0.5, 0.26);
        // the arena's pad: packed earth, tyre tracks, an inked edge
        vec2 e = abs(p) - uHalf;
        float inPad = step(max(e.x, e.y), 0.0);
        vec3 pad = vec3(0.6, 0.3, 0.17);
        pad = mix(pad, vec3(0.45, 0.2, 0.12), step(0.8, fract(p.x * 0.35 + sin(p.y * 0.2) * 0.3)) * 0.6);
        col = mix(col, pad, inPad);
        col = mix(col, vec3(0.05, 0.02, 0.01), smoothstep(0.12, 0.0, abs(max(e.x, e.y))));
        // a mirage near the horizon: the sky's colour shimmering on the sand
        float dist = length(vWorld - cameraPosition);
        float mir = smoothstep(180.0, 380.0, dist) * (0.6 + 0.4 * sin(p.x * 0.05 + uTime * 2.0));
        col = mix(col, vec3(1.0, 0.7, 0.4), mir * 0.5);
        gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
      }`, { uHalf: { value: new THREE.Vector2(L.width / 2 + 1, L.depth / 2 + 1) } }))
    sand.name = 'sand'
    group.add(sand)

    // the dunes: a wide ring of ground lifted into crests by two crossing skewed waves (a gentle side to the
    // wind, a steep one away from it), higher farther out
    const ring = new THREE.RingGeometry(46, 440, 200, 48)
    ring.rotateX(-Math.PI / 2)
    const dune = /* glsl */`
      float ridge(float ph) { return 0.5 + 0.5 * sin(ph + 0.65 * sin(ph)); }
      float duneH(vec2 p) {
        float r = length(p);
        float k = smoothstep(46.0, 120.0, r) * (0.6 + r * 0.004);
        float a = ridge(dot(p, vec2(0.028, 0.012)) + sin(p.y * 0.009) * 2.0);
        float b = ridge(dot(p, vec2(-0.011, 0.024)) + 1.3 + sin(p.x * 0.013));
        return k * (a * a * 9.0 + b * b * 5.0);
      }`
    const duneMat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: dune + /* glsl */`
        varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          vec3 p = position;
          float e = 1.5;
          float h0 = duneH(p.xz), hx = duneH(p.xz + vec2(e, 0.0)), hz = duneH(p.xz + vec2(0.0, e));
          p.y = h0 - 0.3;
          vNormal = normalize(vec3(h0 - hx, e, h0 - hz));
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: fogChunk + CEL + /* glsl */`
        varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 col = cel(n, vec3(0.55, 0.22, 0.2), vec3(0.88, 0.5, 0.26), vec3(1.0, 0.72, 0.4));
          // ink on the crests seen edge-on
          vec3 v = normalize(cameraPosition - vWorld);
          col = mix(col, vec3(0.05, 0.02, 0.01), smoothstep(0.22, 0.12, abs(dot(n, v))));
          gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
        }`,
    })
    const dunes = new THREE.Mesh(ring, duneMat)
    dunes.name = 'dunes'
    dunes.frustumCulled = false
    group.add(dunes)
    return group
  }

  // ------------------------------------------------------------ rock stacks under the track, the mesas
  makeBuildings() {
    const group = new THREE.Group()
    group.name = 'buildings'
    const rnd = this.random, L = this.lot
    // under and between the track's parts: stacked slabs of red rock
    const stacks = []
    for (let x = -L.width / 2 + 3; x < L.width / 2 - 3; x += 2.7) {
      for (let z = -L.depth / 2 + 3; z < L.depth / 2 - 3; z += 2.7) {
        const cx = x + (rnd() - 0.5) * 0.8, cz = z + (rnd() - 0.5) * 0.8
        if (Math.abs(cx) > 10.8 || rnd() < 0.3) continue
        const w = 0.9 + rnd() * 1.0, d = 0.9 + rnd() * 1.0
        const room = this.roomUnder(cx, cz, Math.max(w, d) / 2)
        if (room < 1.2) continue
        stacks.push([cx, cz, w, Math.min(room, 1.5 + Math.pow(rnd(), 1.6) * 11), d, rnd() * Math.PI])
        const r = Math.max(w, d) * 0.62
        this.solid(cx - r, cx + r, stacks[stacks.length - 1][3], cz - r, cz + r)
      }
    }
    const geo = new THREE.CylinderGeometry(0.5, 0.62, 1, 6, 4)
    geo.translate(0, 0.5, 0)
    const rockBody = /* glsl */`
      void main() {
        vec3 n = normalize(vNormal);
        // strata: bands of red and orange up the rock
        float band = floor(vWorld.y * 1.3);
        vec3 lit = mod(band, 2.0) < 1.0 ? vec3(0.95, 0.42, 0.22) : vec3(0.85, 0.32, 0.18);
        vec3 col = cel(n, vec3(0.32, 0.1, 0.14), lit * 0.78, lit);
        if (n.y > 0.7) col = cel(n, vec3(0.4, 0.15, 0.15), vec3(0.9, 0.55, 0.3), vec3(1.0, 0.7, 0.42));
        gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
      }`
    const rocks = new THREE.InstancedMesh(geo, celMaterial(rockBody), Math.max(1, stacks.length))
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
    stacks.forEach(([x, z, w, h, d, a], i) => { q.setFromAxisAngle(up, a); m.compose(new THREE.Vector3(x, 0, z), q, s.set(w, h, d)); rocks.setMatrixAt(i, m) })
    rocks.count = stacks.length
    rocks.name = 'rock stacks'
    group.add(rocks, inked(rocks, 0.0045, 0.03))
    this.blockCount = stacks.length

    // the mesas out in the desert: flat-topped, banded, in clusters
    const mesas = []
    for (let c = 0; c < 9; c++) {
      const a = rnd() * Math.PI * 2, r = 95 + rnd() * 230
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r
      const k = 1 + Math.floor(rnd() * 3)
      for (let j = 0; j < k; j++) {
        const w = 12 + rnd() * 26, h = 14 + rnd() * 42
        mesas.push([cx + (rnd() - 0.5) * 50, cz + (rnd() - 0.5) * 50, w, h, w * (0.6 + rnd() * 0.6), rnd() * Math.PI])
      }
    }
    const mgeo = new THREE.CylinderGeometry(0.46, 0.56, 1, 7, 5)
    mgeo.translate(0, 0.5, 0)
    const mesaMesh = new THREE.InstancedMesh(mgeo, celMaterial(rockBody.replace('vWorld.y * 1.3', 'vWorld.y * 0.18')), mesas.length)
    mesas.forEach(([x, z, w, h, d, a], i) => { q.setFromAxisAngle(up, a); m.compose(new THREE.Vector3(x, -1, z), q, s.set(w, h, d)); mesaMesh.setMatrixAt(i, m) })
    mesaMesh.name = 'mesas'
    mesaMesh.frustumCulled = false
    group.add(mesaMesh, inked(mesaMesh, 0.004, 0.3))
    return group
  }

  // ------------------------------------------------------------ the arena: a rough grandstand, flags, the frame, screens
  makeArena(pictures) {
    const L = this.lot
    const group = new THREE.Group()
    group.name = 'arena'
    // the stands: plank tiers along both long sides, painted teal with orange noses, inked; cut back where the course
    // runs through them
    const stands = standRuns(this.clear)
    this.stands = stands
    for (const t of stands.tiers) this.solid(t.x - 0.375, t.x + 0.375, t.h, t.z0, t.z1)
    const tierGeo = new THREE.BoxGeometry(0.75, 1, 1)
    tierGeo.translate(0, 0.5, 0)
    const tierMesh = new THREE.InstancedMesh(tierGeo, celMaterial(/* glsl */`
      void main() {
        vec3 n = normalize(vNormal);
        vec3 col = n.y > 0.5 ? vec3(0.95, 0.45, 0.18) : cel(n, vec3(0.06, 0.34, 0.4), vec3(0.1, 0.5, 0.54), vec3(0.2, 0.68, 0.66));
        // planks
        col *= 0.88 + 0.12 * step(0.5, fract(vWorld.z * 0.8));
        gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
      }`), Math.max(1, stands.tiers.length))
    tierMesh.count = stands.tiers.length
    const m = new THREE.Matrix4()
    stands.tiers.forEach((t, i) => { m.makeScale(1, t.h, t.z1 - t.z0).setPosition(t.x, 0, (t.z0 + t.z1) / 2); tierMesh.setMatrixAt(i, m) })
    tierMesh.name = 'stands'
    group.add(tierMesh, inked(tierMesh, 0.0035, 0.025))

    // the crowd: flags and arms in bold colours, waving
    const n = 2400
    const crowdGeo = new THREE.PlaneGeometry(0.13, 0.2)
    const crowdMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uCheer: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec4 aSeat;
        uniform float uTime, uCheer;
        varying vec3 vColor; varying vec3 vWorld; varying vec2 vUv;
        void main() {
          float ph = aSeat.w * 6.2831;
          float wave = sin(uTime * (3.0 + uCheer * 5.0) + ph) * (0.03 + uCheer * 0.05);
          vec3 base = aSeat.xyz + vec3(0.0, wave + 0.05, 0.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 p = base + right * position.x * (1.0 + 0.4 * sin(uTime * 6.0 + ph)) + vec3(0.0, position.y, 0.0);
          vWorld = p; vUv = uv;
          float c = fract(aSeat.w * 7.0);
          vColor = c < 0.25 ? vec3(1.0, 0.25, 0.15) : (c < 0.5 ? vec3(0.1, 0.75, 0.75) : (c < 0.75 ? vec3(1.0, 0.85, 0.2) : vec3(0.98, 0.95, 0.88)));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: fogChunk + LIN + /* glsl */`
        varying vec3 vColor; varying vec3 vWorld; varying vec2 vUv;
        void main() {
          vec3 c = vColor;
          if (vUv.x < 0.12 || vUv.y > 0.9) c = vec3(0.04, 0.015, 0.01);    // the pole and an inked edge
          gl_FragColor = vec4(applyFog(toLin(c), vWorld), 1.0);
        }`,
      side: THREE.DoubleSide,
    })
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, n)
    const seat = new Float32Array(n * 4)
    const seats = crowdSeats(stands.tiers, n, this.random, { lift: 0.38 })
    crowd.count = seats.length
    seats.forEach((s, i) => seat.set([...s, this.random()], i * 4))
    crowdGeo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seat, 4))
    crowd.frustumCulled = false
    crowd.name = 'crowd'
    this.crowd = crowdMat
    group.add(crowd)

    // the lot's frame: rusty girders with warning lights
    const frameMat = celMaterial(/* glsl */`
      void main() {
        vec3 n = normalize(vNormal);
        vec3 col = cel(n, vec3(0.18, 0.06, 0.05), vec3(0.45, 0.18, 0.1), vec3(0.62, 0.28, 0.14));
        col += vec3(1.6, 0.5, 0.1) * step(0.97, fract(vWorld.x * 0.25 + vWorld.z * 0.25)) * step(0.5, fract(uTime * 1.5));
        gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
      }`)
    const top = L.height - 1.2
    const hw = L.width / 2 - 0.4, hd = L.depth / 2 - 0.4
    for (const y of [top, 0.12]) for (const [x, z, sx, sz] of [[0, -hd, L.width - 0.8, 0.22], [0, hd, L.width - 0.8, 0.22], [-hw, 0, 0.22, L.depth - 0.8], [hw, 0, 0.22, L.depth - 0.8]]) {
      if (this.clear.hits(x - sx / 2, x + sx / 2, y - 0.12, y + 0.12, z - sz / 2, z + sz / 2, 0.3)) continue
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.22, sz), frameMat)
      bar.position.set(x, y, z)
      group.add(bar)
    }
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) {
      if (this.clear.hits(x - 0.14, x + 0.14, 0, top, z - 0.14, z + 0.14, 0.4)) continue
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.28, top, 0.28), frameMat)
      t.position.set(x, top / 2, z)
      group.add(t, inked(t, 0.0035, 0.025))
    }

    // the screens and sponsor ribbons, as round the city's arena
    if (pictures.board) {
      const tex = pictures.board
      placeScreens(this.clear, L, (w, x, y, z, rotY, offset) => {
        const j = jumbotron(tex, w, w * 9 / 16, offset)
        j.position.set(x, y, z)
        j.rotation.y = rotY
        group.add(j)
      }, { sides: [[7, 1, 15, -12, 9.3], [10, -1, 15, 8, 4.1]] })
      const rw = L.width / 2 - 0.35, rd = L.depth / 2 - 0.35
      for (const path of wallPaths(this.clear, [[-rw, -rd], [rw, -rd], [rw, rd], [-rw, rd]], 7.0, 1.2)) group.add(ribbon(tex, path, 7.0, 1.2, { closed: false }))
      for (const f of stands.fronts) group.add(ribbon(tex, f.side > 0 ? [[f.x, f.z0], [f.x, f.z1]] : [[f.x, f.z1], [f.x, f.z0]], 0.1, 0.6, { closed: false }))
    }
    if (pictures.logo) {
      const aspect = pictures.logo.image ? pictures.logo.image.height / pictures.logo.image.width : 0.5625
      const mat = new THREE.MeshBasicMaterial({ map: pictures.logo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      const at = placeLogo(this.clear, L, 10, 10 * aspect)
      if (at) {
        const logo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10 * aspect), mat)
        logo.position.set(...at)
        logo.rotation.y = -Math.PI / 2
        group.add(logo)
      }
    }
    return group
  }

  // ------------------------------------------------------------ pylons: hazard-striped steel, inked
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
    const geo = new THREE.BoxGeometry(0.26, 1, 0.26)
    geo.translate(0, 0.5, 0)
    const mesh = new THREE.InstancedMesh(geo, celMaterial(/* glsl */`
      void main() {
        vec3 n = normalize(vNormal);
        float stripe = step(0.5, fract((vWorld.y + vWorld.x + vWorld.z) * 1.4));
        vec3 lit = mix(vec3(1.0, 0.62, 0.1), vec3(0.08, 0.04, 0.03), stripe);
        vec3 col = cel(n, lit * 0.35, lit * 0.75, lit);
        gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
      }`), Math.max(1, spots.length))
    const m = new THREE.Matrix4()
    spots.forEach(([x, y, z], i) => { m.makeScale(1, y, 1).setPosition(x, 0, z); mesh.setMatrixAt(i, m) })
    mesh.count = spots.length
    mesh.name = 'pylons'
    const group = new THREE.Group()
    group.name = 'pylons'
    group.add(mesh, inked(mesh, 0.0035, 0.025))
    return group
  }

  // ------------------------------------------------------------ dust blowing across
  makeTraffic() {
    const n = 220
    const geo = new THREE.PlaneGeometry(1, 1)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        attribute vec4 aDust;       // x, z, height, seed
        uniform float uTime;
        varying vec2 vUv; varying vec3 vWorld; varying float vA;
        void main() {
          // carried by the wind along x, wrapping round a 360 m square
          float x = mod(aDust.x + uTime * (6.0 + aDust.w * 8.0) + 180.0, 360.0) - 180.0;
          vec3 c = vec3(x, aDust.z + sin(uTime * 0.7 + aDust.w * 9.0) * 0.6, aDust.y);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float w = 6.0 + aDust.w * 10.0;
          vec3 p = c + right * position.x * w + vec3(0.0, position.y * w * 0.12, 0.0);
          vUv = uv; vWorld = p;
          vA = smoothstep(180.0, 120.0, abs(x)) * (0.45 + 0.3 * aDust.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: fogChunk + LIN + /* glsl */`
        varying vec2 vUv; varying vec3 vWorld; varying float vA;
        void main() {
          float k = smoothstep(0.5, 0.15, abs(vUv.y - 0.5)) * smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
          gl_FragColor = vec4(applyFog(toLin(vec3(1.0, 0.86, 0.66)), vWorld), k * vA);
        }`,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, n)
    const dust = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      // round the arena, not through it
      let x, z
      do { x = (this.random() - 0.5) * 360; z = (this.random() - 0.5) * 360 } while (Math.abs(x) < 24 && Math.abs(z) < 30)
      dust.set([x, z, 0.3 + this.random() * 6, this.random()], i * 4)
    }
    geo.setAttribute('aDust', new THREE.InstancedBufferAttribute(dust, 4))
    mesh.frustumCulled = false
    mesh.name = 'traffic'
    return mesh
  }

  // ------------------------------------------------------------ roadside billboards round the arena
  makeBeams() {
    this.beams = []
    const group = new THREE.Group()
    group.name = 'billboards'
    const spots = []
    const L = this.lot
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + 0.2
      const rx = L.width / 2 + 14 + (k % 3) * 9, rz = L.depth / 2 + 14 + (k % 3) * 9
      spots.push([Math.cos(a) * rx, Math.sin(a) * rz, a, k])
    }
    // boards: bold shapes in the palette (circles, chevrons, stripes), inked
    const board = new THREE.BoxGeometry(9, 4, 0.3)
    board.translate(0, 7, 0)
    const boards = new THREE.InstancedMesh(board, celMaterial(/* glsl */`
      void main() {
        vec3 n = normalize(vNormal);
        vec2 uv = vec2(vLocal.x / 9.0 + 0.5, (vLocal.y - 5.0) / 4.0);
        float id = floor(abs(vWorld.x * 0.13 + vWorld.z * 0.07));
        vec3 a = mod(id, 3.0) < 1.0 ? vec3(0.95, 0.25, 0.12) : (mod(id, 3.0) < 2.0 ? vec3(0.1, 0.7, 0.72) : vec3(1.0, 0.82, 0.2));
        vec3 b = vec3(0.98, 0.94, 0.86);
        float shape = mod(id, 2.0) < 1.0 ? step(length(uv - vec2(0.3, 0.5)), 0.32) : step(0.5, fract(uv.x * 3.0 - abs(uv.y - 0.5) * 2.0));
        vec3 col = abs(n.z) > 0.5 ? mix(b, a, shape) : vec3(0.08, 0.04, 0.03);
        col *= dot(n, ${SUN_GLSL}) > -0.05 ? 1.0 : 0.7;
        gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0);
      }`), spots.length)
    const pole = new THREE.BoxGeometry(0.35, 5.2, 0.35)
    pole.translate(0, 2.6, 0)
    const poles = new THREE.InstancedMesh(pole, celMaterial(/* glsl */`
      void main() { vec3 col = cel(normalize(vNormal), vec3(0.1, 0.04, 0.03), vec3(0.3, 0.12, 0.08), vec3(0.45, 0.2, 0.12)); gl_FragColor = vec4(applyFog(toLin(col), vWorld), 1.0); }`), spots.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    spots.forEach(([x, z, a], i) => {
      q.setFromAxisAngle(up, -a + Math.PI / 2)     // facing the arena
      m.compose(new THREE.Vector3(x, 0, z), q, one)
      boards.setMatrixAt(i, m)
      poles.setMatrixAt(i, m)
    })
    boards.name = 'billboards'
    poles.name = 'billboard poles'
    group.add(boards, inked(boards, 0.004, 0.06), poles, inked(poles, 0.004, 0.05))
    return group
  }

  animate() {}
}
