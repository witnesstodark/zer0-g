// The city's prize (round 25): p0.win() only for a whole race in a Grand Prix or online on STANDARD or EXPERT
// finished without losing a machine, once a session; the rule on the main menu, the answer in the race and on
// the results. On the test page with ?prize=1 (the lot pays 50 a win, 10 winners). Screenshots in
// shots/prize/. node tools/sbx/prizecheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/prize/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errors = []
let wins = 0
page.on('pageerror', e => { errors.push(e.message); console.log('pageerror', e.message) })
page.on('console', m => { const t = m.text(); if (t.includes('[p0] win')) wins++; if (/error/i.test(t) && !/404|\[sound\]/.test(t)) errors.push(t) })
await page.goto('http://localhost:8383/tools/harness/index.html?auto=1&prize=1')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
let fails = 0
const check = (ok, what, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`) }
// the main menu says the rule
await page.evaluate(() => { const m = window.__dbg.menus; m.open('mode') })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}menu.png` })
const rule = await page.evaluate(() => window.__dbg.menus.prizeRule)
check(/FIRST 10 CLEAN RACES/.test(rule) && /45 TOKENS/.test(rule) && !/[()]/.test(rule), 'the rule on the main menu', rule)
// a race to its end: mode, class, and what happens on the way (a wreck: one machine lost)
const race = async (cfg, wreck = false, shot = '') => {
  await page.evaluate(c => { const d = window.__dbg; d.menus.hideAll(); d.menus.onStart({ machine: 0, engine: 0.5, course: 0, row: 0, ...c }) }, cfg)
  await page.waitForTimeout(9500)
  await page.evaluate(w => { const d = window.__dbg, m = d.me, L = d.race.track.length; if (w) m.lives = 2; m.D = d.race.laps * L - 2.0; m.lap = d.race.laps; m.sp = m.vmax; m.x = 0.3 }, wreck)
  await page.waitForFunction(() => window.__dbg.me.finished, null, { timeout: 15000 })
  await page.waitForTimeout(900)
  if (shot) await page.screenshot({ path: `${out}${shot}-race.png` })
  await page.waitForFunction(() => window.__dbg.menus.screen === 'results', null, { timeout: 12000 })
  await page.waitForTimeout(500)
  if (shot) await page.screenshot({ path: `${out}${shot}-results.png` })
  return page.evaluate(() => window.__dbg.menus.prize)
}
let before = wins
await race({ mode: 'gp', cls: 1 }, true)
check(wins === before, 'a race with a machine lost: no win')
before = wins
await race({ mode: 'gp', cls: 0 })
check(wins === before, 'NOVICE: no win')
before = wins
await race({ mode: 'ta', cls: 1 })
check(wins === before, 'a time attack alone: no win')
before = wins
const prize = await race({ mode: 'gp', cls: 1 }, false, 'clean')
check(wins === before + 1, 'a clean Grand Prix race on STANDARD: one win')
check(prize?.ok && /\+45 TOKENS/.test(prize.text), 'the answer shown', JSON.stringify(prize))
before = wins
const again = await race({ mode: 'gp', cls: 2 })
check(wins === before, 'a second clean race (EXPERT) in the session: no second win')
check(again === null, 'and its results say nothing of a prize', JSON.stringify(again))
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 6).join('\n')}` : 'no errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await browser.close()
