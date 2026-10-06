// HYPERLANE on the live site as a visitor: fly to lot 383, enter the game, play through the intro, the
// menus and a race start, with screenshots. node tools/prod_play.mjs [race seconds]
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'prod')
mkdirSync(out, { recursive: true })
const raceSeconds = Number(process.argv[2] ?? 12)
const browser = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.DPR ?? 1) })).newPage()
const logs = []
page.on('console', m => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`))
page.on('pageerror', e => logs.push('pageerror: ' + e.message))
await page.goto('https://project0.city/')
await page.waitForTimeout(6000)
await page.getByText('Just look around').click().catch(() => {})
await page.waitForTimeout(1000)
await page.getByText("Let's go").click().catch(() => {})
await page.getByText('Start').click().catch(() => {})
await page.waitForTimeout(1500)
const lot = await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); return { x: l.x, z: l.z, w: l.w, d: l.d, y: l.y ?? 0 } })
console.log('lot', JSON.stringify(lot))
await page.evaluate(l => { const p = window.p0.player; p.position.set(l.x + 30, 22, l.z + 30); p.camYaw = Math.PI / 4; p.camPitch = 0.25 }, lot)
await page.waitForTimeout(8000)
let n = 0
const shot = async name => { await page.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-${name}.png`) }); console.log('shot', name) }
await shot('street')
await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); window.p0.experiences.request(l) })
await page.waitForTimeout(9000)
const inside = await page.evaluate(() => !!window.p0.experiences.active)
console.log('inside', inside)
await shot('entered')
const frame = page.frameLocator('iframe.experience')
await page.locator('iframe.experience').click({ position: { x: 640, y: 400 } }).catch(e => console.log('click', e.message))
await page.waitForTimeout(1500); await shot('intro-1')
await page.waitForTimeout(3500); await shot('intro-2')
await page.waitForTimeout(4000); await shot('intro-3')
await page.waitForTimeout(3500); await shot('title')
for (const [key, name, ms] of [['Space', 'mode', 600], ['Space', 'machine', 900], ['ArrowRight', 'machine-2', 900], ['Space', 'course', 600], ['Space', 'grid', 2000]]) {
  await page.keyboard.press(key); await page.waitForTimeout(ms); await shot(name)
}
await page.waitForTimeout(2500); await shot('countdown')
await page.waitForTimeout(2600)
await page.keyboard.down('KeyW')
for (let t = 0; t < raceSeconds; t += 2) {
  if (t % 6 === 2) await page.keyboard.down('KeyD')
  await page.waitForTimeout(t % 6 === 2 ? 350 : 2000)
  await page.keyboard.up('KeyD')
  await shot('race')
}
writeFileSync(path.join(out, 'log.txt'), logs.join('\n'))
console.log(logs.filter(l => /error|383|experience|sandbox/i.test(l)).slice(-15).join('\n'))
await browser.close()
