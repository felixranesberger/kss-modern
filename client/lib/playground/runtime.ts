/**
 * Loading and running a mixin's precompiled render module. zod is bundled here, so it only ever
 * loads on pages with a playground.
 */
import type { ComponentRegistry } from '../../../lib/mixins/define-component.ts'
import type { MixinManifest, MixinManifestEntry } from '../../../lib/mixins/types.ts'
import { z } from 'zod'
import { collectComponentDefinitions, createDefineComponent } from '../../../lib/mixins/define-component.ts'
import { ZOD_GLOBAL } from '../../../lib/mixins/types.ts'
import { createUseId } from '../../../lib/use-id.ts'

export type RenderFunction = (locals: Record<string, unknown>) => string

export interface PropIssue {
  /** Top-level prop the issue belongs to; empty for an issue about the props object itself. */
  key: string
  path: (string | number)[]
  message: string
}

export type RenderResult
  /** `output` is what the mixin's `defineComponent` returned: the props after defaults and `.transform()`. */
  = | { isValid: true, html: string, output: unknown }
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

const registryCache = new Map<string, Promise<ComponentRegistry>>()

/**
 * Import the registry of the `.schema.ts` modules, once per URL. The modules import zod through a
 * shim that reads it from a global, so they use the copy bundled here.
 */
export function loadSchemaRegistry(url: string): Promise<ComponentRegistry> {
  const href = new URL(url, document.baseURI).href
  let loading = registryCache.get(href)
  if (!loading) {
    (globalThis as Record<string, unknown>)[ZOD_GLOBAL] = z
    loading = import(/* @vite-ignore */ href).then((registry: { modules: [string, Record<string, unknown>][] }) => collectComponentDefinitions(registry.modules))
    loading.catch(() => registryCache.delete(href))
    registryCache.set(href, loading)
  }
  return loading
}

function isZodError(error: unknown): error is { issues: { path: PropertyKey[], message: string }[] } {
  return typeof error === 'object' && error !== null && Array.isArray((error as { issues?: unknown }).issues)
}

/**
 * Render the mixin with `props`, the way the build renders a section: same `z`, same `useId`, same
 * `defineComponent`. The zod issues of invalid props, a `ZodError` from `mixinSchema.parse(props)`
 * or the error `defineComponent` throws, come back as issues per prop.
 */
export function renderMixin(render: RenderFunction, id: string, props: Record<string, unknown>, registry?: ComponentRegistry): RenderResult {
  // the mixin's own `defineComponent` runs first, the ones of nested components after it
  let output: unknown
  let isOutputSet = false
  const defineComponent = createDefineComponent({
    registry,
    onParse: (data) => {
      if (isOutputSet)
        return
      output = data
      isOutputSet = true
    },
  })
  try {
    const html = render({ props, z, defineComponent, useId: createUseId(`mixin-${id}`), modifierClass: '' })
    return { isValid: true, html, output }
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
