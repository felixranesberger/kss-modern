/**
 * E2E test server setup script.
 * Generates the styleguide and serves it with a simple HTTP server for Playwright tests.
 */
import { createServer } from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
// eslint-disable-next-line antfu/no-import-dist
import { buildStyleguide } from '../../dist/node/lib/index.mjs'

const outDir = './styleguide-export-e2e'

// Clean stale output to prevent CSS hash mismatches
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true })
}

console.info('[E2E] Building styleguide...')
await buildStyleguide({
  mode: 'production',
  outDir,
  contentDir: './example-styleguide/',
  projectTitle: 'Test Styleguide',
  html: {
    lang: 'en',
    assets: {
      css: [],
      js: [],
    },
  },
  brandColor: {
    light: '#005075',
    dark: '#ffffff',
  },
  previewThemes: [
    { value: 'theme-midnight', label: 'Midnight', css: ['/e2e-theme-midnight.css'] },
    { value: 'theme-sunrise', label: 'Sunrise' },
  ],
})
console.info('[E2E] Styleguide built successfully.')

// A second, small styleguide for the mixin playground, served from /mixin-e2e/. Its project CSS
// is deliberately hostile (tests/fixtures/mixin-e2e/project.css) to prove the controls are isolated.
const mixinFixtureDir = './tests/fixtures/mixin-e2e'
const mixinOutDir = path.join(outDir, 'mixin-e2e')
await buildStyleguide({
  mode: 'production',
  outDir: mixinOutDir,
  contentDir: `${mixinFixtureDir}/`,
  projectTitle: 'Mixin Playground',
  cacheDir: false,
  html: {
    lang: 'en',
    assets: {
      css: [{ src: 'project.css' }],
      js: [{ src: 'project.js', additionalAttributes: { type: 'module' } }],
    },
  },
  brandColor: '#005075',
  previewThemes: [{ value: 'theme-midnight', label: 'Midnight' }],
})
fs.copyFileSync(path.join(mixinFixtureDir, 'project.css'), path.join(mixinOutDir, 'project.css'))
fs.copyFileSync(path.join(mixinFixtureDir, 'project.js'), path.join(mixinOutDir, 'project.js'))
console.info('[E2E] Mixin playground styleguide built successfully.')

// Stylesheet for the Midnight theme (tests/e2e/theme-css.spec.ts). The rule is deliberately
// unscoped, so it only ever takes effect if the theme's <link> was actually activated.
fs.writeFileSync(
  path.join(outDir, 'e2e-theme-midnight.css'),
  'body { background-color: rgb(11, 22, 33); }\n',
)

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  // serve by pathname only — `?modifier=` / `?theme=` query strings are read client-side
  let url = new URL(req.url || '/', 'http://localhost').pathname
  if (url.endsWith('/')) url += 'index.html'

  const filePath = path.join(outDir, url)
  const ext = path.extname(filePath)

  try {
    const content = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
    res.end(content)
  }
  catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(4173, () => {
  console.info('[E2E] Server running at http://localhost:4173/')
})
