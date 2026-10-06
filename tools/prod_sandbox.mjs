// The published HYPERLANE in the live sandbox (project0.city's shell, runtime and files), hosted by a local
// stand-in for the game page (tools/harness/prod.html): the intro, the menus, a race start, screenshots.
// node tools/prod_sandbox.mjs <version> [race seconds]   (python -m http.server 8383 in this card's folder)
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots', 'prod')
mkdirSync(out, { recursive: true })
const version = process.argv[2], raceSeconds = Number(process.argv[3] ?? 12)
const browser = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const logs = []
page.on('console', m => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`))
page.on('pageerror', e => logs.push('pageerror: ' + e.message))
await page.goto(`http://localhost:8383/tools/harness/prod.html?lot=383&v=${version}`)
await page.waitForFunction(() => window.__started, null, { timeout: 120000 }).catch(() => console.log('no start; log', logs.slice(-10).join('\n')))
let n = 0
const shot = async name => { await page.screenshot({ path: path.join(out, `${String(n++).padStart(2, '0')}-${name}.png`) }); console.log('shot', name) }
await page.waitForTimeout(4000)
await shot('waiting')
await page.locator('iframe').click({ position: { x: 640, y: 400 } })
for (const [ms, name] of [[2000, 'intro-1'], [3500, 'intro-2'], [3500, 'intro-3'], [3000, 'intro-slam'], [1500, 'title']]) { await page.waitForTimeout(ms); await shot(name) }
for (const [key, name, ms] of [['Space', 'mode', 700], ['Space', 'machine', 1000], ['ArrowRight', 'machine-2', 900], ['Space', 'course', 700], ['Space', 'grid', 2000]]) {
  await page.keyboard.press(key); await page.waitForTimeout(ms); await shot(name)
}
await page.waitForTimeout(2300); await shot('countdown')
await page.waitForTimeout(2600)
await page.keyboard.down('KeyW')
for (let t = 0; t < raceSeconds; t += 2) { await page.waitForTimeout(2000); await shot('race') }
const hostLog = await page.evaluate(() => window.__log)
writeFileSync(path.join(out, 'log.txt'), logs.join('\n') + '\n--- host\n' + hostLog.join('\n'))
console.log('host log', hostLog.slice(0, 20).join(' | '))
console.log(logs.filter(l => /error|warn/i.test(l)).slice(-10).join('\n'))
await browser.close()
