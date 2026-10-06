// The live version in project0.city's sandbox with a player's entity as the server sends it (entity/stefan/send.json):
// does their machine show on the select screen? Logs the experience's messages, screenshots into shots/prodentity/.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/prodentity/', import.meta.url))
mkdirSync(out, { recursive: true })
const world = await (await fetch('https://project0.city/api/world')).json()
const find = o => { if (Array.isArray(o)) { for (const v of o) { const r = find(v); if (r) return r } } else if (o && typeof o === 'object') { if (o.id === 383 && o.experience) return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r } } return null }
const VER = find(world).experience.version
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('console', m => { const t = m.text(); if (!/\[sound\]|\[music\]|X4122/.test(t)) console.log('console', t.slice(0, 300)) })
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto(`http://localhost:8383/tools/harness/prod.html?lot=383&v=${VER}&entity=${encodeURIComponent('http://localhost:8383/entity/stefan/send.json')}`)
await page.waitForFunction(() => window.__started, null, { timeout: 120000 }).catch(() => console.log('no start'))
const wait = ms => page.waitForTimeout(ms)
await page.mouse.click(640, 360); await wait(800); await page.mouse.click(640, 360); await wait(1500)
await page.mouse.click(640, 400); await wait(600)
await page.mouse.click(970, 350); await wait(1200)
await page.screenshot({ path: `${out}select.png` })
console.log('version', VER, 'log', (await page.evaluate(() => window.__log)).join(' | '))
await browser.close()
