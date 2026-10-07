// The nitro and the drift (round 21): a drift, then SHIFT pressed ends it at once; in a burning nitro a drift may
// start but earns nothing; a drift is 6% slower. node tools/sbx/driftboost.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const st = () => page.evaluate(() => { const m = window.__dbg.me; return { drift: m.drift, boostT: +m.boostT.toFixed(2), sp: +(m.sp / m.vmax).toFixed(3), nitro: Math.round(m.nitro) } })
let fails = 0
const check = (ok, what, d) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}  ${JSON.stringify(d)}`) }
await page.evaluate(() => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'ta', machine: 0, engine: 0.5, cls: 1, course: 0, row: 0 }) })
await wait(8500)
await page.keyboard.down('KeyW'); await wait(3000)
const flat = (await st()).sp
await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await wait(150); await page.keyboard.up('KeyD'); await wait(700)
const drifting = await st()
check(drifting.drift !== 0, 'a drift', drifting)
await wait(1500)
const later = await st(), flow = await page.evaluate(() => window.__dbg.me.flow)
// (round 23: compared with the speed before the drift it was a race against the machine still speeding up, and it
// passed only because the drift used to fly into a wall; now against the top speed it may have: 4% under the flat
// top speed with the flow's share)
check(later.drift === 0 || later.sp <= 0.96 * (1 + 0.25 * flow) + 0.012, 'slower in it (under 96% of the top speed)', { flat, drifting: later.sp, cap: +(0.96 * (1 + 0.25 * flow)).toFixed(3) })
await page.evaluate(() => { window.__dbg.me.nitro = 100 })
await page.keyboard.press('ShiftLeft'); await wait(120)
const after = await st()
check(after.drift === 0 && after.boostT > 0, 'SHIFT ends the drift, the nitro burns', after)
await page.keyboard.up('Space'); await wait(100)
await page.keyboard.down('Space'); await page.keyboard.down('KeyA'); await wait(200); await page.keyboard.up('KeyA')
const tried = await st()
check(tried.drift !== 0 && tried.nitro <= after.nitro + 2.5, 'a drift in a burning nitro, earning nothing', tried)
await page.keyboard.up('Space')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
