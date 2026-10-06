// A tour of the menus on the mock page: title, mode, machine, course (each mode), results and the cup standings.
// Screenshots in shots/menus/<tag>/.  node tools/sbx/menutour.mjs [tag]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const tag = process.argv[2] || 'now'
const out = fileURLToPath(new URL(`../../shots/menus/${tag}/`, import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { const t = m.text(); if (/error/i.test(t) && !/404/.test(t)) console.log(t.slice(0, 300)) })
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const key = async k => { await page.keyboard.press(k); await wait(350) }
const shot = async name => { await wait(250); await page.screenshot({ path: `${out}${name}.png` }) }
const screen = () => page.evaluate(() => window.__dbg.menus.screen)
// past the key gate and the intro, to the title
for (let k = 0; k < 20 && (await screen()) !== 'title'; k++) { await key('Space'); await wait(700) }
await wait(1200); await shot('1-title')
await key('Space'); await wait(900); await shot('2-mode')
await key('ArrowRight'); await wait(500); await shot('2b-mode-online')
await key('ArrowLeft'); await key('Space'); await wait(1200); await shot('3-machine')
await key('ArrowRight'); await key('ArrowDown'); await wait(800); await shot('3b-machine')
await key('Space'); await wait(700); await shot('4-course-gp')
await key('ArrowRight'); await wait(400); await shot('4b-course-gp-cup2')
await key('ArrowRight'); await wait(400); await shot('4c-course-gp-cup3')
await key('ArrowDown'); await key('ArrowLeft'); await wait(400); await shot('4d-course-gp-class')
await key('Backspace'); await key('Backspace'); await key('ArrowRight'); await key('ArrowRight'); await key('Space'); await wait(900); await key('Space'); await wait(700); await shot('5-course-ta')
await key('ArrowDown'); await key('ArrowRight'); await wait(400); await shot('5b-course-ta-2')
await key('Space'); await wait(7000)
await page.evaluate(() => { const d = window.__dbg, m = d.me, L = d.race.track.length; m.D = d.race.laps * L - 1.5; m.lap = d.race.laps; m.sp = m.vmax })
await wait(6500); await shot('6-results')
console.log('final screen', await screen())
await browser.close()
