// Shader warm-up. Without a GPU (and without parallel shader compilation) the browser compiles each
// shader the first time it draws, inside that frame, and a frame longer than 3 seconds stops the
// experience. So before the show starts every material is drawn once on its own into a 4 x 4 target,
// with a pause after each, and the experience learns how fast this machine is.

import * as THREE from 'three'

const pause = ms => new Promise(r => setTimeout(r, ms))

/**
 * groups: arrays of objects that are drawn together (one shader each, ideally). Returns the slowest
 * group's time in ms. extra: functions run the same way (e.g. the bloom passes).
 */
export async function warmUp(renderer, scene, camera, groups, log) {
  const tiny = new THREE.WebGLRenderTarget(4, 4)
  const drawn = []
  scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) drawn.push([o, o.visible]) })
  const before = renderer.getRenderTarget()
  let slowest = 0
  for (const [name, group] of groups) {
    for (const [o] of drawn) o.visible = false
    for (const o of group) o.visible = true
    const t = performance.now()
    renderer.setRenderTarget(tiny)
    renderer.render(scene, camera)
    renderer.setRenderTarget(before)
    const ms = performance.now() - t
    slowest = Math.max(slowest, ms)
    if (ms > 60) log(`warm ${name}: ${Math.round(ms)} ms`)
    await pause(20)
  }
  for (const [o, v] of drawn) o.visible = v
  tiny.dispose()
  return slowest
}

/** Run each function with a pause after it (compiling post-processing passes one by one). */
export async function warmSteps(steps, log) {
  for (const [name, fn] of steps) {
    const t = performance.now()
    fn()
    const ms = performance.now() - t
    if (ms > 60) log(`warm ${name}: ${Math.round(ms)} ms`)
    await pause(20)
  }
}
