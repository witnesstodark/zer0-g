// Players' own machines on the mock page: without one (the "your own machine" tile and its hint), with one (it
// comes first marked YOURS, races in Time Attack, its particles fly on a nitro), and online (the other player's
// machine is loaded for the race). Screenshots into shots/entity/. node tools/sbx/entitycheck.mjs [sample]
// sample: 1 (a stand-in machine, the default) or stefan (entity/stefan/)
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const sample = process.argv[2] ?? '1'
const out = fileURLToPath(new URL('../../shots/entity/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const open = async q => {
  const page = await context.newPage()
  page.on('pageerror', e => console.log(q, 'pageerror', e.message))
  page.on('console', m => { if (/machine|error/i.test(m.text()) && !/\[sound\]/.test(m.text())) console.log(q, m.text().slice(0, 200)) })
  await page.goto(`http://localhost:8383/tools/harness/index.html?${q}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
const wait = (p, ms) => p.waitForTimeout(ms)
const press = async (p, k) => { await p.keyboard.press(k); await wait(p, 250) }
const toMachine = async (p, mode) => { await press(p, 'KeyW'); await press(p, 'KeyW'); await wait(p, 300); await press(p, 'Space'); await p.evaluate(m => { window.__dbg.menus.sel.mode = m }, mode); await press(p, 'Space'); await wait(p, 600) }

// 1. no machine of your own
const a = await open('pid=0&name=NOBODY')
await toMachine(a, 2)
await a.mouse.click(40 + 4 * 112 + 52, 92 + 2 * 86 + 39); await wait(a, 400)
await a.screenshot({ path: `${out}01-no-machine.png` })
console.log('no machine: tiles', await a.evaluate(() => window.__dbg.menus.regions().filter(r => r.id.startsWith('tile:')).length), 'flash:', await a.evaluate(() => window.__dbg.menus.flash))
await a.close()

// 2. with one: first? YOURS, Time Attack, a nitro
const b = await open(`pid=0&name=STEFAN&entity=${sample}`)
await toMachine(b, 2)
const own = await b.evaluate(() => { const m = window.__dbg.menus; const k = m.sel.machine = window.__dbg.menus.regions().filter(r => r.id.startsWith('tile:')).length - 1; m.showMachine(); m.redraw(); return k })
await wait(b, 600); await b.screenshot({ path: `${out}02-select-own.png` })
console.log('own machine at tile', own)
await press(b, 'Space'); await wait(b, 300); await press(b, 'Space')
await wait(b, 7500); await b.keyboard.down('KeyW'); await wait(b, 2500)
await b.evaluate(() => { window.__dbg.me.nitro = 100 })
console.log('me', await b.evaluate(() => { const m = window.__dbg.me; return `${m.name} model ${m.model} particle ${m.particle}` }))
await b.keyboard.down('ShiftLeft'); await wait(b, 700); await b.screenshot({ path: `${out}03-nitro.png` }); await wait(b, 900); await b.screenshot({ path: `${out}04-nitro-2.png` })
await b.keyboard.up('ShiftLeft'); await b.keyboard.up('KeyW')
await b.close()

// 3. online: B brings their own machine, A sees it
const A = await open('pid=1&name=STEFAN')
const B = await open(`pid=2&name=MAK&entity=${sample}`)
for (const p of [A, B]) { await p.bringToFront(); await press(p, 'KeyW'); await press(p, 'KeyW'); await wait(p, 300) }
await A.bringToFront(); await press(A, 'Space'); await press(A, 'ArrowRight'); await press(A, 'Space'); await wait(A, 300); await press(A, 'Space'); await press(A, 'Space'); await wait(A, 600)
await B.bringToFront(); await press(B, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(B, 400); await press(B, 'Space'); await wait(B, 600)
await A.bringToFront(); await press(A, 'Space'); await wait(A, 900)
await B.bringToFront(); await B.evaluate(() => { const m = window.__dbg.menus; m.sel.machine = 18; m.showMachine() }); await press(B, 'Space')
await A.bringToFront(); await press(A, 'Space'); await wait(A, 3000)
console.log('field', await A.evaluate(() => JSON.stringify(window.__p0.room.state.lobby?.field)))
await wait(A, 6000)
const see = p => p.evaluate(() => window.__dbg.race.racers.filter(r => r.human).map(r => `${r.name}${r.remote ? '(remote)' : ''} model ${r.model} particle ${r.particle}`).join(' | '))
console.log('A sees', await see(A)); console.log('B sees', await see(B))
await A.screenshot({ path: `${out}05-online-A.png` })
await browser.close()
