/**
 * Loading and running a mixin's precompiled render module. zod is bundled here, so it only ever
 * loads on pages with a playground.
 */
import type { MixinManifest, MixinManifestEntry } from '../../../lib/mixins/types.ts'
import { z } from 'zod'
import { createUseId } from '../../../lib/use-id.ts'

export type RenderFunction = (locals: Record<string, unknown>) => string

export interface PropIssue {
  /** Top-level prop the issue belongs to; empty for an issue about the props object itself. */
  key: string
  path: (string | number)[]
  message: string
}

export type RenderResult
  = | { isValid: true, html: string }
    | { isValid: false, issues: PropIssue[] }
    | { isValid: false, error: string }

export async function fetchManifest(url: string, isDevelopment: boolean): Promise<MixinManifest> {
  // development rebuilds rewrite the manifest under the same name, so skip the HTTP cache there
  const response = await fetch(new URL(url, document.baseURI), { cache: isDevelopment ? 'no-store' : 'default' })
  if (!response.ok)
    throw new Error(`Could not load the mixin manifest (${response.status} ${response.statusText})`)
  return response.json() as Promise<MixinManifest>
}

const moduleCache = new Map<string, Promise<RenderFunction>>()

/** Import a render module. Its name is content-hashed, so one URL is fetched at most once. */
export function loadRenderFunction(entry: MixinManifestEntry): Promise<RenderFunction> {
  if (!entry.module)
    return Promise.reject(new Error(`Mixin "${entry.name}" has no render module`))

  const url = new URL(entry.module, document.baseURI).href
  let loading = moduleCache.get(url)
  if (!loading) {
    loading = import(/* @vite-ignore */ url).then((module: { render?: RenderFunction }) => {
      if (typeof module.render !== 'function')
        throw new TypeError(`${entry.module} does not export render()`)
      return module.render
    })
    moduleCache.set(url, loading)
  }
  return loading
}

function isZodError(error: unknown): error is { issues: { path: PropertyKey[], message: string }[] } {
  return typeof error === 'object' && error !== null && Array.isArray((error as { issues?: unknown }).issues)
}

/**
 * Render the mixin with `props`, the way the build renders a section: same `z`, same `useId`. A
 * `ZodError` from the mixin's `mixinSchema.parse(props)` comes back as issues per prop.
 */
export function renderMixin(render: RenderFunction, id: string, props: Record<string, unknown>): RenderResult {
  try {
    const html = render({ props, z, useId: createUseId(`mixin-${id}`), modifierClass: '' })
    return { isValid: true, html }
  }
  catch (error) {
    if (isZodError(error)) {
      return {
        isValid: false,
        issues: error.issues.map((issue) => {
          const path = issue.path.filter((segment): segment is string | number => typeof segment !== 'symbol')
          return { key: path.length > 0 ? String(path[0]) : '', path, message: issue.message }
        }),
      }
    }
    return { isValid: false, error: error instanceof Error ? error.message : String(error) }
  }
}
