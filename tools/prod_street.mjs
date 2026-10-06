// Lot 383 on the live site as a visitor (no sign-in): the street view from a few places.
// node tools/prod_street.mjs   VIEWS='[[dx,y,dz,yaw,pitch],...]' from the lot's middle, DPR=2
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'street')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: Number(process.env.DPR ?? 1) })).newPage()
const logs = []
page.on('console', m => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`))
await page.goto('https://project0.city/')
await page.waitForTimeout(6000)
await page.getByText('Just look around').click().catch(() => {})
await page.waitForTimeout(1000)
await page.getByText("Let's go").click().catch(() => {})
await page.waitForTimeout(2500)
await page.keyboard.press('Escape')
const lot = await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); return { x: l.x, z: l.z } })
const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [[0, 20, 52, 0, -0.2], [34, 26, 40, Math.PI / 4, -0.35], [-30, 9, -10, -Math.PI / 2, -0.15], [0, 45, 10, 0, -1.2]]
for (const [i, [dx, y, dz, yaw, pitch]] of views.entries()) {
  await page.evaluate(([lot, dx, y, dz, yaw, pitch]) => { const p = window.p0.player; p.position.set(lot.x + dx, y, lot.z + dz); p.camYaw = yaw; p.camPitch = pitch; p.root.visible = false }, [lot, dx, y, dz, yaw, pitch])
  await page.waitForTimeout(i === 0 ? 14000 : 5000)
  await page.screenshot({ path: path.join(out, `street-${i}.png`) })
  console.log('shot', i)
}
console.log(logs.filter(l => /error|383|shader/i.test(l)).slice(-10).join('\n'))
await browser.close()
