// NEON CITY round the track: the night sky with the far skyline, the glowing street grid, the towers of
// the city round the arena and the blocks under the track, the arena itself (stands full of glow sticks,
// a ring of light at the top, LED jumbotrons and sponsor ribbons), the pylons that hold the track up, searchlights and
// flying traffic. Almost all of it is a handful of instanced meshes with small shaders.

import * as THREE from 'three'
import { fogChunk, shared } from './look.js'
import { jumbotron, ribbon } from './boards.js'

export class City {
  constructor(lot, track, pictures, random) {
    this.lot = lot
    this.track = track
    this.random = random
    this.group = new THREE.Group()
    this.group.name = 'city'
    this.sky = this.makeSky()
    this.group.add(this.sky)
    this.group.add(this.makeGround())
    this.group.add(this.makeBuildings())
    this.group.add(this.makeArena(pictures))
    this.group.add(this.makePylons())
    this.group.add(this.makeTraffic())
    this.group.add(this.makeBeams())
  }

  update(dt, camera) {
    this.sky.position.copy(camera.position)
  }

  // ------------------------------------------------------------ sky and skyline
  makeSky() {
    const geo = new THREE.SphereGeometry(400, 48, 24)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uFogColor;
        varying vec3 vDir;
        float h(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
        void main() {
          vec3 d = normalize(vDir);
          float el = d.y;
          float az = atan(d.z, d.x);
          // the sky: violet at the horizon to deep blue overhead
          vec3 col = mix(vec3(0.26, 0.05, 0.3), vec3(0.01, 0.012, 0.05), smoothstep(-0.02, 0.45, el));
          col += vec3(0.5, 0.08, 0.35) * exp(-abs(el - 0.02) * 18.0) * 0.6;
          // stars
          vec2 sp = vec2(az * 60.0, el * 60.0);
          vec3 s3 = fract(vec3(floor(sp).xyx) * 0.1031); s3 += dot(s3, s3.yzx + 33.33);
          float st = step(0.996, fract((s3.x + s3.y) * s3.z));
          col += vec3(0.8) * st * smoothstep(0.15, 0.5, el) * (0.6 + 0.4 * sin(uTime * 2.0 + sp.x));
          // two rows of skyline: towers by azimuth, with lit windows and neon crowns
          for (int row = 0; row < 2; row++) {
            float n = row == 0 ? 160.0 : 90.0;
            float x = (az + 3.14159) / 6.28318 * n;
            float id = floor(x) + float(row) * 1000.0;
            float top = (row == 0 ? 0.05 : 0.11) + pow(h(id), 3.0) * (row == 0 ? 0.12 : 0.22);
            float fx = fract(x);
            float inB = step(0.08, fx) * step(fx, 0.92) * step(el, top);
            if (inB > 0.5) {
              vec3 b = row == 0 ? vec3(0.05, 0.03, 0.1) : vec3(0.015, 0.012, 0.035);
              vec2 w = vec2(fx * 8.0, el * (row == 0 ? 160.0 : 110.0));
              float lit = step(0.62, h(floor(w.x) * 13.0 + floor(w.y) * 7.0 + id));
              float win = step(0.25, fract(w.x)) * step(0.3, fract(w.y));
              vec3 wc = mix(vec3(1.0, 0.7, 0.4), vec3(0.3, 0.8, 1.0), h(id * 3.1));
              b += wc * lit * win * (row == 0 ? 0.35 : 0.6);
              float crown = smoothstep(0.004, 0.0, abs(el - top + 0.003)) * step(0.55, h(id * 7.7));
              b += mix(vec3(1.4, 0.2, 1.1), vec3(0.2, 1.1, 1.5), h(id * 5.3)) * crown;
              col = b;
            }
          }
          // the haze over the city
          col = mix(col, uFogColor * 1.6 + vec3(0.06, 0.0, 0.05), exp(-max(el, 0.0) * 30.0) * 0.35);
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

  // ------------------------------------------------------------ the ground: a glowing street grid
  makeGround() {
    const geo = new THREE.PlaneGeometry(700, 700, 1, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uHalf: { value: new THREE.Vector2(this.lot.width / 2, this.lot.depth / 2) } },
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: fogChunk + /* glsl */`
        uniform float uTime;
        uniform vec2 uHalf;
        varying vec3 vWorld;
        float line(float x, float w) { float d = fwidth(x); return 1.0 - smoothstep(w, w + d * 1.5, abs(fract(x) - 0.5) * 2.0 - 0.0); }
        void main() {
          vec2 p = vWorld.xz;
          vec3 col = vec3(0.012, 0.012, 0.03);
          // streets every 12 m outside the arena, a fine 2 m grid inside it
          float inArena = step(abs(p.x), uHalf.x) * step(abs(p.y), uHalf.y);
          vec2 q = p / (inArena > 0.5 ? 0.67 : 12.0);
          vec2 fw = fwidth(q);
          float fade = clamp(1.0 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
          float g = max(line(q.x, 0.04), line(q.y, 0.04)) * fade;
          col += (inArena > 0.5 ? vec3(0.1, 0.5, 1.0) * 0.5 : vec3(0.5, 0.1, 0.7) * 0.6) * g;
          // light running along the streets
          float run = pow(0.5 + 0.5 * sin((p.x + p.y) * 0.15 - uTime * 3.0), 12.0);
          col += vec3(0.2, 0.7, 1.2) * run * g * (1.0 - inArena) * 0.6;
          // the arena's edge, a bright line
          vec2 e = abs(p) - uHalf;
          float edge = smoothstep(0.12, 0.0, abs(max(e.x, e.y)));
          col += vec3(0.2, 1.0, 1.6) * edge;
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
      extensions: { derivatives: true },
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'ground'
    return mesh
  }

  // ------------------------------------------------------------ buildings
  /** How tall a block at (x, z) with this half-size may be without touching the track (or 0). */
  roomUnder(x, z, half) {
    const t = this.track
    let top = 60
    const reach = t.width / 2 + 1.4 + half
    for (let i = 0; i < t.n; i += 2) {
      const px = t.P[i * 3], py = t.P[i * 3 + 1], pz = t.P[i * 3 + 2]
      const d = Math.hypot(px - x, pz - z)
      if (d < reach) top = Math.min(top, py - 3.2)
      else if (d < reach + 1.5) top = Math.min(top, py + 6)   // right beside the road: not a wall over it
    }
    return top
  }

  makeBuildings() {
    const rnd = this.random
    const L = this.lot
    const blocks = []
    // inside the arena: blocks under and between the track's parts
    for (let x = -L.width / 2 + 3; x < L.width / 2 - 3; x += 2.6) {
      for (let z = -L.depth / 2 + 3; z < L.depth / 2 - 3; z += 2.6) {
        const cx = x + (rnd() - 0.5) * 0.8, cz = z + (rnd() - 0.5) * 0.8
        if (Math.abs(cx) > 10.8) continue       // the stands are there
        const w = 1.0 + rnd() * 1.1, d = 1.0 + rnd() * 1.1
        const room = this.roomUnder(cx, cz, Math.max(w, d) / 2)
        if (room < 1.2) continue
        const h = Math.min(room, 2 + Math.pow(rnd(), 1.6) * 16)
        blocks.push([cx, cz, w, h, d])
      }
    }
    // the city round the arena: towers on a grid of 14 m plots with streets between them, no two
    // overlapping (overlapping walls fought in the depth buffer), taller farther out
    const PLOT = 14
    for (let gx = -11; gx <= 11; gx++) {
      for (let gz = -11; gz <= 11; gz++) {
        const x = gx * PLOT, z = gz * PLOT
        const r = Math.hypot(x, z)
        if (Math.abs(x) < L.width / 2 + 8 && Math.abs(z) < L.depth / 2 + 8) continue
        if (r > 160 || rnd() < 0.25) continue
        const w = 5 + rnd() * 6.5, d = 5 + rnd() * 6.5
        const h = 8 + Math.pow(rnd(), 1.5) * (20 + r * 0.5)
        blocks.push([x + (rnd() - 0.5) * (PLOT - 1 - w), z + (rnd() - 0.5) * (PLOT - 1 - d), w, h, d])
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        attribute vec3 aSize;
        attribute float aSeed;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vLocal;
        varying vec3 vSize;
        varying float vSeed;
        void main() {
          vSize = aSize;
          vSeed = aSeed;
          vLocal = position * aSize;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vNormal = normal;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: fogChunk + /* glsl */`
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vLocal;
        varying vec3 vSize;
        varying float vSeed;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 col = vec3(0.025, 0.022, 0.05);
          vec3 accent = hash11(vSeed) < 0.5 ? vec3(0.2, 1.0, 1.6) : (hash11(vSeed * 3.0) < 0.5 ? vec3(1.6, 0.2, 1.2) : vec3(1.6, 0.8, 0.2));
          float big = step(30.0, length(vWorld.xz));
          if (abs(n.y) < 0.5) {
            // windows: a grid on the walls, some lit
            float along = abs(n.x) > 0.5 ? vLocal.z : vLocal.x;
            float cellW = 0.15 + big * 0.5;
            vec2 w = vec2(along / cellW, vLocal.y / (0.185 + big * 0.55));
            // how many windows a pixel covers, from the distance and the angle: smooth from pixel to pixel
            // (a fade by fwidth jumps between 2x2 pixel blocks, and the windows crawled like sand)
            vec3 toCam = cameraPosition - vWorld;
            float dist = length(toCam);
            float facing = max(abs(dot(n, toCam / dist)), 0.12);
            float fade = clamp(1.6 - dist * 0.0013 / facing / cellW * 2.5, 0.0, 1.0);
            vec2 cell = floor(w);
            float lit = step(0.55, hash21(cell + mod(vSeed * 17.0, 97.0)));
            float win = step(0.22, fract(w.x)) * step(0.3, fract(w.y)) * step(0.5, vLocal.y);
            vec3 wc = mix(vec3(1.0, 0.75, 0.45), vec3(0.4, 0.85, 1.0), hash21(cell * 1.3 + mod(vSeed, 53.0)));
            col += wc * mix(0.45 * 0.25, lit * win, fade) * 0.55;
            // a neon stripe up one corner and under the roof
            float edgeX = abs(along) / (abs(n.x) > 0.5 ? vSize.z : vSize.x) * 2.0;
            col += accent * smoothstep(0.9, 0.96, edgeX) * step(0.4, hash11(vSeed * 5.0)) * 0.9 * fade;
            col += accent * smoothstep(0.15, 0.0, vSize.y - vLocal.y) * 0.8;
          } else if (n.y > 0.5) {
            // roofs: dark, a neon frame
            vec2 r = abs(vLocal.xz) / (vSize.xz * 0.5);
            col += accent * smoothstep(0.86, 0.95, max(r.x, r.y)) * 0.9;
          }
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
      extensions: { derivatives: true },
    })
    const mesh = new THREE.InstancedMesh(geo, mat, blocks.length)
    const size = new Float32Array(blocks.length * 3), seed = new Float32Array(blocks.length)
    const m = new THREE.Matrix4()
    blocks.forEach(([x, z, w, h, d], i) => {
      m.makeScale(w, h, d).setPosition(x, 0, z)
      mesh.setMatrixAt(i, m)
      size.set([w, h, d], i * 3)
      seed[i] = i * 0.618 + 0.1
    })
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3))
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
    mesh.name = 'buildings'
    mesh.frustumCulled = false
    this.blockCount = blocks.length
    return mesh
  }

  // ------------------------------------------------------------ the arena
  makeArena(pictures) {
    const L = this.lot
    const group = new THREE.Group()
    group.name = 'arena'
    // stands along both long sides: tiers rising outwards
    const tiers = []
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const x = side * (11.6 + k * 0.7)
        tiers.push([x, -17.5, 0.75, 0.8 + k * 1.1, 35])
      }
    }
    const tierGeo = new THREE.BoxGeometry(1, 1, 1)
    tierGeo.translate(0, 0.5, 0)
    const tierMat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying vec3 vWorld; varying vec3 vNormal;
        void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWorld = w.xyz; vNormal = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: fogChunk + /* glsl */`
        varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          vec3 col = vec3(0.03, 0.03, 0.06);
          // a light strip on each step's nose
          col += vec3(0.8, 0.15, 1.2) * smoothstep(0.06, 0.0, abs(fract(vWorld.y + 0.0) - 0.0)) * step(0.5, vNormal.y);
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }`,
    })
    const tierMesh = new THREE.InstancedMesh(tierGeo, tierMat, tiers.length)
    const m = new THREE.Matrix4()
    tiers.forEach(([x, z, w, h, d], i) => { m.makeScale(w, h, d).setPosition(x, 0, z + d / 2); tierMesh.setMatrixAt(i, m) })
    group.add(tierMesh)

    // the crowd: glow sticks waving on the tiers
    const n = 2400
    const crowdGeo = new THREE.PlaneGeometry(0.035, 0.08)
    const crowdMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uCheer: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec4 aSeat;
        uniform float uTime, uCheer;
        varying vec3 vColor;
        varying vec3 vWorld;
        void main() {
          float ph = aSeat.w * 6.2831;
          float wave = sin(uTime * (3.0 + uCheer * 4.0) + ph) * (0.03 + uCheer * 0.04);
          vec3 base = aSeat.xyz + vec3(0.0, wave + uCheer * 0.05 * max(0.0, sin(uTime * 9.0 + ph)), 0.0);
          // face the camera
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 p = base + right * position.x + up * position.y;
          vWorld = p;
          float c = fract(aSeat.w * 7.0);
          vColor = c < 0.33 ? vec3(0.2, 1.2, 1.8) : (c < 0.66 ? vec3(1.8, 0.25, 1.4) : vec3(1.8, 1.2, 0.3));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: fogChunk + /* glsl */`
        varying vec3 vColor; varying vec3 vWorld;
        void main() { gl_FragColor = vec4(applyFog(vColor, vWorld), 1.0); }`,
    })
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, n)
    const seat = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1
      const k = Math.floor(this.random() * 6)
      seat.set([side * (11.6 + k * 0.7 + 0.2 + this.random() * 0.35), 0.8 + k * 1.1 + 0.35, -17.3 + this.random() * 34.6, this.random()], i * 4)
    }
    crowdGeo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seat, 4))
    crowd.frustumCulled = false
    crowd.name = 'crowd'
    this.crowd = crowdMat
    group.add(crowd)

    // the ring of light round the top of the arena and its corner towers
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.4, 2.0) })
    const top = L.height - 1.2
    const hw = L.width / 2 - 0.4, hd = L.depth / 2 - 0.4
    for (const [x, z, sx, sz] of [[0, -hd, L.width - 0.8, 0.12], [0, hd, L.width - 0.8, 0.12], [-hw, 0, 0.12, L.depth - 0.8], [hw, 0, 0.12, L.depth - 0.8]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz), ringMat)
      bar.position.set(x, top, z)
      group.add(bar)
      const bar2 = bar.clone()
      bar2.position.y = 0.06
      group.add(bar2)
    }
    const towerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 1.3) })
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, top, 0.16), towerMat)
      t.position.set(x, top / 2, z)
      group.add(t)
    }

    // the screens: six jumbotrons running the show (the two at the ends in step, the others behind by a few
    // seconds each) and the sponsor ribbons, one round the whole arena above the stands and boards along the
    // fronts of the stands
    if (pictures.board) {
      const tex = pictures.board
      const put = (w, x, y, z, rotY, offset) => {
        const j = jumbotron(tex, w, w * 9 / 16, offset)
        j.position.set(x, y, z)
        j.rotation.y = rotY
        group.add(j)
      }
      put(16, 0, 19, -L.depth / 2 + 0.6, 0, 0)
      put(16, 0, 19, L.depth / 2 - 0.6, Math.PI, 0)
      put(7, L.width / 2 - 0.6, 15, -12, -Math.PI / 2, 9.3)
      put(6, L.width / 2 - 0.6, 11.6, 14.5, -Math.PI / 2, 21.7)
      put(10, -L.width / 2 + 0.6, 15, 8, Math.PI / 2, 4.1)
      put(9, -L.width / 2 + 0.6, 21.5, -10, Math.PI / 2, 15.2)
      const hw = L.width / 2 - 0.35, hd = L.depth / 2 - 0.35
      group.add(ribbon(tex, [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], 7.0, 1.2))
      group.add(ribbon(tex, [[11.2, -17.4], [11.2, 17.4]], 0.1, 0.6, { closed: false }))
      group.add(ribbon(tex, [[-11.2, 17.4], [-11.2, -17.4]], 0.1, 0.6, { closed: false }))
    }
    const aspect = t => (t.image ? t.image.height / t.image.width : 0.5625)
    if (pictures.logo) {
      // the title in lights across the top of the east stand
      const mat = new THREE.MeshBasicMaterial({ map: pictures.logo, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10 * aspect(pictures.logo)), mat)
      logo.position.set(L.width / 2 - 0.6, 10.5, 6)
      logo.rotation.y = -Math.PI / 2
      group.add(logo)
    }
    return group
  }

  // ------------------------------------------------------------ pylons under the track
  makePylons() {
    const t = this.track
    const spots = []
    for (let i = 0; i < t.n; i += 24) {
      const px = t.P[i * 3], py = t.P[i * 3 + 1], pz = t.P[i * 3 + 2]
      if (py < 2.5 || t.gap[i]) continue
      if (t.U[i * 3 + 1] < 0.85) continue           // in the loop or the twist: no pylon
      // nothing of the track below it
      let clear = true
      for (let j = 0; j < t.n; j += 2) {
        if (Math.abs(j - i) < 40) continue
        const qy = t.P[j * 3 + 1]
        if (qy < py - 0.5 && Math.hypot(t.P[j * 3] - px, t.P[j * 3 + 2] - pz) < t.width / 2 + 0.6) { clear = false; break }
      }
      if (clear) spots.push([px, py - 0.22, pz])
    }
    const geo = new THREE.CylinderGeometry(0.11, 0.16, 1, 6, 1)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying vec3 vWorld; varying float vY;
        void main() { vY = position.y; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: fogChunk + /* glsl */`
        uniform float uTime;
        varying vec3 vWorld; varying float vY;
        void main() {
          vec3 c = vec3(0.04, 0.04, 0.08);
          // light climbing the pylon
          c += vec3(0.2, 0.9, 1.5) * pow(fract(vWorld.y * 0.25 - uTime * 0.8), 8.0) * 1.2;
          gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
        }`,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length))
    const m = new THREE.Matrix4()
    spots.forEach(([x, y, z], i) => { m.makeScale(1, y, 1).setPosition(x, 0, z); mesh.setMatrixAt(i, m) })
    mesh.count = spots.length
    mesh.name = 'pylons'
    return mesh
  }

  // ------------------------------------------------------------ flying traffic round the city
  makeTraffic() {
    const n = 160
    const geo = new THREE.PlaneGeometry(1, 1)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        attribute vec4 aLane;       // radius, height, speed (rad/s, signed), phase
        uniform float uTime;
        varying vec3 vColor; varying vec2 vUv; varying vec3 vWorld;
        void main() {
          float a = aLane.w + uTime * aLane.z;
          vec3 c = vec3(cos(a) * aLane.x, aLane.y, sin(a) * aLane.x * 1.2);
          vec3 dir = normalize(vec3(-sin(a), 0.0, cos(a) * 1.2) * sign(aLane.z));
          vec3 toCam = normalize(cameraPosition - c);
          vec3 side = normalize(cross(dir, toCam));
          vec3 p = c + dir * position.x * 4.0 + side * position.y * 0.18;
          vUv = uv;
          vWorld = p;
          vColor = aLane.z > 0.0 ? vec3(1.3, 0.25, 0.2) : vec3(0.7, 0.85, 1.1);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: fogChunk + /* glsl */`
        varying vec3 vColor; varying vec2 vUv; varying vec3 vWorld;
        void main() {
          float k = smoothstep(0.5, 0.0, abs(vUv.y - 0.5)) * pow(vUv.x, 2.0);
          gl_FragColor = vec4(applyFog(vColor * k, vWorld), 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, n)
    const lane = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const r = 45 + this.random() * 110
      lane.set([r, 18 + Math.floor(this.random() * 5) * 9, (this.random() < 0.5 ? -1 : 1) * (10 + this.random() * 8) / r, this.random() * 6.283], i * 4)
    }
    geo.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 4))
    mesh.frustumCulled = false
    mesh.name = 'traffic'
    return mesh
  }

  // ------------------------------------------------------------ searchlights from the four corners
  makeBeams() {
    const L = this.lot
    const geo = new THREE.CylinderGeometry(0.15, 3.5, 60, 16, 1, true)
    geo.translate(0, 30, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: /* glsl */`
        varying float vY; varying vec3 vN; varying vec3 vWorld;
        void main() { vY = position.y / 60.0; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        varying float vY; varying vec3 vN; varying vec3 vWorld;
        void main() {
          vec3 v = normalize(cameraPosition - vWorld);
          float edge = pow(abs(dot(vN, v)), 1.5);
          float k = (1.0 - vY) * edge * 0.09;
          gl_FragColor = vec4(vec3(0.5, 0.8, 1.0) * k, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const group = new THREE.Group()
    group.name = 'beams'
    this.beams = []
    const hw = L.width / 2 + 6, hd = L.depth / 2 + 6
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
      const b = new THREE.Mesh(geo, mat)
      b.position.set(x, 0, z)
      group.add(b)
      this.beams.push(b)
    }
    group.onBeforeRender = () => {}
    this.beamGroup = group
    return group
  }

  animate(time) {
    this.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(time * 0.3 + i * 1.7) * 0.45
      b.rotation.x = Math.cos(time * 0.23 + i * 2.1) * 0.45
    })
  }
}
