// A server update in the middle of online play (two tabs sharing a session; __drop gives everyone new ids, and
// with restart an empty state): A's lobby with B in it must survive a blink and a restart, and a race must go on
// with each seeing the other move. node tools/sbx/dropcheck.mjs
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 900, height: 506 } })
const open = async (pid, name) => {
  const page = await context.newPage()
  page.on('console', m => { const t = m.text(); if (/\[online\]|error/i.test(t) && !/404|\[sound\]/.test(t)) console.log(name, t.slice(0, 200)) })
  page.on('pageerror', e => console.log(name, 'pageerror', e.message))
  await page.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${name}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
const A = await open(1, 'STEFAN'), B = await open(2, 'FRIEND')
const wait = ms => A.waitForTimeout(ms)
const press = async (p, k) => { await p.bringToFront(); await p.keyboard.press(k); await wait(250) }
const screen = p => p.evaluate(() => window.__dbg?.menus?.screen ?? 'race')
const view = async p => p.evaluate(() => { const s = window.__p0.room.state, L = s.lobby; return `me=${window.__p0.me.id} lobby=${L ? `${L.id}:${L.phase} owner=${L.owner}` : 'none'} in=[${Object.keys(s).filter(k => k.startsWith('in:') && s[k]).join(',')}]` })
for (const p of [A, B]) { for (let k = 0; k < 20 && (await screen(p)) !== 'title'; k++) { await press(p, 'Space'); await wait(500) } }
await press(A, 'Space'); await press(A, 'ArrowRight'); await press(A, 'Space'); await wait(400); await press(A, 'Space'); await wait(300); await press(A, 'Space'); await wait(800)
await press(B, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(500); await press(B, 'Space'); await wait(800)
console.log('in the lobby:  A', await screen(A), await view(A), '| B', await screen(B))
await A.evaluate(() => window.__drop(false)); await wait(4000)
console.log('after a blink: A', await screen(A), await view(A), '| B', await screen(B), await view(B))
await A.evaluate(() => window.__drop(true)); await wait(5000)
console.log('after a restart: A', await screen(A), await view(A), '| B', await screen(B), await view(B))
// the race, and a restart in it
await press(A, 'Space'); await wait(1000); await press(A, 'Space'); await press(B, 'Space'); await wait(9000)
for (const p of [A, B]) { await p.bringToFront(); await p.keyboard.down('KeyW') }
await wait(3000)
const seen = p => p.evaluate(() => { const r = window.__dbg.race; return r.racers.filter(x => x.human).map(x => `${x.name}${x.remote ? '(remote)' : ''} D=${x.D.toFixed(1)}`).join(' | ') })
console.log('racing:        A sees', await seen(A), '|| B sees', await seen(B))
await A.evaluate(() => window.__drop(true)); await wait(5000)
console.log('after a restart in the race: A sees', await seen(A), '|| B sees', await seen(B))
await wait(4000)
console.log('4 s on:        A sees', await seen(A), '|| B sees', await seen(B))
await browser.close()
