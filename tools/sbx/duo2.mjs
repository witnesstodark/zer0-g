// Two players online on the mock page, A with a machine of its own (?entity=stefan) and picking it: A creates the
// lobby and waits in it a long while (nobody may be thrown out), B joins, A starts, both lock in; both must reach
// the race and keep running (the frame counter moving). node tools/sbx/duo2.mjs [wait seconds in the lobby]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/duo2/', import.meta.url))
mkdirSync(out, { recursive: true })
const lobbyWait = Number(process.argv[2] ?? 40)
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
const open = async (pid, name, extra = '') => {
  const page = await context.newPage()
  page.on('console', m => { const t = m.text(); if (/error|\[online\]|did not load/i.test(t) && !/404|\[sound\]/.test(t)) console.log(name, t.slice(0, 240)) })
  page.on('pageerror', e => console.log(name, 'pageerror', e.message))
  await page.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${name}${extra}`)
  await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
  return page
}
const A = await open(1, 'STEFAN', '&entity=stefan')
const B = await open(2, 'FRIEND')
const wait = ms => A.waitForTimeout(ms)
const press = async (p, k) => { await p.bringToFront(); await p.keyboard.press(k); await wait(250) }
const screen = p => p.evaluate(() => window.__dbg?.menus?.screen ?? '?')
const lobby = p => p.evaluate(() => { const L = window.__p0.room.state.lobby; return L ? `${L.phase} owner=${L.owner} field=${JSON.stringify(L.field?.map(f => f.pid + ':' + f.m) ?? null)}` : 'none' })
const frames = p => p.evaluate(() => window.__dbg?.race?.time ?? -1)
for (const p of [A, B]) { for (let k = 0; k < 20 && (await screen(p)) !== 'title'; k++) { await press(p, 'Space'); await wait(500) } }
// A: ONLINE RACE -> create a lobby, then wait in it
await press(A, 'Space'); await press(A, 'ArrowRight'); await press(A, 'Space'); await wait(400)
await press(A, 'Space'); await wait(300); await press(A, 'Space'); await wait(800)
console.log('A created:', await lobby(A), 'A on', await screen(A))
// B looks at ONLINE RACE meanwhile (its clock running, its unstick watching)
await press(B, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(500)
for (let t = 0; t < lobbyWait; t += 10) { await wait(10000); console.log(`${t + 10} s in the lobby: A on`, await screen(A), '|', await lobby(A), '| B on', await screen(B)) }
// B joins, A starts
await press(B, 'Space'); await wait(800); console.log('B joined: B on', await screen(B), '|', await lobby(B))
await press(A, 'Space'); await wait(1000); console.log('A started: A on', await screen(A), 'B on', await screen(B), '|', await lobby(A))
// A picks its own machine (the last tile: left from the first), B a stock one
await press(A, 'ArrowLeft'); await press(A, 'Space'); await wait(500)
await press(B, 'ArrowRight'); await press(B, 'Space'); await wait(500)
console.log('both locked:', await lobby(A))
for (let k = 0; k < 6; k++) {
  await wait(2000)
  const [fa, fb] = [await frames(A), await frames(B)]
  console.log(`after ${(k + 1) * 2} s: A on`, await screen(A), 'race t', fa.toFixed?.(2), '| B on', await screen(B), 'race t', fb.toFixed?.(2), '|', await lobby(A))
  if (k === 3) { await A.screenshot({ path: `${out}A.png` }); await B.screenshot({ path: `${out}B.png` }) }
}
await browser.close()
