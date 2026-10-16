/**
 * Entry of the standalone mixin page (`mixins-<id>-standalone.html`), a document without any
 * styleguide UI. The component renders straight into this document, so it meets the real viewport,
 * media and container queries and `position: fixed` exactly as in production. The controls live in
 * a shadow root on a host element whose own box is locked with inline `!important` styles, so the
 * project's CSS reaches neither the controls nor, through inheritance, their text.
 *
 * URL API:
 * - `?props=<JSON>` starting props; the hash (`#props=`) is kept in sync while editing
 * - `?controls=0` the component only, no panel and no extra DOM (visual regression, embedding)
 * - `?theme=<class list>` preview theme (applied by the fullpage client)
 * - `?scheme=light|dark` force a color scheme
 *
 * Inside the styleguide's detail page the page runs embedded (`?embed=1`): the parent renders and
 * posts the markup, see `client/lib/playground/styleguide-host.ts`.
 */
import type { PlaygroundPageConfig } from '../lib/templates/mixins.ts'
import type { PropsPanel } from './lib/playground/panel.ts'
import { PLAYGROUND_HTML_MESSAGE, PLAYGROUND_READY_MESSAGE, PLAYGROUND_RENDER_EVENT } from '../lib/mixins/types.ts'
import { PUG_ERROR_OVERLAY_TAG } from '../lib/shared.ts'
import { createPlayground } from './lib/playground/controller.ts'
import { createElement } from './lib/playground/panel.ts'
import { readPropsFromUrl, writePropsToHash, writePropsToQuery } from './lib/playground/state.ts'

interface PanelLayout {
  dock: 'right' | 'bottom'
  size: number
  isCollapsed: boolean
}

const LAYOUT_STORAGE_KEY = 'kss-modern:playground-panel'
const DEFAULT_LAYOUT: PanelLayout = { dock: 'right', size: 360, isCollapsed: false }
const MIN_PANEL_SIZE = 220

const configElement = document.querySelector<HTMLScriptElement>('#kss-playground-config')
const root = document.querySelector<HTMLElement>('[data-kss-mixin-root]')
const projectScripts = document.querySelector<HTMLTemplateElement>('#kss-playground-project-scripts')
if (!configElement || !root)
  throw new Error('[kss-modern] This page is missing its playground configuration')

const config = JSON.parse(configElement.textContent ?? '{}') as PlaygroundPageConfig
const url = new URL(window.location.href)
const hasControls = url.searchParams.get('controls') !== '0'
const isEmbedded = url.searchParams.get('embed') === '1' && window.parent !== window
const scheme = url.searchParams.get('scheme')

if (scheme === 'light' || scheme === 'dark')
  document.documentElement.style.colorScheme = `only ${scheme}`

function readLayout(): PanelLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? 'null') as Partial<PanelLayout> | null
    return { ...DEFAULT_LAYOUT, ...stored }
  }
  catch {
    return DEFAULT_LAYOUT
  }
}

function writeLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  }
  catch {}
}

/**
 * Start the project's scripts. They were parked in a `<template>` so they run only once the
 * component is in the document, like on a production page where the markup comes first.
 */
let haveScriptsStarted = false
function startProjectScripts(): void {
  if (haveScriptsStarted || !projectScripts)
    return
  haveScriptsStarted = true

  projectScripts.content.querySelectorAll('script').forEach((parked) => {
    const script = document.createElement('script')
    for (const attribute of parked.attributes)
      script.setAttribute(attribute.name, attribute.value)
    script.textContent = parked.textContent
    document.body.append(script)
  })
}

let compileError: { message: string, file?: string } | undefined

function appendCompileError(): void {
  if (!compileError)
    return
  root!.append(createElement(PUG_ERROR_OVERLAY_TAG as 'div', {
    'error-id': config.name,
    'error-file': compileError.file,
    'error-message': compileError.message,
  }))
}

function showMarkup(html: string, props: Record<string, unknown>): void {
  // the rendered component is markup by definition; it comes from the project's own template
  root!.innerHTML = html
  appendCompileError()
  document.dispatchEvent(new CustomEvent(PLAYGROUND_RENDER_EVENT, { detail: { id: config.id, props } }))
  startProjectScripts()
}

function showInlineError(lines: string[]): void {
  const list = createElement('ul', { style: 'margin:0;padding-left:1.25em' }, lines.map(line => createElement('li', {}, [line])))
  root!.replaceChildren(createElement('div', {
    'role': 'alert',
    'data-kss-playground-error': '',
    'style': 'margin:1rem;padding:0.75rem 1rem;border:1px solid #b91c1c;border-radius:0.5rem;color:#b91c1c;background:#fef2f2;font:14px/1.4 ui-sans-serif,system-ui,sans-serif',
  }, [createElement('strong', {}, [`Invalid props for +${config.name}`]), list]))
  startProjectScripts()
}

function mountPanelHost(): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute('data-kss-playground-panel', '')
  if (scheme === 'light' || scheme === 'dark')
    host.setAttribute('data-scheme', scheme)
  document.body.append(host)
  return host
}

/** Lock the host's box with inline `!important` styles: the only declarations project CSS cannot override. */
function applyHostLayout(host: HTMLElement, layout: PanelLayout): void {
  host.setAttribute('data-dock', layout.dock)
  const declarations: Record<string, string> = {
    'all': 'initial',
    'position': 'fixed',
    'z-index': '2147483646',
    'display': 'block',
    'box-sizing': 'border-box',
  }

  if (layout.isCollapsed) {
    Object.assign(declarations, { 'inset-block-end': '1rem', 'inset-inline-end': '1rem' })
  }
  else if (layout.dock === 'right') {
    Object.assign(declarations, { 'inset-block': '0', 'inset-inline-end': '0', 'inline-size': `${layout.size}px`, 'max-inline-size': '90vw' })
  }
  else {
    Object.assign(declarations, { 'inset-inline': '0', 'inset-block-end': '0', 'block-size': `${layout.size}px`, 'max-block-size': '85vh' })
  }

  host.removeAttribute('style')
  for (const [property, value] of Object.entries(declarations))
    host.style.setProperty(property, value, 'important')
}

function setUpPanelLayout(host: HTMLElement, panel: PropsPanel): void {
  const { shadowRoot, header } = panel
  const panelElement = shadowRoot.querySelector<HTMLElement>('.c-panel')!
  let layout = readLayout()

  const dockButton = createElement('button', { 'class': 'c-button', 'type': 'button', 'aria-label': 'Dock to the bottom' }, ['Dock'])
  const collapseButton = createElement('button', { 'class': 'c-button', 'type': 'button', 'aria-label': 'Hide the controls (Alt+Shift+P)', 'title': 'Alt+Shift+P' }, ['Hide'])
  const launcher = createElement('button', { 'class': 'c-button c-launcher', 'type': 'button', 'aria-label': 'Show the controls (Alt+Shift+P)', 'title': 'Alt+Shift+P', 'hidden': true }, ['Props'])
  const resizeHandle = createElement('div', { 'class': 'c-resize-handle', 'role': 'separator', 'tabindex': '0', 'aria-label': 'Resize the controls' })
  header.append(dockButton, collapseButton)
  shadowRoot.append(launcher)
  panelElement.before(resizeHandle)

  const update = (next: PanelLayout) => {
    layout = next
    writeLayout(layout)
    applyHostLayout(host, layout)
    panelElement.hidden = layout.isCollapsed
    resizeHandle.hidden = layout.isCollapsed
    launcher.hidden = !layout.isCollapsed
    dockButton.textContent = layout.dock === 'right' ? 'Dock bottom' : 'Dock right'
    dockButton.setAttribute('aria-label', layout.dock === 'right' ? 'Dock to the bottom' : 'Dock to the right')
    resizeHandle.setAttribute('aria-orientation', layout.dock === 'right' ? 'vertical' : 'horizontal')
    resizeHandle.setAttribute('aria-valuenow', String(layout.size))
    resizeHandle.setAttribute('aria-valuemin', String(MIN_PANEL_SIZE))
  }

  const toggleCollapsed = () => {
    update({ ...layout, isCollapsed: !layout.isCollapsed })
    ;(layout.isCollapsed ? launcher : collapseButton).focus()
  }

  dockButton.addEventListener('click', () => update({ ...layout, dock: layout.dock === 'right' ? 'bottom' : 'right' }))
  collapseButton.addEventListener('click', toggleCollapsed)
  launcher.addEventListener('click', toggleCollapsed)

  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyP') {
      event.preventDefault()
      toggleCollapsed()
    }
  })

  const clampSize = (size: number) => {
    const limit = layout.dock === 'right' ? window.innerWidth * 0.9 : window.innerHeight * 0.85
    return Math.round(Math.min(Math.max(size, MIN_PANEL_SIZE), limit))
  }

  resizeHandle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    resizeHandle.setPointerCapture(event.pointerId)
    const dragController = new AbortController()

    resizeHandle.addEventListener('pointermove', (moveEvent) => {
      const size = layout.dock === 'right'
        ? window.innerWidth - moveEvent.clientX
        : window.innerHeight - moveEvent.clientY
      update({ ...layout, size: clampSize(size) })
    }, { signal: dragController.signal })

    resizeHandle.addEventListener('pointerup', () => dragController.abort(), { signal: dragController.signal })
    resizeHandle.addEventListener('pointercancel', () => dragController.abort(), { signal: dragController.signal })
  })

  resizeHandle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 48 : 16
    const grow = layout.dock === 'right' ? 'ArrowLeft' : 'ArrowUp'
    const shrink = layout.dock === 'right' ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== grow && event.key !== shrink)
      return
    event.preventDefault()
    update({ ...layout, size: clampSize(layout.size + (event.key === grow ? step : -step)) })
  })

  update(layout)
}

function removeCompileError(): void {
  root!.querySelectorAll(PUG_ERROR_OVERLAY_TAG).forEach(element => element.remove())
}

async function start(): Promise<void> {
  const initial = readPropsFromUrl(url)
  const playground = await createPlayground(
  // embedded, the styleguide page follows rebuilds and posts the markup; one poller is enough
    isEmbedded ? { ...config, isDevelopment: false } : config,
    {
      panelHost: hasControls && !isEmbedded ? mountPanelHost() : undefined,
      isStandalone: true,
      onRender: showMarkup,
      onInvalid: (result) => {
        if (hasControls && !isEmbedded)
          return
        // without controls there is nowhere else to say why nothing renders
        if (!root!.hasChildNodes() || root!.querySelector('[data-kss-playground-error]'))
          showInlineError('issues' in result ? result.issues.map(issue => issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message) : [result.error])
      },
      onPropsChange: (props) => {
        if (config.shouldReload) {
          window.location.replace(writePropsToQuery(new URL(window.location.href), props))
          return
        }
        history.replaceState(history.state, '', writePropsToHash(new URL(window.location.href), props))
      },
      onCompileError: (error) => {
        compileError = error
        removeCompileError()
        appendCompileError()
      },
      onPanel: panel => setUpPanelLayout(panel.shadowRoot.host as HTMLElement, panel),
    },
    initial,
  )

  // the defaults rendered in place of refused or broken URL props; without controls, say so
  if (initial.error && (!hasControls || isEmbedded))
    showInlineError([initial.error])

  if (!isEmbedded)
    return

  window.addEventListener('message', (event: MessageEvent<{ type?: string, html?: string, props?: Record<string, unknown>, error?: { message: string, file?: string } }>) => {
    if (event.source !== window.parent || event.origin !== window.location.origin)
      return
    if (event.data?.type !== PLAYGROUND_HTML_MESSAGE)
      return

    compileError = event.data.error
    if (typeof event.data.html === 'string') {
      showMarkup(event.data.html, event.data.props ?? playground.getProps())
      return
    }
    removeCompileError()
    appendCompileError()
  })
  window.parent.postMessage({ type: PLAYGROUND_READY_MESSAGE }, window.location.origin)
}

start()
  .catch((error: unknown) => {
    console.error('[kss-modern] The mixin playground could not start', error)
    showInlineError([error instanceof Error ? error.message : String(error)])
  })
  // nothing rendered at all (e.g. a compile error before the first build): still start the project
  .finally(startProjectScripts)
