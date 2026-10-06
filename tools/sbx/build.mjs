// Bundles the experience the way the server does (three from the sandbox's copy, its addons bundled in), into
// tools/sbx/bundle.js, to run a local build in the live sandbox shell. node tools/sbx/build.mjs
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')
const THREE = 'https://project0.city/sandbox/three-r186/three.module.js'
// three's addons from the local package (npm install), bundled in
const JSM = path.join(path.dirname(require.resolve('three')), '..', 'examples', 'jsm').split(path.sep).join('/') + '/'
await esbuild.build({
  entryPoints: [fileURLToPath(new URL('../../experience/main.js', import.meta.url))],
  bundle: true,
  format: 'esm',
  outfile: fileURLToPath(new URL('./bundle.js', import.meta.url)),
  logLevel: 'warning',
  plugins: [{
    name: 'three',
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: THREE, external: true }))
      b.onResolve({ filter: /^three\/addons\// }, a => ({ path: JSM + a.path.slice('three/addons/'.length) }))
    },
  }],
})
console.log('bundled')
