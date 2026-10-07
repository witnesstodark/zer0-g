// The main menu's tiles, MY MACHINE and the GALLERY on the mock page (?entity=stefan: a machine of your own; NONE=1:
// without one). Screenshots in shots/garage/.  node tools/sbx/garagecheck.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/garage/', import.meta.url))
mkdirSync(out, { recursive: true })
const none = !!process.env.NONE
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { const t = m.text(); if (/error|did not/i.test(t) && !/404/.test(t)) console.log(t.slice(0, 300)) })
await page.goto(`http://localhost:8383/tools/harness/index.html${none ? '' : '?entity=stefan'}`)
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
const wait = ms => page.waitForTimeout(ms)
const key = async k => { await page.keyboard.press(k); await wait(350) }
const screen = () => page.evaluate(() => window.__dbg.menus.screen)
const tag = none ? 'none-' : ''
for (let k = 0; k < 20 && (await screen()) !== 'title'; k++) { await key('Space'); await wait(600) }
await key('Space'); await wait(1500); await page.screenshot({ path: `${out}${tag}1-menu.png` })
await key('ArrowRight'); await key('ArrowDown'); await wait(300); await page.screenshot({ path: `${out}${tag}2-menu-my.png` })
await key('Space'); await wait(1500); await page.screenshot({ path: `${out}${tag}3-garage.png` }); console.log('garage:', await screen())
await key('Backspace'); await wait(500); await key('ArrowDown'); await key('Space'); await wait(4000)
await page.screenshot({ path: `${out}${tag}4-gallery.png` }); console.log('gallery:', await screen(), await page.evaluate(() => { const g = window.__dbg.menus.gal; return `${g.list?.length} machines, at ${g.at}, pilot ${!!g.pilot}` }))
await key('ArrowRight'); await wait(3000); await page.screenshot({ path: `${out}${tag}5-gallery-2.png` })
await key('ArrowRight'); await wait(3000); await page.screenshot({ path: `${out}${tag}6-gallery-3.png` })
await browser.close()
