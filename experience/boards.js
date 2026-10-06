// The arena's screens, played like old LED boards: the jumbotrons run a scripted show from one picture atlas
// (assets/ui/board.png, made by tools/screens_atlas.py): the logo, "win the cup", the anime key art, the
// pilots flicking past one after another, live pictures of the race, the sponsors, a countdown. The sponsor
// ribbon round the arena scrolls a long strip of names and faces. Both draw the picture as big dots of light
// in a few levels of colour, with a rolling bright band and a torn, colour-split glitch at every cut.

import * as THREE from 'three'
import { shared, fogChunk } from './look.js'
import { boardChunk } from './boards_glsl.js'

function boardMaterial(tex, body, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uBoard: { value: tex }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])) },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWorld;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: fogChunk + boardChunk + /* glsl */`
      uniform float uTime;
      varying vec2 vUv; varying vec3 vWorld;
      ${body}`,
  })
}

/** The atlas as a texture for the boards: sharp, no mipmaps (every dot of light reads one point of it). */
export function boardTexture(tex) {
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/** A jumbotron: w x h metres facing +z (turned by rotY), its show offset by `offset` seconds. */
export function jumbotron(tex, w, h, offset = 0) {
  const group = new THREE.Group()
  const mat = boardMaterial(tex, /* glsl */`
    uniform float uOffset;
    void main() { gl_FragColor = vec4(applyFog(jumbotron(vUv, uTime + uOffset), vWorld), 1.0); }`, { uOffset: offset })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  screen.name = 'jumbotron'
  // the housing: a dark box with a light strip round its face
  const box = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.015, 0.015, 0.03) }))
  box.position.z = -0.22
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.36, h + 0.36), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.1, 1.8) }))
  trim.position.z = -0.015
  group.add(box, trim, screen)
  return group
}

/**
 * The sponsor ribbon: a band h metres tall along a path of points [[x, z], ...] at height y (closed if
 * `closed`), its face towards the inside of the path's turn (`inward`: +1 or -1 picks the side).
 */
export function ribbon(tex, path, y, h, { closed = true, side = 1 } = {}) {
  const pts = closed ? [...path, path[0]] : path
  const pos = [], uv = [], index = []
  let along = 0
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
    pos.push(x, y, z, x, y + h, z)
    uv.push(along, 0, along, 1)
    if (i > 0) {
      const a = (i - 1) * 2
      if (side > 0) index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      else index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  const mat = boardMaterial(tex, /* glsl */`
    uniform float uH;
    void main() { gl_FragColor = vec4(applyFog(ribbonBoard(vUv, uTime, uH), vWorld), 1.0); }`, { uH: h })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'ribbon'
  return mesh
}
