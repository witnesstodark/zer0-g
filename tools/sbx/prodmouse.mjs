// The live version in project0.city's sandbox shell, with the mouse only: start, the title, a hovered card, a
// clicked card, a clicked machine, NEXT. Screenshots into shots/prodmouse/. node tools/sbx/prodmouse.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/prodmouse/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const W = 1200, H = 800
const world = await (await fetch('https://project0.city/api/world')).json()
const find = o => { if (Array.isArray(o)) { for (const v of o) { const r = find(v); if (r) return r } } else if (o && typeof o === 'object') { if (o.id === 383 && o.experience) return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r } } return null }
const VER = find(world).experience.version
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto(`http://localhost:8383/tools/harness/prod.html?lot=383&v=${VER}&base=${encodeURIComponent(`https://files.project0.city/x/383/${VER}/`)}`)
await page.waitForFunction(() => window.__started, null, { timeout: 90000 }).catch(() => console.log('no start'))
const wait = ms => page.waitForTimeout(ms)
let n = 0
const shot = async name => { await page.screenshot({ path: `${out}${String(n++).padStart(2, '0')}-${name}.png` }) }
const u = Math.min(W / 1280, H / 720), left = (W - 1280 * u) / 2, top = (H - 720 * u) / 2
const at = (x, y) => [left + x * u, top + y * u]
const move = async (x, y) => { await page.mouse.move(...at(x, y), { steps: 4 }); await wait(300) }
const click = async (x, y) => { await move(x, y); await page.mouse.click(...at(x, y)); await wait(600) }
await page.mouse.click(W / 2, H / 2); await wait(800); await page.mouse.click(W / 2, H / 2); await wait(1500)
await shot('title')
await click(640, 400); await move(400, 520); await shot('mode-hover-ta')
await click(400, 520); await click(498, 217); await move(1125, 687); await shot('machine-clicked-hover-next')
await click(1125, 687); await move(1050, 300); await shot('course-hover')
console.log('version', VER)
await browser.close()
