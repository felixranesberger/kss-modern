/**
 * The mixin manifest: what the build writes to `mixins/manifest.json` and the playground reads.
 * Pure types and path helpers, safe to import from the browser.
 */

export interface MixinManifestEntry {
  /** Unique, URL-safe id derived from the name; used in file names and URLs. */
  id: string
  name: string
  /**
   * Where the mixin sits in the explorer: the segments of its `defineComponent` `name` or `mixinName` (`'atoms/button'` ->
   * `['atoms', 'button']`), or just its Pug name without one. The last segment is its label.
   */
  path: string[]
  /** Raw argument list as written in the template, null without parentheses. */
  args: string | null
  /** Defining file, relative to the working directory. */
  file: string
  /** 1-based line of the `mixin` keyword. */
  line: number
  /** The mixin declares a usable schema (`defineComponent` or `mixinSchema`), so it gets a playground. */
  hasSchema: boolean
  /** `.describe()` of the schema itself, shown under the mixin's name. */
  description?: string
  /** The schema as JSON Schema (`io: 'input'`), present when `hasSchema`. */
  jsonSchema?: Record<string, unknown>
  /** Why a declared schema could not be used. The mixin is then treated as schema-less. */
  schemaError?: string
  /** Render module, relative to the output directory. Content-hashed, so a URL never goes stale. */
  module?: string
  /** Development only: the last compile failed. `module` still points at the last good build. */
  error?: { message: string, file?: string }
}

/**
 * Only mixins that declare a schema, with `defineComponent` or `mixinSchema`, are public. All others are internal building blocks and
 * stay out of the manifest and the styleguide. A schema that fails to evaluate still counts, so the
 * broken schema shows up instead of the mixin silently vanishing.
 */
export interface MixinManifest {
  mixins: MixinManifestEntry[]
}

export const MIXIN_MANIFEST_PATH = 'mixins/manifest.json'
/** The mixin explorer: every mixin in one page, the selected one in the hash. */
export const MIXIN_OVERVIEW_FILE = 'mixins.html'

/** Link to a mixin in the explorer. */
export function getMixinExplorerHref(id: string): string {
  return `${MIXIN_OVERVIEW_FILE}#mixin=${id}`
}

/** Split an explorer name (`defineComponent` `name` or `mixinName`) into path segments; without one, the mixin's Pug name is the path. */
export function getMixinPath(name: string, mixinName: string | undefined): string[] {
  const segments = (mixinName ?? '').split('/').map(segment => segment.trim()).filter(Boolean)
  return segments.length > 0 ? segments : [name]
}

/** The standalone page that renders a mixin outside the styleguide UI. */
export function getMixinStandaloneFileName(id: string): string {
  return `mixins-${id}-standalone.html`
}

/** The event dispatched on the preview document after every playground render. */
export const PLAYGROUND_RENDER_EVENT = 'kss-modern:playground-render'

/** Message the styleguide sends into an embedded playground preview with freshly rendered markup. */
export const PLAYGROUND_HTML_MESSAGE = 'kss-modern:playground-html'

/** Message an embedded playground preview sends its parent once it listens for markup. */
export const PLAYGROUND_READY_MESSAGE = 'kss-modern:playground-ready'
