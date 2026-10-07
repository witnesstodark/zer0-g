import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const context = await browser.newContext({ viewport: { width: 800, height: 450 } })
const pages = []
for (const [pid, n] of [[1, 'A'], [2, 'B']]) { const p = await context.newPage(); await p.goto(`http://localhost:8383/tools/harness/index.html?pid=${pid}&name=${n}`); await p.waitForFunction(() => window.__started, null, { timeout: 120000 }); pages.push(p) }
for (const p of pages) await p.evaluate(() => setInterval(() => window.__p0.room.input(1), 500))
await pages[0].waitForTimeout(1500)
const t0 = await Promise.all(pages.map(p => p.evaluate(() => [window.__p0.room.tick, performance.now()])))
await pages[0].waitForTimeout(5000)
const t1 = await Promise.all(pages.map(p => p.evaluate(() => [window.__p0.room.tick, performance.now()])))
console.log('ticks per second:', t1.map((t, i) => ((t[0] - t0[i][0]) / ((t[1] - t0[i][1]) / 1000)).toFixed(1)).join(' / '))
await browser.close()
