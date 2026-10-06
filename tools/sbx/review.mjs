// Runs a build in the live sandbox shell like the review does (software rendering, no clicks), and reports
// when it started, its log with times, and the longest silence between the worker's messages (the
// sandbox stops a worker that says nothing for 3 s).
// node tools/sbx/review.mjs [base] [seconds]   base: a published version's folder or the local /exp/ server
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const seconds = Number(process.argv[3] ?? 16)
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
// a local build: its files served in place of a published version's (the sandbox loads code only from there)
// the shell only opens the lot's live version, and its CSP allows that version's folder: answer it from disk
const world = await (await fetch('https://project0.city/api/world')).json()
const find = o => { if (Array.isArray(o)) { for (const v of o) { const r = find(v); if (r) return r } } else if (o && typeof o === 'object') { if (o.id === 383 && o.experience) return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r } } return null }
const VER = process.env.V ?? find(world).experience.version
const LOCAL = `https://files.project0.city/x/383/${VER}/`
const base = process.argv[2] === 'local' || !process.argv[2] ? LOCAL : process.argv[2]
const root = new URL('../../', import.meta.url)
if (!process.env.LIVE) await context.route(LOCAL + '**', async route => {
  const rel = decodeURIComponent(route.request().url().slice(LOCAL.length).split('?')[0])
  const file = rel === 'bundle.js' ? new URL('tools/sbx/bundle.js', root) : new URL('experience/' + rel, root)
  try {
    const body = readFileSync(file)
    const type = rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.json') ? 'application/json' : rel.endsWith('.png') ? 'image/png' : rel.endsWith('.jpg') ? 'image/jpeg' : rel.endsWith('.mp3') ? 'audio/mpeg' : rel.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream'
    await route.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } })
  } catch { await route.fulfill({ status: 404, body: 'no', headers: { 'access-control-allow-origin': '*' } }) }
})
const page = await context.newPage()
const t0 = Date.now()
const T = () => ((Date.now() - t0) / 1000).toFixed(1)
page.on('console', m => { const s = m.text(); if (!/\[sound\]|\[music\]/.test(s)) console.log(T(), s.slice(0, 160)) })
page.on('pageerror', e => console.log(T(), 'pageerror', e.message))
await page.exposeFunction('__msg', t => { msgs.push([Date.now(), t]) })
const msgs = []
await page.addInitScript(() => { addEventListener('message', e => { if (e.data && e.data.t) { window.__msg(e.data.t); if (!/frame|hb/.test(e.data.t)) console.log('msg', JSON.stringify(e.data).slice(0, 300)) } }) })
await page.goto(`http://localhost:8383/tools/harness/prod.html?lot=383&v=${VER}&base=${encodeURIComponent(base)}`)
// like the review: two cores (the server's droplet), keys pressed, screenshots timed
if (process.env.CORES) execSync(`powershell -NoProfile -Command "Get-Process msedge | ForEach-Object { try { $_.ProcessorAffinity = ${(1 << Number(process.env.CORES)) - 1} } catch {} }"`)
await page.waitForFunction(() => window.__started, null, { timeout: 60000 }).catch(() => console.log('no start'))
const keys = ['KeyW', 'KeyA', 'KeyD', 'Space', 'KeyS', 'ArrowUp', 'ArrowLeft', 'KeyE', 'Enter', 'ShiftLeft']
const tStart = Date.now()
let k = 0
const shotsAt = [1.5, 4, 7, 10, 13]
while (Date.now() - tStart < seconds * 1000) {
  const t = (Date.now() - tStart) / 1000
  if (shotsAt.length && t >= shotsAt[0]) {
    shotsAt.shift()
    const s0 = Date.now()
    await page.screenshot({ type: 'jpeg', quality: 80, timeout: 60000 }).catch(e => console.log('screenshot failed', e.message.slice(0, 80)))
    console.log(T(), 'screenshot took', Date.now() - s0, 'ms')
  }
  const key = keys[k++ % keys.length]
  await page.keyboard.down(key)
  await page.waitForTimeout(350)
  await page.keyboard.up(key)
}
const started = await page.evaluate(() => window.__started)
let worst = 0, at = 0
for (let i = 1; i < msgs.length; i++) { const g = msgs[i][0] - msgs[i - 1][0]; if (g > worst) { worst = g; at = msgs[i - 1][0] - t0 } }
const kinds = {}
for (const [, t] of msgs) kinds[t] = (kinds[t] ?? 0) + 1
console.log('started', started, 'messages', JSON.stringify(kinds), 'longest silence', worst, 'ms at', (at / 1000).toFixed(1), 's')
console.log('host log', (await page.evaluate(() => window.__log)).slice(-8).join(' | '))
await browser.close()
