import type { Biome } from '@biomejs/js-api'
import type { StyleguideConfiguration } from '../index'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import pug from 'pug'
import { sectionSanitizeId } from '../../client/utils.ts'
import { logger } from '../logger.ts'
import { fixAccessibilityIssues, INSERT_VITE_PUG_TAG_RE, PUG_MODIFIER_CLASS_RE, PUG_SRC_RE } from '../shared.ts'
import { installPugParseCache } from './parse-cache.ts'

export type Mode = StyleguideConfiguration['mode']

// Memoise pug's per-file lex+parse across sections. Installed here so it covers every place a
// section compiles — the main thread (small inline rebuilds) and each worker thread (which imports
// this module separately and patches its own pug-load). Lex+parse dominates compile time, and a
// shared include tree is otherwise re-parsed once per dependent section. See ./parse-cache.ts.
installPugParseCache()

/** Where a section's compile time went, summed over the entry file and any <insert-vite-pug> tags. */
export interface CompileTimings {
  /** Reading the entry file + all includes/extends off disk (file I/O only). */
  read: number
  /** pug lex + parse + codegen (CPU; excludes the include reads). */
  parse: number
  /** Executing the compiled template function (pure render). */
  render: number
  /** `fixAccessibilityIssues` post-processing. */
  a11y: number
}

export interface CompileResult {
  /** Final HTML: pug-compiled, formatted, accessibility-fixed. */
  html: string
  /** Absolute paths of every file this section's markup depends on (entry pug/html + includes/extends). */
  dependencies: string[]
  /** Per-phase wall-clock for this section's compile (diagnostics). */
  timings: CompileTimings
}

// Memoised Biome instance + project key, created on first use (production formatting only) and
// reused for the process lifetime.
let biomePromise: Promise<{ biome: Biome, projectKey: number }> | undefined

function getBiome(): Promise<{ biome: Biome, projectKey: number }> {
  biomePromise ??= (async () => {
    // Loaded lazily: Biome only formats in production, so dev never pays this (heavy) import,
    // and worker threads no longer load it at boot.
    const { Biome, Distribution } = await import('@biomejs/js-api')
    const biome = await Biome.create({ distribution: Distribution.NODE })
    const { projectKey } = biome.openProject('.')

    biome.applyConfiguration(projectKey, {
      html: {
        formatter: {
          lineWidth: 100,
          whitespaceSensitivity: 'ignore',
          attributePosition: 'multiline',
        },
      },
    })

    return { biome, projectKey }
  })()

  return biomePromise
}

async function biomeFormat(content: string): Promise<string> {
  try {
    const { biome, projectKey } = await getBiome()

    // Try to format with Biome HTML support (experimental)
    const result = biome.formatContent(projectKey, content, {
      filePath: 'example.html',
    })

    // Check if there are any fatal errors in diagnostics
    const hasFatalErrors = result.diagnostics?.some(
      (diag: any) => diag.severity === 'fatal' || diag.severity === 'error',
    )

    if (hasFatalErrors) {
      logger.warn('Biome HTML formatting has errors, falling back to original content')
      return content
    }

    return result.content
  }
  catch (error) {
    logger.warn('Biome HTML formatting not supported or failed:', error)
    return content // Fallback to original content
  }
}

/**
 * Creates the `useId` helper exposed to Pug templates for a single render.
 *
 * Ids carry an `id-` prefix so they always start with a letter: a section id is numeric
 * (e.g. `80.90`), and a leading digit is a valid HTML id but NOT a valid CSS/querySelector token
 * (`document.querySelector('#80-90-x')` throws), so the prefix keeps generated ids safe to select.
 *
 * With a key, the id is derived purely from the section id and that key, e.g.
 * `useId('email')` inside section `2.30` returns `id-2-30-email`. It never depends on call
 * order, so the same key returns the same id on every re-render — a label and its input
 * can share one: `label(for=id)` / `input(id=id)`.
 *
 * Without a key, `useId()` hands out a fresh sequential id per call (`id-2-30-0`, `id-2-30-1`, …)
 * for "just give me a unique one" cases. The counter resets each render, so an unchanged
 * template stays stable across re-renders; it only shifts if no-arg calls are added/reordered.
 */
export function createUseId(sectionId: string) {
  const namespace = `id-${sectionSanitizeId(sectionId)}`
  let autoCounter = 0
  return (key?: string) => {
    if (key === undefined) {
      return `${namespace}-${autoCounter++}`
    }

    const suffix = String(key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return suffix ? `${namespace}-${suffix}` : namespace
  }
}

/** The `.pug` file path a pug error points at, if it carries one (raw, unresolved). */
export function pugErrorFile(error: unknown): string | undefined {
  const candidate = error as { path?: string, filename?: string } | null
  return candidate?.path ?? candidate?.filename
}

/**
 * Compile a single `.pug` file to HTML and report its resolved dependency paths (the entry file
 * plus every include/extends). `extraLocals` are merged with the per-render `useId` helper.
 */
// Accumulates time spent reading include/extends files via pug's `read` hook. compilePugFile runs
// synchronously with no yield, so sampling this before/after a compile attributes reads to it.
let includeReadMs = 0
function timedRead(filePath: string): string {
  const t0 = performance.now()
  const content = readFileSync(filePath, 'utf8')
  includeReadMs += performance.now() - t0
  return content
}

function compilePugFile(
  pugFilePath: string,
  mode: Mode,
  sectionId: string,
  extraLocals: Record<string, unknown> = {},
): { html: string, dependencies: string[], readMs: number, parseMs: number, renderMs: number } {
  // entry file read (measured), then compile with includes routed through the timed reader so we can
  // separate disk I/O from lex/parse/codegen.
  const tRead0 = performance.now()
  const source = readFileSync(pugFilePath, 'utf8')
  let readMs = performance.now() - tRead0

  const includeReadBefore = includeReadMs
  const tParse0 = performance.now()
  const pugFn = pug.compile(source, {
    filename: pugFilePath,
    // define doctype to avoid self-closing tags on wrong places
    doctype: 'html',
    // pretty output in dev keeps the "Show code" view readable without Biome
    pretty: mode === 'development',
    // pug defaults this to true, which wraps the generated function in per-line try/catch +
    // line-mapping — measurably bloating codegen and `new Function`. We surface compile errors via
    // our own overlay, so the precise pug line in a runtime stack isn't worth the cost.
    compileDebug: false,
    plugins: [{ read: timedRead }],
  })
  const includeReads = includeReadMs - includeReadBefore
  const parseMs = (performance.now() - tParse0) - includeReads
  readMs += includeReads

  const dependencies = [path.resolve(pugFilePath), ...pugFn.dependencies.map(dep => path.resolve(dep))]

  const tRender0 = performance.now()
  const html = pugFn({ ...extraLocals, useId: createUseId(sectionId) })
  const renderMs = performance.now() - tRender0

  return { html, dependencies, readMs, parseMs, renderMs }
}

/**
 * Replaces all <insert-vite-pug src="path/to/file.pug" modifierClass="modifier"> tags with the
 * compiled pug output. Returns the expanded markup plus the absolute paths of every pug file
 * (and its includes/extends) that was compiled.
 */
async function expandVitePugTags(
  contentDir: `${string}/`,
  mode: Mode,
  html: string,
  sectionId: string,
): Promise<CompileResult> {
  const vitePugTags = html.match(INSERT_VITE_PUG_TAG_RE)
  if (!vitePugTags) {
    return { html, dependencies: [], timings: { read: 0, parse: 0, render: 0, a11y: 0 } }
  }

  let markupOutput = html
  const dependencies: string[] = []
  let read = 0
  let parse = 0
  let render = 0

  await Promise.all(vitePugTags.map(async (vitePugTag) => {
    const pugSourcePath = vitePugTag.match(PUG_SRC_RE)?.[1]
    if (!pugSourcePath) {
      return
    }

    const isPugFile = path.extname(pugSourcePath) === '.pug'
    if (!isPugFile) {
      throw new Error(`${pugSourcePath} is not a valid .pug file`)
    }

    const pugModifierClass = vitePugTag.match(PUG_MODIFIER_CLASS_RE)
    const pugLocals = pugModifierClass && pugModifierClass[1]
      ? { modifierClass: pugModifierClass[1] }
      : {}

    const pugFilePath = path.join(contentDir, pugSourcePath)
    const { html: pugOutput, dependencies: pugDependencies, readMs, parseMs, renderMs } = compilePugFile(pugFilePath, mode, sectionId, pugLocals)
    dependencies.push(...pugDependencies)
    read += readMs
    parse += parseMs
    render += renderMs
    markupOutput = markupOutput.replaceAll(vitePugTag, pugOutput)
  }))

  return { html: markupOutput, dependencies, timings: { read, parse, render, a11y: 0 } }
}

/**
 * Compiles a single section's markup to final HTML and reports its file dependencies.
 *
 * Handles three input shapes:
 * - a bare `.pug` path (compiled server-side, in dev and prod alike)
 * - a bare `.html` path (read as-is)
 * - inline markup that may contain `<insert-vite-pug>` tags
 *
 * Throws on a missing file or pug compile error; callers decide how to surface it.
 */
export async function compileMarkup(
  contentDir: `${string}/`,
  mode: Mode,
  html: string,
  sectionId: string,
): Promise<CompileResult> {
  let result = html
  const dependencies: string[] = []
  let read = 0
  let parse = 0
  let render = 0

  const trimmed = html.trim()
  const isBarePath = !trimmed.includes('<') && !trimmed.includes('\n')

  if (isBarePath && trimmed.endsWith('.html')) {
    const htmlFilePath = path.join(contentDir, trimmed)
    const t0 = performance.now()
    result = await fs.readFile(htmlFilePath, 'utf-8')
    read += performance.now() - t0
    dependencies.push(path.resolve(htmlFilePath))
  }
  else if (isBarePath && trimmed.endsWith('.pug')) {
    const pugFilePath = path.join(contentDir, trimmed)
    const compiled = compilePugFile(pugFilePath, mode, sectionId)
    result = compiled.html
    dependencies.push(...compiled.dependencies)
    read += compiled.readMs
    parse += compiled.parseMs
    render += compiled.renderMs
  }

  const expanded = await expandVitePugTags(contentDir, mode, result, sectionId)
  result = expanded.html
  dependencies.push(...expanded.dependencies)
  read += expanded.timings.read
  parse += expanded.timings.parse
  render += expanded.timings.render

  // Production output is canonically formatted with Biome; dev relies on pug `pretty`.
  if (mode === 'production') {
    result = await biomeFormat(result)
  }

  const tA11y = performance.now()
  result = fixAccessibilityIssues(result)
  const a11y = performance.now() - tA11y

  return { html: result, dependencies: [...new Set(dependencies)], timings: { read, parse, render, a11y } }
}
