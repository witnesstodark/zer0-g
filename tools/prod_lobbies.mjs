// The list of lobbies on the live site as a guest (looking only): node tools/prod_lobbies.mjs
// guest's like refused with "sign in". Screenshots in shots/prod_lobbies/. node tools/prod_lobbies.mjs
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'prod_lobbies')
try { rmSync(out, { recursive: true, force: true }) } catch {}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const logs = []
page.on('console', m => { const t = m.text(); logs.push(t); if (/383/.test(t) && /error|did not/i.test(t)) console.log(t.slice(0, 200)) })
await page.goto('https://project0.city/')
await page.waitForTimeout(6000)
for (const label of ['Continue as guest', 'Just look around', "Let's go", 'Start']) { await page.getByText(label).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(600) }
await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); window.p0.player.position.set(l.x + 30, 22, l.z + 30) })
await page.waitForTimeout(4000)
await page.evaluate(() => { const l = window.p0.layout.lots.find(l => l.id === 383); window.p0.experiences.request(l) })
await page.waitForTimeout(9000)
await page.locator('iframe.experience').click({ position: { x: 640, y: 400 } }).catch(() => {})
await page.mouse.move(1270, 700)
await page.waitForTimeout(16000)
let n = 0
const shot = async name => page.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-${name}.png`) })
const press = async (k, ms = 700) => { await page.keyboard.press(k); await page.waitForTimeout(ms) }
await shot('title')
await press('Space', 1500); await press('ArrowRight'); await press('Space', 2500); await shot('list')
console.log('session', await page.evaluate(() => { const a = window.p0.experiences.active; return a ? JSON.stringify({ players: a.players?.size ?? null }) : 'none' }))
console.log('inside', await page.evaluate(() => !!window.p0.experiences.active))
console.log(logs.filter(l => /383/.test(l)).slice(-6).join('\n'))
await browser.close()
