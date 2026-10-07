// ONLINE RACE on the live site with two guests (two separate browsers): A creates a lobby and waits in it a minute,
// B joins, A starts, both lock in a machine, both race. Screenshots of both in shots/prod_duo/, the games' online
// log lines printed. node tools/prod_duo.mjs [seconds A waits in the lobby]
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'prod_duo')
import { rmSync } from 'node:fs'
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const lobbyWait = Number(process.argv[2] ?? 60)
const browser = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
const logs = []
const join = async name => {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 620 } })).newPage()
  page.on('console', m => { const t = m.text(); logs.push(`${name} ${m.type()}: ${t.slice(0, 300)}`); if (/\[online\]|did not start|did not load|error/i.test(t) && /383/.test(t)) console.log(name, t.slice(0, 200)) })
  page.on('pageerror', e => console.log(name, 'pageerror', e.message))
  await page.goto('https://project0.city/')
  await page.waitForTimeout(6000)
  for (const label of ['Continue as guest', 'Just look around', "Let's go", 'Start']) { await page.getByText(label).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(600) }
  await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); const p = window.p0.player; p.position.set(l.x + 30, 22, l.z + 30) })
  await page.waitForTimeout(4000)
  await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); window.p0.experiences.request(l) })
  await page.waitForTimeout(9000)
  await page.locator('iframe.experience').click({ position: { x: 550, y: 330 } }).catch(e => console.log(name, 'click', e.message))
  await page.mouse.move(1090, 610)           // out of the way: a card under the pointer would be chosen by hovering
  await page.waitForTimeout(16000)           // the intro, then the title
  return page
}
let n = 0
const shot = async (p, name) => p.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-${name}.png`) })
const press = async (p, k, ms = 700) => { await p.keyboard.press(k); await p.waitForTimeout(ms) }
const [A, B] = await Promise.all([join('A'), join('B')])
await shot(A, 'A-title'); await shot(B, 'B-title')
// A: mode -> ONLINE RACE -> the online screen -> create: the course screen -> create the lobby
await press(A, 'Space'); await press(A, 'ArrowRight'); await press(A, 'Space', 1200); await shot(A, 'A-online')
await press(A, 'Space', 1000); await shot(A, 'A-course')
await press(A, 'Space', 1500); await shot(A, 'A-lobby')
// B: to the online screen, watching
await press(B, 'Space'); await press(B, 'ArrowRight'); await press(B, 'Space', 1200); await shot(B, 'B-online')
for (let t = 15; t <= lobbyWait; t += 15) { await A.waitForTimeout(15000); await shot(A, `A-lobby-${t}s`); await shot(B, `B-online-${t}s`) }
// B joins, A starts, both lock in
await press(B, 'ArrowDown'); await press(B, 'Space', 1500); await shot(B, 'B-joined'); await shot(A, 'A-lobby-2')
await press(A, 'Space', 1500); await shot(A, 'A-pick'); await shot(B, 'B-pick')
await press(A, 'Space', 800); await press(B, 'ArrowRight'); await press(B, 'Space', 800)
await shot(A, 'A-locked'); await shot(B, 'B-locked')
for (const t of [3, 6, 9, 12, 16, 20]) {
  await A.waitForTimeout(t <= 12 ? 3000 : 4000)
  if (t === 9) { await A.keyboard.down('KeyW'); await B.keyboard.down('KeyW') }
  await shot(A, `A-race-${t}s`); await shot(B, `B-race-${t}s`)
}
writeFileSync(path.join(out, 'log.txt'), logs.join('\n'))
console.log(logs.filter(l => /\[online\]|did not|pageerror|error/i.test(l)).slice(-30).join('\n'))
await browser.close()
