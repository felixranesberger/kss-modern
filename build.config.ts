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

// The inline bundle is embedded as a classic <script>, so it cannot execute an
// `import` statement. Vite splits a module that a second entry also imports into
// a shared chunk, which would leave this script throwing on load — and since the
// page body stays `invisible` until that script runs, the whole styleguide would
// render blank. Fail the build instead of shipping that.
const previewInlineEntry = manifest['client/preview-inline.ts']
const previewInlineImports: string[] = [
  ...previewInlineEntry.imports ?? [],
  // a dynamic import emits a chunk the inline script would resolve against the
  // page URL rather than the assets directory — equally broken, so it fails too
  ...previewInlineEntry.dynamicImports ?? [],
]
if (previewInlineImports.length > 0) {
  throw new Error(
    `The inlined preview script must be self-contained, but it imports: ${previewInlineImports.join(', ')}.`
    + ` Keep modules used by client/preview-inline.ts out of the other client entries (see client/lib/iframe.ts).`,
  )
}

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
