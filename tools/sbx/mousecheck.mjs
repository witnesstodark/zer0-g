// The menus with the mouse only, on the mock page at an odd window size (the menus' frame letterboxed and
// scaled): hover, click a mode card, a machine, the engine's marker, NEXT, a course, RACE; then the online
// screen's button. Screenshots into shots/mouse/. node tools/sbx/mousecheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/mouse/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const W = 1200, H = 800
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto('http://localhost:8383/tools/harness/index.html?pid=1&name=STEFAN')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
let n = 0
const shot = async name => { await page.screenshot({ path: `${out}${String(n++).padStart(2, '0')}-${name}.png` }) }
// the menus' 1280 x 720 frame on this window
const u = Math.min(W / 1280, H / 720), left = (W - 1280 * u) / 2, top = (H - 720 * u) / 2
const at = (x, y) => [left + x * u, top + y * u]
const move = async (x, y) => { await page.mouse.move(...at(x, y), { steps: 4 }); await wait(250) }
const click = async (x, y) => { await move(x, y); await page.mouse.click(...at(x, y)); await wait(400) }
const where = () => page.evaluate(() => { const m = window.__dbg.menus; return `${m.screen} sel ${JSON.stringify(m.sel)} hover ${m.hover}` })
await page.mouse.click(W / 2, H / 2); await wait(600); await page.mouse.click(W / 2, H / 2); await wait(900)
console.log('title?', await where())
await click(640, 400); console.log('after title click', await where())
await move(400, 520); console.log('hover TA card', await where()); await shot('mode-hover')
await move(125, 687); console.log('hover back', await where()); await shot('mode-back-hover')
await click(400, 520); console.log('clicked TA', await where())
await click(40 + 3 * 132 + 60, 92 + 86 + 40); console.log('clicked machine 9', await where())
await move(852 + 240, 592); await page.mouse.down(); await move(852 + 60, 592); await page.mouse.up(); console.log('engine dragged', await where())
await move(1125, 687); await shot('machine-next-hover')
await click(1125, 687); console.log('NEXT', await where())
await click(640 + 410, 300); console.log('clicked course 3', await where()); await shot('course')
await move(125, 687); await click(125, 687); console.log('BACK', await where())
await click(1125, 687); await move(640, 300); await page.mouse.dblclick(...at(640, 300)); await wait(300); console.log('course 2 double-click', await where())
await wait(1500); await shot('race-start')
console.log('state', await page.evaluate(() => window.__dbg.race?.started), await page.evaluate(() => window.__dbg.me?.name))
// back to the menus: Backspace twice, then ONLINE RACE by mouse
await wait(7000); await page.keyboard.press('Backspace'); await wait(200); await page.keyboard.press('Backspace'); await wait(1200)
console.log('menu again', await where())
await click(880, 280); console.log('online hub', await where()); await move(640, 419); await shot('online-hover')
await click(640, 149); console.log('create', await where()); await click(1125, 687); console.log('lobby', await where()); await move(640, 629); await shot('lobby-start-hover')
await browser.close()
