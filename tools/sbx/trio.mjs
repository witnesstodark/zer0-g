// Three players online on the mock page, every way a session goes: A creates, B joins, C watches; a race of two
// to the line, the results, back to the lobby and a race of three; the AI's driver (A, the owner) leaving mid-race;
// a player trying to join while a race is on; the owner leaving in the pick. Prints PASS/FAIL per check.
// node tools/sbx/trio.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const context = await browser.newContext({ viewport: { width: 800, height: 450 } })
const errors = []
const open = async (pid, name) => {
  const page = await context.newPage()
  page.on('console', m => {
    const t = m.text()
    if (/\[online\]/.test(t)) console.log('   ', name, t.replace('[p0] [online] ', '').slice(0, 160))
    if (/error/i.test(t) && !/404|\[sound\]/.test(t)) { errors.push(`${name}: ${t.slice(0, 200)}`); console.log(name, t.slice(0, 200)) }
  })
  page.on('pageerror', e => { errors.push(`${name}: ${e.message}`); console.log(name, 'pageerror', e.message) })
  await page.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${name}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
let fails = 0
const check = (ok, what, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`) }
const A = await open(1, 'ANN'), B = await open(2, 'BOB'), C = await open(3, 'CID')
const wait = ms => B.waitForTimeout(ms)
const press = async (p, k) => { await p.bringToFront(); await p.keyboard.press(k); await wait(220) }
const screen = p => p.evaluate(() => window.__dbg?.menus?.screen ?? null)
const lobby = p => p.evaluate(() => { const L = window.__p0.room.state.lobby; return L ? { id: L.id, phase: L.phase, owner: L.owner, field: L.field?.map(f => f.pid) ?? null } : null })
const racing = p => p.evaluate(() => {
  const d = window.__dbg, r = d.race
  return {
    online: !!d.online.race, t: r?.time ?? 0,
    humans: r?.racers.filter(x => x.human).map(x => ({ n: x.name, remote: !!x.remote, D: +x.D.toFixed(1), fin: x.finished })) ?? [],
    aiD: r?.racers.find(x => !x.human)?.D ?? 0, aiRemote: !!r?.racers.find(x => !x.human)?.remote,
  }
})
const toTitle = async p => { for (let k = 0; k < 20 && (await screen(p)) !== 'title'; k++) { await press(p, 'Space'); await wait(400) } }
const toOnline = async p => { await press(p, 'Space'); await wait(300); await press(p, 'ArrowRight'); await press(p, 'Space'); await wait(500) }
const finish = p => p.evaluate(() => { const d = window.__dbg, m = d.me, L = d.race.track.length; m.D = d.race.laps * L - 1.2; m.lap = d.race.laps; m.sp = m.vmax })
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(400) } return false }

for (const p of [A, B, C]) await toTitle(p)
// ---- 1. a lobby, two in it, a third watching
await toOnline(A); await press(A, 'Space'); await wait(300); await press(A, 'Space'); await wait(700)
check((await screen(A)) === 'lobby', 'A created a lobby', await screen(A))
await toOnline(B); await press(B, 'Space'); await wait(700)
check((await screen(B)) === 'lobby', 'B joined it')
await toOnline(C)
check((await screen(C)) === 'online', 'C watches the online screen')
// ---- 2. a race of two, to the line
await press(A, 'Space'); await wait(800)
check((await screen(A)) === 'machine' && (await screen(B)) === 'machine', 'A started: both pick')
await press(A, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space')
check(await until(async () => (await racing(A)).online && (await racing(B)).online), 'both in the race')
for (const p of [A, B]) { await p.bringToFront(); await p.keyboard.down('KeyW') }
await wait(12000)
let ra = await racing(A), rb = await racing(B)
check(ra.t > 0.5 && rb.t > 0.5 && Math.abs(ra.t - rb.t) < 0.5, 'the clocks agree', `${ra.t.toFixed(2)} / ${rb.t.toFixed(2)}`)
const bOnA = ra.humans.find(h => h.n === 'BOB'), bOwn = rb.humans.find(h => h.n === 'BOB')
check(bOnA?.remote && bOwn && !bOwn.remote && Math.abs(bOnA.D - bOwn.D) < 3, 'A sees B where B is', `${bOnA?.D} vs ${bOwn?.D}`)
check(Math.abs(ra.aiD - rb.aiD) < 3 && rb.aiRemote && !ra.aiRemote, 'the AI flown by A, drawn by B', `${ra.aiD.toFixed(1)} / ${rb.aiD.toFixed(1)}`)
check((await lobby(C))?.phase === 'race' && (await screen(C)) === 'online', 'C sees a race on')
await press(C, 'Space'); await wait(500)
check((await screen(C)) === 'online' && !(await C.evaluate(() => window.__dbg.online.isMember)), 'C cannot join a race on')
for (const p of [A, B]) { await p.bringToFront(); await p.keyboard.up('KeyW') }
await finish(A); await finish(B)
check(await until(async () => (await screen(A)) === 'results' && (await screen(B)) === 'results', 20000), 'both see the results')
check(await until(async () => (await lobby(C))?.phase === 'open', 15000), 'the lobby opens again when both finished', JSON.stringify(await lobby(C)))
// ---- 3. back to the lobby; C joins; a race of three
await press(A, 'Space'); await press(B, 'Space'); await wait(800)
check((await screen(A)) === 'lobby' && (await screen(B)) === 'lobby', 'A and B back in the lobby', `${await screen(A)} ${await screen(B)}`)
await press(C, 'Space'); await wait(700)
check((await screen(C)) === 'lobby', 'C joined')
await press(A, 'Space'); await wait(800)
for (const p of [A, B, C]) await press(p, 'Space')
check(await until(async () => (await racing(A)).online && (await racing(B)).online && (await racing(C)).online), 'three in the second race')
for (const p of [A, B, C]) { await p.bringToFront(); await p.keyboard.down('KeyW') }
await wait(9000)
// ---- 4. A (the AI's driver and the owner) leaves mid-race
const aiBefore = (await racing(B)).aiD
await A.evaluate(() => window.__leave())
await wait(500)
await A.close()
await wait(8000)
rb = await racing(B)
const rc = await racing(C)
check(rb.aiD > aiBefore + 5, 'the AI goes on without A', `${aiBefore.toFixed(1)} -> ${rb.aiD.toFixed(1)}`)
check(!rb.aiRemote, 'B flies the AI now')
check(Math.abs(rb.aiD - rc.aiD) < 4, 'B and C agree on the AI', `${rb.aiD.toFixed(1)} / ${rc.aiD.toFixed(1)}`)
for (const p of [B, C]) { await p.bringToFront(); await p.keyboard.up('KeyW') }
await finish(B); await finish(C)
check(await until(async () => (await screen(B)) === 'results' && (await screen(C)) === 'results', 20000), 'B and C finish')
for (const p of [B, C]) console.log('   probe', await p.evaluate(() => { const o = window.__dbg.online, r = window.__p0.room; return JSON.stringify({ me: o.me, host: r.host, isHost: r.isHost, players: r.players, gone: [...o.gone], lobby: r.state.lobby && { owner: r.state.lobby.owner, phase: r.state.lobby.phase }, ins: Object.keys(r.state).filter(k => k.startsWith('in:') && r.state[k]), live: o.live }) }))
check(await until(async () => (await lobby(B))?.phase === 'open', 20000), 'the lobby opens again without A', JSON.stringify(await lobby(B)))
const L = await lobby(B)
check(L && L.owner !== 1, 'the lobby went on to someone still here', JSON.stringify(L))
// ---- 5. back, the new owner starts; the owner leaves in the pick
await press(B, 'Space'); await press(C, 'Space'); await wait(800)
const ownerPage = (await lobby(B)).owner === 2 ? B : C, other = ownerPage === B ? C : B
await press(ownerPage, 'Space'); await wait(800)
check((await screen(other)) === 'machine', 'the other picks', await screen(other))
await press(ownerPage, 'Backspace'); await wait(500)
await press(other, 'Space')
check(await until(async () => (await racing(other)).online, 20000), 'the one left races after the owner left in the pick', JSON.stringify(await lobby(other)))
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
