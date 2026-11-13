/**
 * The mixin explorer (`mixins.html`, markup: `getMixinExplorerHtml` in `lib/templates/mixins.ts`).
 *
 * The list on the left selects a mixin without leaving the page. The preview is the selected mixin's
 * standalone page in an iframe, which brings the project's assets, the theme and dark mode handling
 * and the audit hooks of every other preview. This page renders the mixin and posts the markup into
 * the iframe; with `reloadPlaygroundOnChange` it reloads the iframe instead. Selection and props
 * live in the hash: `#mixin=button&props=…`.
 */
import type { MixinManifest, MixinManifestEntry } from '../../../lib/mixins/types.ts'
import type { Playground } from './controller.ts'
import { getMixinStandaloneFileName, PLAYGROUND_HTML_MESSAGE, PLAYGROUND_READY_MESSAGE } from '../../../lib/mixins/types.ts'
import { highlightCode } from '../../code-highlight'
import { queryRequired } from '../../utils.ts'
import { renderAlert } from '../alerts.ts'
import { createPlayground } from './controller.ts'
import { formatHtml } from './format-html.ts'
import { fetchManifest } from './runtime.ts'
import { readPropsFromUrl, writePropsToHash, writePropsToQuery } from './state.ts'

interface ExplorerConfig {
  manifestUrl: string
  isDevelopment: boolean
  shouldReload: boolean
}

interface PreviewMessage {
  type: typeof PLAYGROUND_HTML_MESSAGE
  html?: string
  props?: Record<string, unknown>
  error?: { message: string, file?: string }
}

type EditorLinks = Record<string, { vscode: string, phpstorm: string } | undefined>

const CODE_HIGHLIGHT_DELAY_MS = 150
const MIXIN_HASH_KEY = 'mixin'
const COPIED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clip-rule="evenodd" /></svg>`

function getSignature(entry: MixinManifestEntry): string {
  return `+${entry.name}${entry.args !== null ? `(${entry.args})` : ''}`
}

function readSelectedId(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get(MIXIN_HASH_KEY)
}

export default async (explorer: HTMLElement) => {
  const filterInput = queryRequired<HTMLInputElement>('[data-explorer-filter]', explorer)
  const rows = [...explorer.querySelectorAll<HTMLLIElement>('[data-explorer-row]')]
  const items = rows.map(row => queryRequired<HTMLAnchorElement>('[data-explorer-item]', row))
  const folders = [...explorer.querySelectorAll<HTMLElement>('[data-explorer-folder]')].map(folder => ({
    folder,
    details: queryRequired<HTMLDetailsElement>('details', folder),
    rows: [...folder.querySelectorAll<HTMLLIElement>('[data-explorer-row]')],
  }))
  const noMatch = queryRequired<HTMLElement>('[data-explorer-no-match]', explorer)
  const nameElement = queryRequired<HTMLElement>('[data-explorer-name]', explorer)
  const pathElement = queryRequired<HTMLElement>('[data-explorer-path]', explorer)
  const descriptionElement = queryRequired<HTMLElement>('[data-explorer-description]', explorer)
  const signatureElement = queryRequired<HTMLElement>('[data-explorer-signature]', explorer)
  const locationElement = queryRequired<HTMLElement>('[data-explorer-location]', explorer)
  const standaloneLink = queryRequired<HTMLAnchorElement>('[data-explorer-standalone]', explorer)
  const editorAnchors = explorer.querySelectorAll<HTMLAnchorElement>('[data-explorer-editor]')
  const iframe = queryRequired<HTMLIFrameElement>('iframe[data-playground-preview]', explorer)
  const noSchema = queryRequired<HTMLElement>('[data-explorer-no-schema]', explorer)
  const noSchemaSignature = queryRequired<HTMLElement>('[data-explorer-no-schema-signature]', explorer)
  const schemaError = queryRequired<HTMLElement>('[data-explorer-schema-error]', explorer)
  const panelHost = queryRequired<HTMLElement>('[data-playground-panel]', explorer)
  const noControls = queryRequired<HTMLElement>('[data-explorer-no-controls]', explorer)
  const codeElement = queryRequired<HTMLElement>('[data-playground-code]', explorer)
  const pugCallElement = queryRequired<HTMLElement>('[data-playground-pug-call]', explorer)
  const outputElement = queryRequired<HTMLElement>('[data-playground-output]', explorer)
  const schemaOnly = explorer.querySelectorAll<HTMLElement>('[data-explorer-requires-schema]')
  const copyButtons = explorer.querySelectorAll<HTMLButtonElement>('[data-playground-copy]')

  const config = JSON.parse(explorer.getAttribute('data-explorer-config') ?? '{}') as ExplorerConfig
  const editorLinks = JSON.parse(explorer.getAttribute('data-editor-links') ?? '{}') as EditorLinks
  // started now, awaited where needed: the list and the filter work before it arrives
  const manifestPromise: Promise<MixinManifest> = fetchManifest(config.manifestUrl, config.isDevelopment)

  panelHost.setAttribute('data-flush', '')

  let playground: Playground | undefined
  let selected: MixinManifestEntry | undefined
  let lastMessage: PreviewMessage | undefined
  let lastHtml = ''
  let highlightTimer: ReturnType<typeof setTimeout> | undefined
  /** Bumped on every selection, so a slow playground start for an earlier pick is dropped. */
  let selection = 0

  const getPreviewUrl = (entry: MixinManifestEntry, props?: Record<string, unknown>) => {
    const previewUrl = new URL(getMixinStandaloneFileName(entry.id), window.location.href)
    previewUrl.searchParams.set('controls', '0')
    previewUrl.searchParams.set('embed', '1')
    return props ? writePropsToQuery(previewUrl, props).href : previewUrl.href
  }

  const postToPreview = (message: PreviewMessage) => {
    lastMessage = message
    if (config.shouldReload)
      return
    iframe.contentWindow?.postMessage(message, window.location.origin)
  }

  const updateCode = (html: string) => {
    lastHtml = html
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      codeElement.setAttribute('data-source-code', encodeURIComponent(html ? formatHtml(html) : '<!-- no markup -->'))
      codeElement.removeAttribute('data-highlighted')
      codeElement.replaceChildren()
      highlightCode(codeElement).catch(console.error)
    }, CODE_HIGHLIGHT_DELAY_MS)
  }

  const writeHash = (id: string, props?: Record<string, unknown>) => {
    const url = new URL(window.location.href)
    const hash = new URLSearchParams()
    hash.set(MIXIN_HASH_KEY, id)
    url.hash = hash.toString()
    history.replaceState(history.state, '', props ? writePropsToHash(url, props) : url)
  }

  const select = async (id: string, initial: { props?: Record<string, unknown>, error?: string } = {}) => {
    const current = ++selection
    const manifest = await manifestPromise
    const entry = manifest.mixins.find(candidate => candidate.id === id) ?? manifest.mixins[0]
    if (!entry || current !== selection)
      return

    selected = entry
    playground?.destroy()
    playground = undefined
    lastMessage = undefined
    lastHtml = ''

    items.forEach(item => item.setAttribute('aria-current', String(item.getAttribute('data-explorer-item') === entry.id)))
    nameElement.textContent = entry.path.at(-1)!
    pathElement.textContent = entry.path.slice(0, -1).join(' / ')
    pathElement.hidden = entry.path.length < 2
    descriptionElement.textContent = entry.description ?? ''
    descriptionElement.hidden = !entry.description
    signatureElement.textContent = getSignature(entry)
    locationElement.textContent = `${entry.file}:${entry.line}`
    const links = editorLinks[entry.id]
    editorAnchors.forEach((anchor) => {
      const editor = anchor.getAttribute('data-explorer-editor') as 'vscode' | 'phpstorm'
      if (links)
        anchor.href = links[editor]
    })

    schemaOnly.forEach(element => element.toggleAttribute('hidden', !entry.hasSchema))
    iframe.hidden = !entry.hasSchema
    noSchema.classList.toggle('hidden', entry.hasSchema)
    panelHost.hidden = !entry.hasSchema
    noControls.classList.toggle('hidden', entry.hasSchema)
    pugCallElement.textContent = entry.hasSchema ? '' : getSignature(entry)
    outputElement.textContent = ''

    if (!entry.hasSchema) {
      noSchemaSignature.textContent = getSignature(entry)
      schemaError.textContent = entry.schemaError ?? ''
      panelHost.shadowRoot?.replaceChildren()
      updateCode('')
      return
    }

    standaloneLink.href = getMixinStandaloneFileName(entry.id)
    iframe.title = `${entry.name} preview`
    const nextSrc = getPreviewUrl(entry, initial.props)
    if (iframe.src !== nextSrc)
      iframe.src = nextSrc

    const next = await createPlayground(
      { id: entry.id, name: entry.name, manifestUrl: config.manifestUrl, isDevelopment: config.isDevelopment, shouldReload: config.shouldReload },
      {
        panelHost,
        onRender: (html, props, output) => {
          if (current !== selection)
            return
          updateCode(html)
          outputElement.textContent = JSON.stringify(output, null, 2) ?? ''
          pugCallElement.textContent = playground?.getPugCall() ?? ''
          if (config.shouldReload) {
            const reloadSrc = getPreviewUrl(entry, props)
            if (iframe.src !== reloadSrc)
              iframe.src = reloadSrc
            return
          }
          postToPreview({ type: PLAYGROUND_HTML_MESSAGE, html, props, error: playground?.entry.error })
        },
        onInvalid: () => {
          pugCallElement.textContent = playground?.getPugCall() ?? ''
        },
        onPropsChange: (props) => {
          if (current === selection)
            writeHash(entry.id, props)
        },
        onCompileError: (error) => {
          if (current === selection)
            postToPreview({ ...(lastMessage ?? { type: PLAYGROUND_HTML_MESSAGE }), error })
        },
      },
      initial,
    )

    if (current !== selection) {
      next.destroy()
      return
    }

    playground = next
    pugCallElement.textContent = next.getPugCall()
    // The first render ran before `playground` was set, so its message carried no compile error.
    // (The cast undoes TypeScript narrowing `lastMessage` to undefined; the render callback set it.)
    const firstMessage = lastMessage as PreviewMessage | undefined
    if (firstMessage)
      postToPreview({ ...firstMessage, error: next.entry.error })
  }

  // the preview tells us once it listens; until then a posted message would be lost
  window.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
    if (event.source !== iframe.contentWindow || event.data?.type !== PLAYGROUND_READY_MESSAGE)
      return
    if (lastMessage)
      postToPreview(lastMessage)
  })

  items.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault()
      const id = item.getAttribute('data-explorer-item')!
      writeHash(id)
      select(id).catch(console.error)
    })

    // arrow keys walk the visible list, like a listbox
    item.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
        return
      event.preventDefault()
      // rows hidden by the filter or inside a collapsed folder are skipped
      const visible = items.filter(candidate => candidate.checkVisibility())
      const position = visible.indexOf(item)
      visible[position + (event.key === 'ArrowDown' ? 1 : -1)]?.focus()
    })
  })

  filterInput.addEventListener('input', () => {
    const query = filterInput.value.trim().toLowerCase()
    rows.forEach((row, index) => {
      row.hidden = !(items[index].getAttribute('data-filter-text') ?? '').includes(query)
    })
    folders.forEach(({ folder, details, rows: folderRows }) => {
      folder.hidden = folderRows.every(row => row.hidden)
      // a match inside a collapsed folder has to be seen
      if (query)
        details.open = true
    })
    noMatch.classList.toggle('hidden', rows.some(row => !row.hidden))
  })

  // search results and pasted links change the hash of this very page
  window.addEventListener('hashchange', () => {
    const id = readSelectedId()
    if (id && id !== selected?.id)
      select(id, readPropsFromUrl(new URL(window.location.href))).catch(console.error)
  })

  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const isPug = button.getAttribute('data-playground-copy') === 'pug'
      const value = isPug ? playground?.getPugCall() ?? '' : formatHtml(lastHtml)
      await navigator.clipboard.writeText(value).catch(console.error)
      renderAlert(isPug ? 'Copied Pug call to clipboard!' : 'Copied HTML to clipboard!', COPIED_ICON)
    })
  })

  // without a hash, the first playground in tree order, the one the server marked as current
  const initialId = readSelectedId()
    ?? items.find(item => item.getAttribute('aria-current') === 'true')?.getAttribute('data-explorer-item')
    ?? items[0]?.getAttribute('data-explorer-item')
  if (initialId)
    await select(initialId, readPropsFromUrl(new URL(window.location.href)))
}
