import fs from 'fs-extra'
import { createServer } from 'vite'
// eslint-disable-next-line antfu/no-import-dist
import { logger, watchStyleguide } from './dist/node/lib/index.mjs'

const CONTENT_DIR = './test-styleguide'
const OUT_DIR = './styleguide-export'
const CONTENT_ASSETS_DIR = `${OUT_DIR}/content-assets`

/**
 * Copy the preview assets the styleguide references into the served output.
 *
 * They are browser-native (no bundler): `styles.css` uses CSS `@import` and
 * `js/main.js` uses native ES module imports, so the whole `css/` and `js/`
 * trees are copied verbatim next to the entry files. The styleguide injects
 * them as regular assets, i.e. only into the fullpage preview iframes — never
 * the styleguide UI shell (that would require `type: 'overwriteStyleguide'`).
 */
async function copyContentAssets(): Promise<void> {
  await Promise.all([
    fs.copy(`${CONTENT_DIR}/styles.css`, `${CONTENT_ASSETS_DIR}/styles.css`),
    fs.copy(`${CONTENT_DIR}/css`, `${CONTENT_ASSETS_DIR}/css`),
    fs.copy(`${CONTENT_DIR}/js`, `${CONTENT_ASSETS_DIR}/js`),
    fs.copy(`${CONTENT_DIR}/icons`, `${CONTENT_ASSETS_DIR}/icons`),
  ])
}

(async () => {
  // clear the output directory
  await fs.remove(OUT_DIR)

  const buildStyleguideStart = Date.now()
  await watchStyleguide({
    mode: 'development',
    outDir: OUT_DIR,
    contentDir: `${CONTENT_DIR}/`,
    projectTitle: 'Test Styleguide',
    html: {
      lang: 'en',
      assets: {
        css: [{ src: '/content-assets/styles.css' }],
        js: [{ src: '/content-assets/js/main.js', additionalAttributes: { type: 'module' } }],
      },
    },
    launchInEditor: {
      rootDir: '/Users/franesberger/Documents/workspace/styleguide-rewrite/',
    },
    theme: {
      light: '#2563eb',
      dark: '#ffffff',
    },
    plugins: {
      ogImage: (section) => {
        const url = new URL('https://via.placeholder.com/1200x630.png')
        url.searchParams.append('header', section.header)
        url.searchParams.append('theme', '#2563eb')

        if (!section.hasMarkdownDescription && section.description) {
          url.searchParams.append('description', section.description)
        }

        return url.href
      },
    },
  }, () => {
    // re-copy on every rebuild so content CSS/JS edits reach the preview iframes
    copyContentAssets().catch(error => logger.error('Content asset copy failed', error))
    logger.success('Styleguide has been rebuilt')
  }, (error) => {
    logger.error('Styleguide build error occurred', error)
  })

  // initial copy — watchStyleguide does not fire onChange for the first build
  await copyContentAssets()

  logger.success(`Built styleguide in ${Date.now() - buildStyleguideStart}ms`)

  const server = await createServer({
    root: OUT_DIR,
    server: {
      host: true,
    },
    logLevel: 'info',
  })
  await server.listen()
  server.printUrls()
  server.bindCLIShortcuts({ print: true })
})()
