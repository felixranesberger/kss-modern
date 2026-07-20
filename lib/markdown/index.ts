import type { CodeToHastOptions, HighlighterCore } from 'shiki/core'
import htmlLang from '@shikijs/langs/html'
import markdownLang from '@shikijs/langs/markdown'
import scssLang from '@shikijs/langs/scss'
import shellscriptLang from '@shikijs/langs/shellscript'
import typescriptLang from '@shikijs/langs/typescript'
import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import auroraX from '@shikijs/themes/aurora-x'
import githubLightDefault from '@shikijs/themes/github-light-default'
import fs from 'fs-extra'
import MarkdownItAsync from 'markdown-it-async'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { logger } from '../logger.ts'
import { accordionRenderer } from './plugins/components/accordion.ts'
import { alertRenderer } from './plugins/components/alert.ts'
import { markdownItComponent } from './plugins/custom-component-renderer.ts'

let md: ReturnType<typeof MarkdownItAsync> | undefined

let highlighter: HighlighterCore | undefined
let loadedLanguages: Set<string> | undefined

/**
 * Highlights a markdown code fence with a fine-grained Shiki core highlighter.
 *
 * Only the languages actually used in styleguide docs are bundled (html, scss,
 * ts/bash via their grammars, markdown) plus the two preview themes. This keeps
 * the published bundle small instead of pulling Shiki's entire grammar/theme set
 * in via the `shiki` barrel import. The JavaScript regex engine is used (Shiki's
 * recommendation for smaller bundles / faster startup) so no Oniguruma wasm ships.
 */
async function highlightCodeToHtml(code: string, options: CodeToHastOptions): Promise<string> {
  if (!highlighter) {
    highlighter = await createHighlighterCore({
      themes: [githubLightDefault, auroraX],
      langs: [htmlLang, scssLang, typescriptLang, shellscriptLang, markdownLang],
      engine: createJavaScriptRegexEngine(),
    })
    loadedLanguages = new Set(highlighter.getLoadedLanguages())
  }

  // Core highlighters throw on an unloaded language, so any fence whose language
  // we didn't bundle (or a typo) falls back to the built-in plaintext grammar.
  const lang = loadedLanguages!.has(options.lang) ? options.lang : 'text'
  return highlighter.codeToHtml(code, { ...options, lang })
}

/**
 * Shifts heading levels in a markdown string based on a root heading level.
 */
function shiftHeadingLevels(markdownContent: string, rootHeadingLevel: 1 | 2): string {
  const getHasHeadingLevel = (level: number) => new RegExp(`^#{${level}} `, 'm').test(markdownContent)

  const shiftDown = (shiftAmount: number) => {
    return markdownContent.replace(/^(#{1,6}) (.*)$/gm, (_, hashes, text) => {
      const newLevel = Math.min(hashes.length + shiftAmount, 6)
      return `${'#'.repeat(newLevel)} ${text}`
    })
  }

  const hasH1 = getHasHeadingLevel(1)
  const hasH2 = getHasHeadingLevel(2)

  if (rootHeadingLevel === 1 && hasH1) {
    return shiftDown(1)
  }

  if (rootHeadingLevel === 2 && (hasH1 || hasH2)) {
    const shiftDownLevel = hasH1 ? 2 : 1
    return shiftDown(shiftDownLevel)
  }

  return markdownContent
}

interface MarkdownOptionsBase {
  rootHeadingLevel: 1 | 2
}

/** Lazily create the shared markdown-it instance (parser + component + Shiki plugins). */
function getMarkdownRenderer(): ReturnType<typeof MarkdownItAsync> {
  if (!md) {
    md = MarkdownItAsync({ linkify: true, typographer: true })
    md.use(markdownItComponent, {
      components: {
        alert: alertRenderer,
        accordion: accordionRenderer,
      },
    })
    md.use(
      fromAsyncCodeToHtml(
        highlightCodeToHtml,
        {
          themes: {
            light: 'github-light-default',
            dark: 'aurora-x',
          },
        },
      ),
    )
  }
  return md
}

/**
 * Rendered-HTML cache, keyed on the exact (post heading-shift) markdown source.
 *
 * `renderAsync` is a pure function of its input for our fixed `md` configuration, and its cost is
 * dominated by Shiki highlighting every code fence. A structural rebuild — any css/scss KSS-comment
 * or `.md` edit, see `parse()` in `../parser.ts` — re-runs the full section parse, so WITHOUT this
 * cache every unchanged description is re-rendered (and re-highlighted) on each rebuild. Keying on
 * the shifted source string is collision-free across heading levels: it is the whole of what the
 * renderer sees, so file- and inline-sourced markdown correctly share one cache. Re-reading a file
 * each build is cheap and makes the content itself the cache key, so edits invalidate for free
 * without any mtime/signature bookkeeping.
 *
 * The value is the in-flight promise so concurrent identical renders coalesce; a rejected render is
 * evicted so it can be retried rather than the failure being cached. FIFO-capped because inline
 * descriptions are keyed by content (unlike the pug parse cache, which is bounded by filename), so
 * a long editing session must not grow the map without bound.
 */
const RENDER_CACHE_MAX_ENTRIES = 2000
const renderCache = new Map<string, Promise<string>>()
let cacheHits = 0
let cacheMisses = 0

async function renderMarkdownCached(source: string): Promise<string> {
  const cached = renderCache.get(source)
  if (cached !== undefined) {
    cacheHits++
    return cached
  }

  cacheMisses++
  const promise = getMarkdownRenderer().renderAsync(source)
  renderCache.set(source, promise)

  // don't let a failed render poison the cache — drop it so a later build can retry
  promise.catch(() => {
    if (renderCache.get(source) === promise)
      renderCache.delete(source)
  })

  // FIFO eviction (Map preserves insertion order); never evict the entry we just added
  if (renderCache.size > RENDER_CACHE_MAX_ENTRIES) {
    const oldest = renderCache.keys().next().value
    if (oldest !== undefined && oldest !== source)
      renderCache.delete(oldest)
  }

  return promise
}

/** Drop all cached rendered markdown (test isolation; the cache is otherwise process-lifetime). */
export function clearMarkdownCache(): void {
  renderCache.clear()
  cacheHits = 0
  cacheMisses = 0
}

/** Hit/miss counters since the last clear, plus how many sources are cached (dev diagnostics). */
export function getMarkdownCacheStats(): { hits: number, misses: number, size: number } {
  return { hits: cacheHits, misses: cacheMisses, size: renderCache.size }
}

/**
 * Parse markdown file to HTML
 */
export async function parseMarkdown(data: MarkdownOptionsBase & {
  filePath: string
} | MarkdownOptionsBase & {
  markdownContent: string
}) {
  if ('filePath' in data) {
    const doesFileExist = fs.existsSync(data.filePath)
    if (!doesFileExist) {
      logger.error(`Markdown file not found: "${data.filePath}"`)
      return '<p class="font-bold text-red-600">Error: Markdown file not found!</p>'
    }

    let fileContent = await fs.readFile(data.filePath, 'utf8')

    // shift heading levels if necessary
    fileContent = shiftHeadingLevels(fileContent, data.rootHeadingLevel)

    const parsedMarkdown = await renderMarkdownCached(fileContent)

    return parsedMarkdown
  }
  // Markdown can also be directly passed as string inside the scss file
  else {
    let fileContent = data.markdownContent
      // remove markdown specifier
      .replace('Markdown:', '')

    // shift heading levels if necessary
    fileContent = shiftHeadingLevels(fileContent, data.rootHeadingLevel)

    return await renderMarkdownCached(fileContent)
  }
}
