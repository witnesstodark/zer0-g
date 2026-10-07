// Two lobbies racing at once (four players on the mock page): A and B in one, C and D in the other. Each must see its
// own partner and nobody from the other race, the two AI fields apart, and both lobbies open again after.
// node tools/sbx/quad.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const context = await browser.newContext({ viewport: { width: 640, height: 360 } })
const errors = []
const open = async (pid, name) => {
  const page = await context.newPage()
  page.on('pageerror', e => { errors.push(`${name}: ${e.message}`); console.log(name, 'pageerror', e.message) })
  page.on('console', m => { const t = m.text(); if (/error/i.test(t) && !/404|\[sound\]/.test(t)) { errors.push(`${name}: ${t.slice(0, 200)}`) } })
  await page.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${name}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
let fails = 0
const check = (ok, what, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`) }
const A = await open(1, 'ANN'), B = await open(2, 'BOB'), C = await open(3, 'CID'), D = await open(4, 'DEE')
const wait = ms => A.waitForTimeout(ms)
const press = async (p, k) => { await p.bringToFront(); await p.keyboard.press(k); await wait(220) }
const screen = p => p.evaluate(() => window.__dbg?.menus?.screen ?? null)
const lobbies = p => p.evaluate(() => { const s = window.__p0.room.state; return Object.keys(s).filter(k => k.startsWith('lobby:') && s[k]).map(k => `${s[k].id}:${s[k].phase}`) })
const seen = p => p.evaluate(() => { const r = window.__dbg.race; return { online: !!window.__dbg.online.race, humans: r.racers.filter(x => x.human).map(x => x.name), aiD: r.racers.find(x => !x.human)?.D ?? 0 } })
const toTitle = async p => { for (let k = 0; k < 20 && (await screen(p)) !== 'title'; k++) { await press(p, 'Space'); await wait(400) } }
const toOnline = async p => { await press(p, 'Space'); await wait(300); await press(p, 'ArrowRight'); await press(p, 'Space'); await wait(500) }
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(400) } return false }
for (const p of [A, B, C, D]) await toTitle(p)
// A makes a lobby, B joins it; C makes another, D joins C's (the second row: lobbies are listed oldest first)
await toOnline(A); await press(A, 'Space'); await wait(300); await press(A, 'Space'); await wait(700)
await toOnline(B); await press(B, 'ArrowDown'); await press(B, 'Space'); await wait(700)
await toOnline(C); await press(C, 'Space'); await wait(300); await press(C, 'ArrowRight'); await press(C, 'Space'); await wait(700)
await toOnline(D); await press(D, 'ArrowDown'); await press(D, 'ArrowDown'); await press(D, 'Space'); await wait(700)
const owners = await D.evaluate(() => { const s = window.__p0.room.state; return Object.keys(s).filter(k => k.startsWith('in:') && s[k]).map(k => `${k}->${s[k].l}`) })
check((await lobbies(A)).length === 2, 'two lobbies', JSON.stringify(await lobbies(A)))
console.log('   members', owners.join(' '))
for (const p of [A, C]) await press(p, 'Space')
await wait(800)
for (const p of [A, B, C, D]) await press(p, 'Space')
check(await until(async () => (await Promise.all([A, B, C, D].map(seen))).every(x => x.online)), 'all four racing')
for (const p of [A, B, C, D]) { await p.bringToFront(); await p.keyboard.down('KeyW') }
await wait(10000)
const [sa, sb, sc, sd] = await Promise.all([A, B, C, D].map(seen))
check(sa.humans.sort().join() === 'ANN,BOB' && sb.humans.sort().join() === 'ANN,BOB', 'A and B race each other only', `${sa.humans} / ${sb.humans}`)
check(sc.humans.sort().join() === 'CID,DEE' && sd.humans.sort().join() === 'CID,DEE', 'C and D race each other only', `${sc.humans} / ${sd.humans}`)
check(Math.abs(sa.aiD - sb.aiD) < 4 && Math.abs(sc.aiD - sd.aiD) < 4, 'each pair agrees on its AI', `${sa.aiD.toFixed(1)} ${sb.aiD.toFixed(1)} / ${sc.aiD.toFixed(1)} ${sd.aiD.toFixed(1)}`)
for (const p of [A, B, C, D]) { await p.bringToFront(); await p.keyboard.up('KeyW'); await p.evaluate(() => { const d = window.__dbg, m = d.me, L = d.race.track.length; m.D = d.race.laps * L - 1.2; m.lap = d.race.laps; m.sp = m.vmax }) }
check(await until(async () => (await lobbies(A)).every(x => x.endsWith(':open')) && (await lobbies(A)).length === 2, 25000), 'both lobbies open again', JSON.stringify(await lobbies(A)))
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 8).join('\n')}` : 'no errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
