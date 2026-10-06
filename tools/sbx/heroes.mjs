// The course cards' pictures as the game rendered them: shots/heroes/<k>.png and a sheet.  node tools/sbx/heroes.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const out = fileURLToPath(new URL('../../shots/heroes/', import.meta.url))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
page.on('pageerror', e => console.log('pageerror', e.message))
page.on('console', m => { if (m.type() === 'error') console.log(m.text().slice(0, 400)) })
await page.goto('http://localhost:8383/tools/harness/index.html')
await page.waitForFunction(() => window.__started, null, { timeout: 120000 })
// node tools/sbx/heroes.mjs '{"SKY PIPE": {"at": [8, -8], "r": 9, "yaw": 40, "pitch": 30}}'   (views to try)
const views = process.argv[2] ? JSON.parse(process.argv[2]) : null
const list = await page.evaluate(async views => {
  if (views) window.__dbg.heroes(views)
  const res = []
  for (const cv of window.__dbg.menus.heroes ?? []) {
    const b = await cv.convertToBlob({ type: 'image/png' })
    const buf = new Uint8Array(await b.arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    res.push(btoa(s))
  }
  return res
}, views)
const files = list.map((b64, k) => { const f = `${out}${k}.png`; writeFileSync(f, Buffer.from(b64, 'base64')); return f })
console.log('heroes', files.length)
await browser.close()
if (files.length) execFileSync('python', [fileURLToPath(new URL('./grid.py', import.meta.url)), `${out}sheet.png`, '3', '0.5', ...files], { stdio: 'inherit' })
