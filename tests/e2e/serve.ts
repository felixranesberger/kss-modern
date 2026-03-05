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
  theme: {
    light: '#005075',
    dark: '#ffffff',
  },
})
console.info('[E2E] Styleguide built successfully.')

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
  let url = req.url || '/'
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
