/**
 * Captures the README screenshots from the built demo.
 *
 *   bun run demo && node demo/screenshots.mjs
 *
 * Serves `demo-dist/` on a local port, drives it with Playwright and writes PNGs
 * into `docs/screenshots/`.
 */
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import fs from 'fs-extra'

const ROOT = path.resolve(process.env.DEMO_OUT_DIR ?? './demo-dist')
const OUT_DIR = path.resolve('./docs/screenshots')
const PORT = 4280
const VIEWPORT = { width: 1440, height: 900 }

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

function serve() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let file = path.join(ROOT, pathname)
    if (pathname.endsWith('/'))
      file = path.join(file, 'index.html')

    if (!file.startsWith(ROOT) || !(await fs.pathExists(file))) {
      res.writeHead(404).end()
      return
    }

    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(resolve => server.listen(PORT, () => resolve(server)))
}

/** Every shot: file name, page, color scheme and optional steps before capturing. */
const SHOTS = [
  { name: 'welcome', page: 'index.html', scheme: 'light' },
  { name: 'welcome-dark', page: 'index.html', scheme: 'dark' },
  { name: 'components-dark', page: 'preview-3.1.html', scheme: 'dark' },
  { name: 'dashboard', page: 'preview-4.3.html', scheme: 'light', scrollTo: '#section-4-3 iframe' },
  {
    name: 'theme-ocean',
    page: 'preview-4.2.html',
    scheme: 'light',
    scrollTo: '#section-4-2 iframe',
    async before(page) {
      await page.locator('[data-global-theme-select]').selectOption('theme-ocean')
    },
  },
  {
    name: 'search',
    page: 'preview-2.1.html',
    scheme: 'dark',
    async before(page) {
      await page.keyboard.press('ControlOrMeta+k')
      await page.keyboard.type('but', { delay: 60 })
    },
  },
]

async function capture(browser, shot) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: shot.scheme })
  const page = await context.newPage()
  await page.goto(`http://localhost:${PORT}/${shot.page}`, { waitUntil: 'networkidle' })
  // let the preview iframes settle their height and fonts
  await page.waitForTimeout(1200)

  if (shot.scrollTo) {
    await page.locator(shot.scrollTo).first().evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 96
      window.scrollTo({ top, behavior: 'instant' })
    })
  }

  if (shot.before)
    await shot.before(page)

  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT_DIR, `${shot.name}.png`) })
  await context.close()
}

(async () => {
  await fs.ensureDir(OUT_DIR)
  const server = await serve()
  const browser = await chromium.launch()

  try {
    for (const shot of SHOTS) {
      await capture(browser, shot)
      console.info(`captured ${shot.name}.png`)
    }
  }
  finally {
    await browser.close()
    server.close()
  }
})()
