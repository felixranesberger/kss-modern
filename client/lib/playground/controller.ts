/**
 * The playground logic both hosts share: load the mixin's manifest entry and render module, keep the
 * controls' state, validate and render on every change, and in development follow rebuilds. A host
 * only decides where the controls live and where the rendered HTML goes.
 */
import type { ComponentRegistry } from '../../../lib/mixins/define-component.ts'
import type { MixinManifestEntry } from '../../../lib/mixins/types.ts'
import type { PlaygroundPageConfig } from '../../../lib/templates/mixins.ts'
import type { Field, FieldValues } from './fields.ts'
import type { PropsPanel } from './panel.ts'
import type { PropIssue, RenderFunction, RenderResult } from './runtime.ts'
import { PausableInterval } from '../../utils/pausable-interval.ts'
import { getFields, getInitialValues, getProps } from './fields.ts'
import { createPropsPanel } from './panel.ts'
import { fetchManifest, loadRenderFunction, loadSchemaRegistry, renderMixin } from './runtime.ts'
import { formatPugCall } from './state.ts'
import { validateValues } from './validate.ts'

/** How often a development page checks the manifest for a rebuilt mixin. */
const MANIFEST_POLL_MS = 1000

export interface PlaygroundHost {
  /** Where to mount the controls; omitted for a preview without controls. */
  panelHost?: HTMLElement
  isStandalone?: boolean
  /** A successful render: show it. `output` is what the mixin's template received, see `RenderResult`. */
  onRender: (html: string, props: Record<string, unknown>, output: unknown) => void
  /** The props are invalid or rendering threw: the last good render stays, the issues are shown. */
  onInvalid?: (result: Exclude<RenderResult, { isValid: true }>, props: Record<string, unknown>) => void
  /** Called with the new props after every edit, e.g. to keep the URL in sync. */
  onPropsChange?: (props: Record<string, unknown>) => void
  /** A development rebuild failed to compile the mixin (or recovered, with `undefined`). */
  onCompileError?: (error: MixinManifestEntry['error']) => void
  /** Called after the controls were mounted, e.g. to add host-specific buttons. */
  onPanel?: (panel: PropsPanel) => void
}

export interface Playground {
  entry: MixinManifestEntry
  fields: Field[]
  getProps: () => Record<string, unknown>
  getPugCall: () => string
  /** Render the current props again, e.g. after the host swapped documents. */
  render: () => void
  destroy: () => void
}

export async function createPlayground(
  config: PlaygroundPageConfig,
  host: PlaygroundHost,
  initial: { props?: Record<string, unknown>, error?: string } = {},
): Promise<Playground> {
  const manifest = await fetchManifest(config.manifestUrl, config.isDevelopment)
  let entry = manifest.mixins.find(candidate => candidate.id === config.id)
  if (!entry || !entry.hasSchema)
    throw new Error(`Mixin "${config.name}" has no playground in ${config.manifestUrl}`)

  let fields = getFields(entry.jsonSchema)
  let values: FieldValues = getInitialValues(fields, initial.props)
  let renderFunction: RenderFunction | undefined = entry.module ? await loadRenderFunction(entry) : undefined
  // also when this mixin declares its schema in a block: a nested component may name its own
  let schemaRegistryUrl = manifest.schemaRegistry
  let registry: ComponentRegistry | undefined = schemaRegistryUrl ? await loadSchemaRegistry(schemaRegistryUrl) : undefined
  let panel: PropsPanel | undefined

  const getCurrentProps = () => getProps(fields, values)
  const getPugCall = () => formatPugCall(entry!.name, getCurrentProps(), fields)

  const render = () => {
    const props = getCurrentProps()
    panel?.setPugCall(getPugCall())

    if (!renderFunction) {
      panel?.setMessage(entry!.error?.message ?? 'The mixin has not compiled yet.')
      return
    }

    // the schema's constraints first: their errors show at the field, and nothing renders
    const problems = validateValues(fields, values)
    if (problems.size > 0) {
      const issues: PropIssue[] = [...problems].flatMap(([path, messages]) => {
        const segments = path.split('.')
        return messages.map(message => ({ key: segments[0], path: segments, message }))
      })
      panel?.setIssues(issues)
      host.onInvalid?.({ isValid: false, issues }, props)
      return
    }

    // then the mixin's own `defineComponent` (or `mixinSchema.parse`), which also runs `.refine()` and the like
    const result = renderMixin(renderFunction, entry!.id, props, registry)
    if (result.isValid) {
      panel?.setIssues([])
      host.onRender(result.html, props, result.output)
      return
    }

    if ('issues' in result) {
      panel?.setIssues(result.issues)
    }
    else {
      panel?.setIssues([])
      panel?.setMessage(result.error)
    }
    host.onInvalid?.(result, props)
  }

  if (host.panelHost) {
    panel = createPropsPanel({
      host: host.panelHost,
      name: entry.name,
      fields,
      values,
      isStandalone: host.isStandalone,
      onChange: (nextValues) => {
        values = nextValues
        host.onPropsChange?.(getCurrentProps())
        render()
      },
      onReset: () => {
        values = getInitialValues(fields)
        panel!.setFields(fields, values)
        host.onPropsChange?.(getCurrentProps())
        render()
      },
    })
    host.onPanel?.(panel)
  }

  host.onCompileError?.(entry.error)
  render()
  if (initial.error) {
    const urlIssue: PropIssue = { key: '', path: [], message: initial.error }
    panel?.setIssues([urlIssue])
    host.onInvalid?.({ isValid: false, issues: [urlIssue] }, getCurrentProps())
  }

  // Development rebuilds rewrite the manifest. Follow them here instead of reloading the page, so
  // the props being edited survive: a rebuilt module is imported (its URL is content-hashed), a
  // changed schema rebuilds the controls and keeps the values of the props that still exist.
  let poll: PausableInterval | undefined
  const abortController = new AbortController()
  if (config.isDevelopment) {
    let isChecking = false
    poll = new PausableInterval(async () => {
      if (isChecking)
        return
      isChecking = true
      try {
        const nextManifest = await fetchManifest(config.manifestUrl, true)
        const next = nextManifest.mixins.find(candidate => candidate.id === config.id)
        if (!next || !next.hasSchema)
          return

        const isRegistryChanged = nextManifest.schemaRegistry !== schemaRegistryUrl
        if (isRegistryChanged) {
          schemaRegistryUrl = nextManifest.schemaRegistry
          registry = schemaRegistryUrl ? await loadSchemaRegistry(schemaRegistryUrl) : undefined
        }

        const previous = entry!
        entry = next

        const isSchemaChanged = JSON.stringify(next.jsonSchema) !== JSON.stringify(previous.jsonSchema)
        if (isSchemaChanged) {
          fields = getFields(next.jsonSchema)
          const keptProps = getCurrentProps()
          const freshValues = getInitialValues(fields)
          values = Object.fromEntries(fields.map(field => [
            field.key,
            field.key in keptProps ? keptProps[field.key] : freshValues[field.key],
          ]))
          panel?.setFields(fields, values)
        }

        if (JSON.stringify(next.error) !== JSON.stringify(previous.error))
          host.onCompileError?.(next.error)

        if (next.module !== previous.module && next.module)
          renderFunction = await loadRenderFunction(next)

        if (next.module !== previous.module || isSchemaChanged || isRegistryChanged)
          render()
      }
      catch (error) {
        console.warn('[kss-modern] Could not check the mixin manifest for updates', error)
      }
      finally {
        isChecking = false
      }
    }, MANIFEST_POLL_MS)

    if (document.visibilityState === 'visible')
      poll.start()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        poll!.resume()
      else
        poll!.pause()
    }, { signal: abortController.signal })
  }

  return {
    get entry() {
      return entry!
    },
    get fields() {
      return fields
    },
    getProps: getCurrentProps,
    getPugCall,
    render,
    destroy: () => {
      poll?.stop()
      abortController.abort()
      panel?.destroy()
    },
  }
}
