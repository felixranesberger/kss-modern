import type { Biome } from '@biomejs/js-api'
import type { StyleguideConfiguration } from '../index'
import type { MixinUsageNode } from './mixin-trace.ts'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import pug from 'pug'
import { logger } from '../logger.ts'
import { fixAccessibilityIssues, INSERT_VITE_PUG_TAG_RE, PUG_MODIFIER_CLASS_RE, PUG_SRC_RE } from '../shared.ts'
import { createUseId } from '../use-id.ts'
import { requireZod } from '../zod.ts'
import { createMixinTrace, mergeMixinUsage, MIXIN_TRACE_LOCAL, mixinTracePlugin } from './mixin-trace.ts'
import { installPugParseCache } from './parse-cache.ts'

export type Mode = StyleguideConfiguration['mode']

// Memoise pug's per-file lex+parse across sections. Installed here so it covers every place a
// section compiles — the main thread (small inline rebuilds) and each worker thread (which imports
// this module separately and patches its own pug-load). Lex+parse dominates compile time, and a
// shared include tree is otherwise re-parsed once per dependent section. See ./parse-cache.ts.
installPugParseCache()

export { createUseId }

export interface CompileResult {
  /** Final HTML: pug-compiled and accessibility-fixed. Never formatted, see `formatSourceCode`. */
  html: string
  /** Absolute paths of every file this section's markup depends on (entry pug/html + includes/extends). */
  dependencies: string[]
  /** The mixins the markup called while rendering, as a call tree. */
  mixinUsage: MixinUsageNode[]
}

// Memoised Biome instance + project key, created on first use and reused for the process lifetime.
let biomePromise: Promise<{ biome: Biome, projectKey: number }> | undefined

function getBiome(): Promise<{ biome: Biome, projectKey: number }> {
  biomePromise ??= (async () => {
    // Loaded lazily, so worker threads never load it and a build without code views never pays the import.
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

/**
 * Formats a section's HTML for the code views ("Show code", copy to clipboard). The result must never
 * be rendered: `whitespaceSensitivity: 'ignore'` adds and removes whitespace around inline elements,
 * so `der <a>Link</a>` can become `der<a>Link</a>` and wrap differently.
 */
export async function formatSourceCode(content: string, sectionId: string): Promise<string> {
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
): CompileResult {
  const source = readFileSync(pugFilePath, 'utf8')
  const pugFn = pug.compile(source, {
    filename: pugFilePath,
    // define doctype to avoid self-closing tags on wrong places
    doctype: 'html',
    // pretty output adds whitespace between tags and would render differently than production.
    // The code views are formatted separately, see `formatSourceCode`.
    pretty: false,
    // pug defaults this to true, which wraps the generated function in per-line try/catch +
    // line-mapping — measurably bloating codegen and `new Function`. We surface compile errors via
    // our own overlay, so the precise pug line in a runtime stack isn't worth the cost.
    compileDebug: false,
    // records which mixins the section calls, see ./mixin-trace.ts
    plugins: [mixinTracePlugin],
  })

  const dependencies = [path.resolve(pugFilePath), ...pugFn.dependencies.map(dep => path.resolve(dep))]
  // `modifierClass` defaults to the `{{modifier_class}}` placeholder so a template can place the
  // section's modifier with `.c-tabs(class=modifierClass)` instead of writing the literal token; the
  // placeholder survives compilation and is swapped per modifier at runtime (see ModifierReplacer).
  // `extraLocals` wins, so `<insert-vite-pug modifierClass="…">` still bakes its fixed class instead.
  const locals: Record<string, unknown> = { modifierClass: '{{modifier_class}}', ...extraLocals, useId: createUseId(sectionId) }
  // `z` is zod (when installed), so markup can call mixins that declare a `mixinSchema`, see
  // lib/mixins. A getter, so zod only loads for a template that actually uses it.
  Object.defineProperty(locals, 'z', { enumerable: true, get: requireZod })
  const trace = createMixinTrace()
  locals[MIXIN_TRACE_LOCAL] = trace
  const html = pugFn(locals)

  return { html, dependencies, mixinUsage: trace.read() }
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
    return { html, dependencies: [], mixinUsage: [] }
  }

  let markupOutput = html
  const dependencies: string[] = []
  const mixinUsage: MixinUsageNode[] = []

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
    const { html: pugOutput, dependencies: pugDependencies, mixinUsage: pugMixinUsage } = compilePugFile(pugFilePath, mode, sectionId, pugLocals)
    dependencies.push(...pugDependencies)
    mixinUsage.push(...pugMixinUsage)
    markupOutput = markupOutput.replaceAll(vitePugTag, pugOutput)
  }))

  return { html: markupOutput, dependencies, mixinUsage }
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
  const mixinUsage: MixinUsageNode[] = []

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
    mixinUsage.push(...compiled.mixinUsage)
  }

  const expanded = await expandVitePugTags(contentDir, mode, result, sectionId)
  result = expanded.html
  dependencies.push(...expanded.dependencies)
  mixinUsage.push(...expanded.mixinUsage)

  result = fixAccessibilityIssues(result)

  return { html: result, dependencies: [...new Set(dependencies)], mixinUsage: mergeMixinUsage(mixinUsage) }
}
