// The heal bubble and the nitro jet up close on the mock page: your machine put on the start straight's heal strip
// low on energy, then the nitro. Screenshots in shots/fx/. node tools/sbx/fxcheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/fx/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { if (/error/i.test(m.text()) && !/404/.test(m.text())) console.log(m.text().slice(0, 200)) })
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const key = async k => { await page.keyboard.press(k); await wait(300) }
await key('KeyW'); await key('KeyW'); await wait(400)
for (const k of ['Space', 'Space', 'Space', 'Space']) await key(k)
await wait(7200)
await page.keyboard.down('KeyW')
await wait(1500)
// onto the second heal strip (s 45.5-56.5, the right edge), low on energy
await page.evaluate(() => { const m = window.__dbg.me, L = window.__dbg.race.track.length; m.D = 44 + L; m.x = 1.35; m.energy = 30; m.psi = 0; m.phi = 0 })
await wait(500); await page.screenshot({ path: out + '1-bubble.png' })
await wait(400); await page.screenshot({ path: out + '2-bubble.png' })
await page.keyboard.down('KeyA'); await wait(600); await page.keyboard.up('KeyA')
await wait(300); await page.screenshot({ path: out + '3-pop.png' })
await page.evaluate(() => { window.__dbg.me.nitro = 100 })
await page.keyboard.press('ShiftLeft'); await wait(120); await page.screenshot({ path: out + '4-nitro.png' })
await wait(350); await page.screenshot({ path: out + '5-nitro.png' })
await page.keyboard.press('ShiftLeft'); await wait(600); await page.screenshot({ path: out + '6-nitro.png' })
console.log('energy', await page.evaluate(() => window.__dbg.me.energy.toFixed(0)))
await browser.close()
