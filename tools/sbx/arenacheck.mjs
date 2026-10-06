// The arena round every course: the intro's shots (every second), then each course from fixed cameras (a high corner,
// both stands, the floor) to see the stands, screens and ribbons keep clear of the road. Screenshots in shots/arena/.
// node tools/sbx/arenacheck.mjs [intro|courses|all] [env]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const what = process.argv[2] || 'all', env = process.argv[3] || ''
const out = fileURLToPath(new URL('../../shots/arena/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { const t = m.text(); if (/error/i.test(t) && !/404/.test(t)) console.log(t.slice(0, 300)) })
await page.goto(`http://localhost:8383/tools/harness/index.html${env ? `?env=${env}` : ''}`)
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
if (what === 'intro' || what === 'all') {
  await page.keyboard.press('KeyX')
  for (let k = 0; k < 14; k++) { await page.screenshot({ path: `${out}intro-${String(k).padStart(2, '0')}.png` }); await wait(1000) }
}
if (what === 'courses' || what === 'all') {
  const n = await page.evaluate(() => window.__dbg.courses.length)
  const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null
  for (let k = 0; k < n; k++) {
    if (only && !only.includes(k)) continue
    await page.evaluate(k => {
      const d = window.__dbg
      d.menus.hideAll()
      d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: k, row: 0 })
    }, k)
    await wait(2500)
    const info = await page.evaluate(() => {
      const d = window.__dbg, c = d.cities.find(c => c.group.visible)
      d.cams.chase = () => {}; d.cams.watch = () => {}
      d.overlay.scene.visible = false
      return { kind: c.kind, tiers: c.stands?.tiers.length, fronts: c.stands?.fronts.length, solids: c.solids?.length }
    })
    console.log('course', k, JSON.stringify(info))
    const views = [['high', [22, 34, 34], [0, 4, 0]], ['east', [-6, 9, -26], [13, 2, 2]], ['west', [6, 9, 26], [-13, 2, -2]], ['floor', [0, 1.2, -19], [6, 0.5, 6]]]
    for (const [name, from, at] of views) {
      await page.evaluate(([from, at]) => { const cam = window.__dbg.camera; cam.position.set(...from); cam.up.set(0, 1, 0); cam.lookAt(...at); cam.fov = 60; cam.updateProjectionMatrix() }, [from, at])
      await wait(400)
      await page.screenshot({ path: `${out}c${k}-${name}.png` })
    }
  }
}
await browser.close()
