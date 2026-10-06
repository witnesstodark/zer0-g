// The feeling of speed on the screen: anime speed lines streaming out from the middle (the faster, the more),
// a coloured glow round the edges for a moment (a dash plate, the nitro, the pit's refill), and a zoom blur
// that smears the edges of the picture at speed (split into its colours while the nitro burns). The lines and the glow are one quad drawn under the HUD; the
// blur is a pass of the composer before the output.

import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

export class ScreenFx {
  constructor(overlay) {
    this.overlay = overlay
    this.uniforms = {
      uTime: { value: 0 },
      uAspect: { value: 16 / 9 },
      uLines: { value: 0 },
      uLineColor: { value: new THREE.Color(0.75, 0.95, 1.2) },
      uEdge: { value: 0 },
      uEdgeColor: { value: new THREE.Color(1, 0.2, 0.9) },
      uMega: { value: 0 },
    }
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uAspect, uLines, uEdge, uMega;
        uniform vec3 uLineColor, uEdgeColor;
        varying vec2 vUv;
        float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
        void main() {
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float r = length(p);
          float a = atan(p.y, p.x) / 6.2831853 + 0.5;
          // the lines: thin rays, each flickering on and off on its own beat, dashes rushing outwards
          float n = 180.0;
          float cell = floor(a * n);
          float beat = floor(uTime * 14.0 + hash(cell) * 7.0);
          float h = hash(cell * 1.31 + beat * 7.7);
          float on = step(1.0 - uLines * 0.75, h);
          float wid = 0.08 + 0.3 * h * h;
          float line = 1.0 - smoothstep(0.0, wid, abs(fract(a * n) - 0.5) * 2.0);
          float seg = fract(r * (1.2 + 2.0 * h) - uTime * (2.5 + 3.0 * h) - h * 5.0);
          float dash = smoothstep(0.0, 0.25, seg) * (1.0 - smoothstep(0.55, 1.0, seg));
          float reach = smoothstep(0.62 - 0.32 * uLines, 1.05, r);
          vec3 c = uLineColor * line * dash * reach * on * min(1.0, uLines * 1.4);
          // a MEGA NITRO: rings rushing out of the middle, a tunnel of light round the picture
          float ring = 1.0 - smoothstep(0.0, 0.16, abs(fract(log(r + 0.02) * 2.2 - uTime * 3.4) - 0.5) * 2.0 - 0.84);
          c += mix(vec3(1.0, 0.35, 0.9), vec3(0.35, 0.9, 1.2), 0.5 + 0.5 * sin(uTime * 9.0 + a * 12.566)) * ring * smoothstep(0.45, 1.1, r) * uMega * 0.55;
          // the glow round the edges
          float e = smoothstep(0.55, 1.05, r) * uEdge;
          c += uEdgeColor * e * (0.8 + 0.2 * sin(uTime * 40.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }))
    this.mesh.renderOrder = -10
    this.mesh.frustumCulled = false
    overlay.scene.add(this.mesh)
    this.edge = 0
    this.edgeColor = new THREE.Color()
    this.lines = 0

    // the zoom blur
    this.pass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uK: { value: 0 }, uSplit: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float uK, uSplit;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5;
          float r = smoothstep(0.12, 0.75, length(d));
          float e = r * uK;
          float sp = r * uSplit;
          vec3 c = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            float z = 1.0 - e * 0.026 * float(i);
            c.r += texture2D(tDiffuse, 0.5 + d * (z + sp)).r;
            c.g += texture2D(tDiffuse, 0.5 + d * z).g;
            c.b += texture2D(tDiffuse, 0.5 + d * (z - sp)).b;
          }
          gl_FragColor = vec4(c / 6.0, 1.0);
        }`,
    })
    this.pass.enabled = false

    // a light sharpening of the finished picture (an unsharp mask from the four neighbours)
    this.sharpen = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uAmount: { value: 0.22 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uAmount;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec3 n = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
          gl_FragColor = vec4(clamp(c + (c * 4.0 - n) * uAmount, 0.0, 1.0), 1.0);
        }`,
    })
    this.resize()
  }

  /** The sharpening's step: one pixel of the picture it works on (w x h). */
  setSize(w, h) { this.sharpen.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)) }

  resize() {
    const o = this.overlay
    this.uniforms.uAspect.value = o.width / Math.max(1, o.height)
    this.mesh.position.set(o.width / 2, o.height / 2, -1)
    this.mesh.scale.set(o.width, o.height, 1)
  }

  /** A flash of colour round the edges (k: how strong, 0-1). */
  flash(color, k = 0.6) {
    this.edgeColor.set(color)
    this.edge = Math.max(this.edge, k)
  }

  /** speedK: speed over top speed; boost: nitro or a plate is pushing; tint: the lines' colour. */
  update(dt, time, speedK, boost, tint, on = true, nitro = false, mega = false) {
    const want = on ? Math.max(0, Math.min(1, (speedK - 0.62) / 0.5)) * 0.75 + (boost ? 0.5 : 0) + (mega ? 0.35 : 0) : 0
    this.mega = (this.mega ?? 0) + ((mega ? 1 : 0) - (this.mega ?? 0)) * Math.min(1, dt * (mega ? 8 : 2.5))
    this.uniforms.uMega.value = this.mega
    this.lines += (want - this.lines) * Math.min(1, dt * (want > this.lines ? 10 : 3))
    this.edge = Math.max(0, this.edge - dt * 1.8)
    const u = this.uniforms
    u.uTime.value = time
    u.uLines.value = this.lines
    u.uLineColor.value.set(tint ?? 0xbfeaff).multiplyScalar(1.1)
    u.uEdge.value = this.edge
    u.uEdgeColor.value.copy(this.edgeColor)
    this.mesh.visible = this.lines > 0.01 || this.edge > 0.01 || this.mega > 0.01
    this.split = (this.split ?? 0) + ((nitro ? 1 : 0) - (this.split ?? 0)) * Math.min(1, dt * (nitro ? 12 : 4))
    this.pass.uniforms.uK.value = this.lines * (1 + this.split * 0.6 + this.mega * 0.9)
    this.pass.uniforms.uSplit.value = this.split * 0.018 + this.mega * 0.022
    this.pass.enabled = !this.lite && (this.lines > 0.03 || this.split > 0.02)
    this.sharpen.enabled = !this.lite
  }
}
