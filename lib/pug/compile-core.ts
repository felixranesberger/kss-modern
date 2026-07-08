import type { Biome } from '@biomejs/js-api'
import type { StyleguideConfiguration } from '../index'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
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

export interface CompileResult {
  /** Final HTML: pug-compiled, formatted, accessibility-fixed. */
  html: string
  /** Absolute paths of every file this section's markup depends on (entry pug/html + includes/extends). */
  dependencies: string[]
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

async function biomeFormat(content: string, sectionId: string): Promise<string> {
  const filePath = 'example.html'
  try {
    const { biome, projectKey } = await getBiome()

    // Try to format with Biome HTML support (experimental)
    const result = biome.formatContent(projectKey, content, { filePath })

    // Check if there are any fatal errors in diagnostics
    const fatalDiagnostics = result.diagnostics?.filter(
      (diag: any) => diag.severity === 'fatal' || diag.severity === 'error',
    )

    if (fatalDiagnostics?.length) {
      // Biome's HTML formatter is experimental; when it can't format a section we keep the
      // unformatted markup. Surface the section and Biome's own rendered diagnostics so the
      // offending construct is identifiable instead of a bare "has errors".
      const rendered = biome.printDiagnostics(fatalDiagnostics, { filePath, fileSource: content })
      logger.warn(
        `Biome HTML formatting failed for section ${sectionId}, using unformatted markup:\n${rendered}`,
      )
      return content
    }

    return result.content
  }
  catch (error) {
    logger.warn(`Biome HTML formatting not supported or failed for section ${sectionId}:`, error)
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
function compilePugFile(
  pugFilePath: string,
  mode: Mode,
  sectionId: string,
  extraLocals: Record<string, unknown> = {},
): { html: string, dependencies: string[] } {
  const source = readFileSync(pugFilePath, 'utf8')
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
  })

  const dependencies = [path.resolve(pugFilePath), ...pugFn.dependencies.map(dep => path.resolve(dep))]
  // `modifierClass` defaults to the `{{modifier_class}}` placeholder so a template can place the
  // section's modifier with `.c-tabs(class=modifierClass)` instead of writing the literal token; the
  // placeholder survives compilation and is swapped per modifier at runtime (see ModifierReplacer).
  // `extraLocals` wins, so `<insert-vite-pug modifierClass="…">` still bakes its fixed class instead.
  const html = pugFn({ modifierClass: '{{modifier_class}}', ...extraLocals, useId: createUseId(sectionId) })

  return { html, dependencies }
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
    return { html, dependencies: [] }
  }

  let markupOutput = html
  const dependencies: string[] = []

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
    const { html: pugOutput, dependencies: pugDependencies } = compilePugFile(pugFilePath, mode, sectionId, pugLocals)
    dependencies.push(...pugDependencies)
    markupOutput = markupOutput.replaceAll(vitePugTag, pugOutput)
  }))

  return { html: markupOutput, dependencies }
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

  const trimmed = html.trim()
  const isBarePath = !trimmed.includes('<') && !trimmed.includes('\n')

  if (isBarePath && trimmed.endsWith('.html')) {
    const htmlFilePath = path.join(contentDir, trimmed)
    result = await fs.readFile(htmlFilePath, 'utf-8')
    dependencies.push(path.resolve(htmlFilePath))
  }
  else if (isBarePath && trimmed.endsWith('.pug')) {
    const pugFilePath = path.join(contentDir, trimmed)
    const compiled = compilePugFile(pugFilePath, mode, sectionId)
    result = compiled.html
    dependencies.push(...compiled.dependencies)
  }

  const expanded = await expandVitePugTags(contentDir, mode, result, sectionId)
  result = expanded.html
  dependencies.push(...expanded.dependencies)

  // Production output is canonically formatted with Biome; dev relies on pug `pretty`.
  if (mode === 'production') {
    result = await biomeFormat(result, sectionId)
  }

  result = fixAccessibilityIssues(result)

  return { html: result, dependencies: [...new Set(dependencies)] }
}
