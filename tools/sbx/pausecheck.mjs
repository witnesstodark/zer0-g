// The pause (round 26): Backspace in a race that is not online stops the game under a plate (the clock and the
// machines stand still), Backspace again goes on; RESTART starts the race again from its grid; QUIT goes to the
// menu; it works in the countdown too. Screenshot in shots/pause/. node tools/sbx/pausecheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/pause/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.log('pageerror', e.message) })
page.on('console', m => { const t = m.text(); if (/error/i.test(t) && !/404|\[sound\]/.test(t)) errors.push(t) })
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
let fails = 0
const check = (ok, what, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`) }
const wait = ms => page.waitForTimeout(ms)
const key = async k => { await page.keyboard.press(k); await wait(250) }
const st = () => page.evaluate(() => { const d = window.__dbg; return { t: +d.race.time.toFixed(3), D: d.me ? +d.me.D.toFixed(2) : null, dim: d.hud.dim.visible, plate: d.hud.pauseP.visible, screen: d.menus.screen, race: d.race.racers.length, started: d.race.started } })
await page.evaluate(() => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ mode: 'gp', machine: 0, engine: 0.5, cls: 1, course: 0, row: 0 }) })
await wait(10000)
await key('Backspace')
const a = await st(); await wait(1200); const b = await st()
await page.screenshot({ path: `${out}paused.png` })
check(a.dim && a.plate, 'Backspace: the plate over the dimmed race')
check(a.t === b.t && a.D === b.D, 'the clock and the machine stand still', `${a.t} / ${b.t}, ${a.D} / ${b.D}`)
await key('Backspace'); await wait(800)
const c = await st()
check(!c.dim && !c.plate && c.t > b.t, 'Backspace again: the race goes on', `${b.t} -> ${c.t}`)
await key('Backspace'); await key('ArrowDown'); await key('Space'); await wait(600)
const d = await page.evaluate(() => { const d = window.__dbg; return { state: d.race.started, t: d.race.time, D: d.me.D, plate: d.hud.pauseP.visible } })
check(!d.plate && d.t <= 0 && d.D < 5, 'RESTART: the race again from the grid', JSON.stringify(d))
await wait(4500)                     // into the countdown
await key('Backspace')
const e1 = await st(); await wait(1000); const e2 = await st()
check(e1.plate && e1.t === e2.t, 'paused in the countdown too, the lights stand still', `${e1.t} / ${e2.t}`)
await key('ArrowDown'); await key('ArrowDown'); await key('Space'); await wait(1200)
const f = await st()
check(!f.plate && f.screen === 'mode', 'QUIT: back to the menu', f.screen)
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 6).join('\n')}` : 'no errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
