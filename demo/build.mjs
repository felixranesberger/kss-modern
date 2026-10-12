/**
 * Builds the public demo styleguide from `demo/content/`, which documents Verdant,
 * a small fictional design system made to show what kss-modern can do.
 *
 * Run `bun run build` first, this script imports the compiled library from `dist/`.
 *
 * Every URL in the output is relative, including the content assets below, so the demo
 * works from any path. GitHub Pages serves it from `/kss-modern/`.
 */
import process from 'node:process'
import fs from 'fs-extra'
// eslint-disable-next-line antfu/no-import-dist
import { buildStyleguide, logger } from '../dist/node/lib/index.mjs'

const CONTENT_DIR = './demo/content'
const OUT_DIR = process.env.DEMO_OUT_DIR ?? './demo-dist'
const CONTENT_ASSETS_DIR = `${OUT_DIR}/content-assets`
const CONTENT_ASSETS_URL = 'content-assets'

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/></svg>`

async function copyContentAssets() {
  await Promise.all(
    ['styles.css', 'css', 'js', 'themes'].map(entry =>
      fs.copy(`${CONTENT_DIR}/${entry}`, `${CONTENT_ASSETS_DIR}/${entry}`),
    ),
  )
}

(async () => {
  await fs.remove(OUT_DIR)

  const start = Date.now()
  const { errors } = await buildStyleguide({
    mode: 'production',
    outDir: OUT_DIR,
    contentDir: `${CONTENT_DIR}/`,
    projectTitle: 'kss-modern',
    allowSearchEngineIndexing: true,
    logoSignet: { svgContent: LOGO_SVG },
    brandColor: {
      light: '#15803d',
      dark: '#4ade80',
    },
    html: {
      lang: 'en',
      assets: {
        css: [{ src: `${CONTENT_ASSETS_URL}/styles.css` }],
        js: [{ src: `${CONTENT_ASSETS_URL}/js/main.js`, additionalAttributes: { type: 'module' } }],
      },
    },
    previewThemes: [
      { value: 'theme-dusk', label: 'Dusk' },
      { value: 'theme-ocean', label: 'Ocean', css: [`${CONTENT_ASSETS_URL}/themes/ocean.css`] },
    ],
  })

  await copyContentAssets()

  // GitHub Pages would otherwise run the output through Jekyll
  await fs.writeFile(`${OUT_DIR}/.nojekyll`, '')

  if (errors?.overwrittenSectionsIds?.length)
    logger.warn(`Duplicate section references: ${errors.overwrittenSectionsIds.join(', ')}`)

  logger.success(`Built demo into ${OUT_DIR} in ${Date.now() - start}ms`)
})()
