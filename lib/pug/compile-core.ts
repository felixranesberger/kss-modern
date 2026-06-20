import type { StyleguideConfiguration } from '../index'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Biome, Distribution } from '@biomejs/js-api'
import pug from 'pug'
import { sectionSanitizeId } from '../../client/utils.ts'
import { fixAccessibilityIssues } from '../shared.ts'

type Mode = StyleguideConfiguration['mode']

export interface CompileResult {
  /** Final HTML: pug-compiled, formatted, accessibility-fixed. */
  html: string
  /** Absolute paths of every file this section's markup depends on (entry pug/html + includes/extends). */
  dependencies: string[]
}

const PUG_SRC_RE = /src="(.+?)"/
const PUG_MODIFIER_CLASS_RE = /modifierClass="(.+?)"/
// Matches an <insert-vite-pug src="…" modifierClass="…"> tag whose optional modifierClass
// may sit on the next line.
// eslint-disable-next-line regexp/no-super-linear-backtracking
const regexModifierLine = /<insert-vite-pug src="(.+?)".*(?:[\n\r\u2028\u2029]\s*)?(modifierClass="(.+?)")? *><\/insert-vite-pug>/g

let biomeInstance: Biome
let biomePromise: Promise<Biome>
let projectKey: number

async function getBiome(): Promise<{ biome: Biome, projectKey: number }> {
  if (biomeInstance && projectKey !== undefined) {
    return { biome: biomeInstance, projectKey }
  }

  if (biomePromise) {
    const biome = await biomePromise
    return { biome, projectKey }
  }

  biomePromise = (async () => {
    const instance = await Biome.create({
      distribution: Distribution.NODE,
    })

    projectKey = instance.openProject('.').projectKey

    instance.applyConfiguration(projectKey, {
      html: {
        formatter: {
          lineWidth: 100,
          whitespaceSensitivity: 'ignore',
          attributePosition: 'multiline',
        },
      },
    })

    biomeInstance = instance

    return instance
  })()

  const biome = await biomePromise
  return { biome, projectKey }
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
      console.warn('Biome HTML formatting has errors, falling back to original content')
      return content
    }

    return result.content
  }
  catch (error) {
    console.warn('Biome HTML formatting not supported or failed:', error)
    return content // Fallback to original content
  }
}

/**
 * Creates the `useId` helper exposed to Pug templates for a single render.
 *
 * With a key, the id is derived purely from the section id and that key, e.g.
 * `useId('email')` inside section `2.30` returns `2-30-email`. It never depends on call
 * order, so the same key returns the same id on every re-render — a label and its input
 * can share one: `label(for=id)` / `input(id=id)`.
 *
 * Without a key, `useId()` hands out a fresh sequential id per call (`2-30-0`, `2-30-1`, …)
 * for "just give me a unique one" cases. The counter resets each render, so an unchanged
 * template stays stable across re-renders; it only shifts if no-arg calls are added/reordered.
 */
export function createUseId(sectionId: string) {
  const namespace = sectionSanitizeId(sectionId)
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
  const vitePugTags = html.match(regexModifierLine)
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
    const pugFn = pug.compileFile(pugFilePath, {
      // define doctype to avoid self-closing tags on wrong places
      doctype: 'html',
      // pretty output in dev keeps the "Show code" view readable without Biome
      pretty: mode === 'development',
    })

    dependencies.push(path.resolve(pugFilePath), ...pugFn.dependencies.map(dep => path.resolve(dep)))

    const pugOutput = pugFn({ ...pugLocals, useId: createUseId(sectionId) })
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
    const pugFn = pug.compileFile(pugFilePath, {
      doctype: 'html',
      pretty: mode === 'development',
    })
    dependencies.push(path.resolve(pugFilePath), ...pugFn.dependencies.map(dep => path.resolve(dep)))
    result = pugFn({ useId: createUseId(sectionId) })
  }

  const expanded = await expandVitePugTags(contentDir, mode, result, sectionId)
  result = expanded.html
  dependencies.push(...expanded.dependencies)

  // Production output is canonically formatted with Biome; dev relies on pug `pretty`.
  if (mode === 'production') {
    result = await biomeFormat(result)
  }

  result = fixAccessibilityIssues(result)

  return { html: result, dependencies: [...new Set(dependencies)] }
}
