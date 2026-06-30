import fs from 'fs-extra'
import { defineBuildConfig } from 'unbuild'

const manifest = JSON.parse(fs.readFileSync('./dist/styleguide-assets/.vite/manifest.json', 'utf-8'))

const hashedFileNames = {
  'fullpage.js': manifest['client/fullpage.ts'].file,
  'preview.js': manifest['client/preview.ts'].file,
  'preview-inline.js': manifest['client/preview-inline.ts'].file,
  'style.css': manifest['style.css'].file,
} as const

// The markdown highlighter (lib/markdown) imports a fine-grained Shiki bundle by
// subpath (@shikijs/core, the oniguruma engine, and only the few langs/themes we
// use). Those resolve transitively through `shiki`, so they are not direct
// package.json deps and unbuild would otherwise try to inline them — keep the
// whole `shiki` / `@shikijs/*` scope external, plus the handful of non-scoped
// transitive helpers that `@shikijs/core` + the engine pull in.
const shikiExternalPackages: (string | RegExp)[] = [
  /^shiki(\/.*)?$/,
  /^@shikijs\//,
  'oniguruma-to-es',
  'hast-util-to-html',
  'emoji-regex-xs',
  'regex/internals',
  'regex-recursion',
  'html-void-elements',
  'property-information',
  'regex-utilities',
  'zwitch',
  'stringify-entities',
  'ccount',
  'comma-separated-tokens',
  'space-separated-tokens',
  'hast-util-whitespace',
  'character-entities-legacy',
  'character-entities-html4',
]

function escapeForTemplateLiteral(str: string) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
}

const previewInlineFilePath = `dist/styleguide-assets/${hashedFileNames['preview-inline.js']}`
if (!fs.existsSync(previewInlineFilePath))
  throw new Error(`File not found: ${previewInlineFilePath}`)

const previewInlineContent = `<script>
  ${escapeForTemplateLiteral(fs.readFileSync(previewInlineFilePath, 'utf-8'))};
</script>`

export default defineBuildConfig({
  outDir: 'dist/node',
  entries: ['./lib/index', './lib/pug/worker'],
  declaration: true,
  failOnWarn: false,
  externals: ['@antfu/utils', ...shikiExternalPackages],
  replace: {
    __STYLEGUIDE_CSS__: hashedFileNames['style.css'],
    __STYLEGUIDE_PREVIEW_JS__: hashedFileNames['preview.js'],
    __STYLEGUIDE_PREVIEW_INLINE__: previewInlineContent,
    __STYLEGUIDE_FULLPAGE_JS__: hashedFileNames['fullpage.js'],
  },
})
