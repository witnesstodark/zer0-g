// Two players in one online race on the mock page (two tabs sharing a session): A creates the lobby, B joins
// it, nothing starts until A starts it, both pick a machine, both race. Screenshots of both in shots/duo/.
// node tools/sbx/duo.mjs
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/duo/', import.meta.url))
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
const open = async (pid, name) => {
  const page = await context.newPage()
  page.on('console', m => { const t = m.text(); if (/error|online|lobby|score|win/i.test(t) && !/\[sound\]/.test(t)) console.log(name, t.slice(0, 200)) })
  page.on('pageerror', e => console.log(name, 'pageerror', e.message))
  await page.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${name}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
const A = await open(1, 'STEFAN')
const B = await open(2, 'MAK')
const wait = ms => A.waitForTimeout(ms)
let n = 0
const shot = async (p, name) => { await p.screenshot({ path: `${out}${String(n++).padStart(2, '0')}-${name}.png` }) }
const press = async (p, k) => { await p.bringToFront(); await p.keyboard.press(k); await wait(250) }
const state = async p => p.evaluate(() => { const s = window.__p0.room.state, Lk = Object.keys(s).find(k => k.startsWith('lobby:') && s[k]); s.lobby = Lk ? s[Lk] : null; return { lobby: s.lobby && { phase: s.lobby.phase, owner: s.lobby.owner, co: s.lobby.co, c: s.lobby.c, field: s.lobby.field?.map(f => f.pid + ':' + f.m) }, ins: Object.keys(s).filter(k => k.startsWith('in:') && s[k]).map(k => k + '=' + JSON.stringify(s[k])), tick: window.__p0.room.tick } })
const screen = p => p.evaluate(() => window.__dbg?.menus?.screen ?? '?')
// both to the title, then the mode screen
for (const p of [A, B]) { await press(p, 'KeyW'); await press(p, 'KeyW'); await wait(300) }
// A: ONLINE RACE -> create a lobby (course 2, class as it is)
await press(A, 'Space'); await press(A, 'ArrowRight'); await shot(A, 'A-mode')
await press(A, 'Space'); await wait(300); await shot(A, 'A-hub')
await press(A, 'Space'); await press(A, 'ArrowRight'); await shot(A, 'A-create')
await press(A, 'Space'); await wait(600); await shot(A, 'A-lobby')
console.log('after create', JSON.stringify(await state(A)))
// B: ONLINE RACE -> join
await press(B, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(400); await shot(B, 'B-hub')
await press(B, 'ArrowDown'); await press(B, 'Space'); await wait(600); await shot(B, 'B-lobby')
// nothing starts by itself
await wait(4000)
console.log('4 s later', JSON.stringify(await state(B)), 'A on', await screen(A), 'B on', await screen(B))
await shot(A, 'A-lobby2')
// A starts it: both pick
await press(A, 'Space'); await wait(900)
console.log('started', JSON.stringify(await state(A)), 'A on', await screen(A), 'B on', await screen(B))
await shot(A, 'A-pick'); await shot(B, 'B-pick')
await press(B, 'ArrowRight'); await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(400); await shot(B, 'B-locked')
await press(A, 'ArrowRight'); await press(A, 'Space'); await wait(900)
console.log('picked', JSON.stringify(await state(A)))
await wait(2500)
await shot(A, 'A-grid'); await shot(B, 'B-grid')
await wait(5000)
for (const p of [A, B]) { await p.bringToFront(); await p.keyboard.down('KeyW') }
const where = p => p.evaluate(() => { const r = window.__dbg.race; return r.racers.filter(x => x.human).map(x => `${x.name}${x.remote ? '(remote)' : ''} m=${x.model} D=${x.D.toFixed(2)} x=${x.x.toFixed(2)} rank=${x.rank}`).join(' | ') + ` · AI#5 D=${r.racers[5].D.toFixed(2)} remote=${r.racers[5].remote}` })
for (let k = 0; k < 4; k++) {
  await wait(2500); await shot(A, 'A-race'); await shot(B, 'B-race')
  const [a, b] = await Promise.all([where(A), where(B)])
  console.log('A sees', a); console.log('B sees', b)
}
// a drift on A: Space + a touch of steering
await A.bringToFront(); await A.keyboard.down('Space'); await A.keyboard.down('KeyD'); await wait(120); await A.keyboard.up('KeyD'); await wait(700); await shot(A, 'A-drift')
await A.keyboard.up('Space')
await browser.close()
