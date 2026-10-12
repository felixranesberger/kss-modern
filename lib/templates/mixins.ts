import type { ResolvedStyleguideConfiguration } from '../index.ts'
import type { MixinManifest, MixinManifestEntry } from '../mixins/types.ts'
import { getMixinExplorerHref, getMixinStandaloneFileName, MIXIN_MANIFEST_PATH } from '../mixins/types.ts'
import { sanitizeSpecialCharacters } from '../shared.ts'
import { generateFullPageFile } from './fullpage.ts'
import { getOpenInEditorLinks, renderOpenInEditorLink } from './preview.ts'

/** What the playground client reads from the page (`#kss-playground-config` / `data-playground-config`). */
export interface PlaygroundPageConfig {
  id: string
  name: string
  manifestUrl: string
  /** Development builds poll the manifest and swap in recompiled modules. */
  isDevelopment: boolean
  /** Reload the preview with the new props instead of swapping its markup in place. */
  shouldReload: boolean
}

function getPlaygroundPageConfig(config: ResolvedStyleguideConfiguration, entry: MixinManifestEntry): PlaygroundPageConfig {
  return {
    id: entry.id,
    name: entry.name,
    manifestUrl: MIXIN_MANIFEST_PATH,
    isDevelopment: config.mode === 'development',
    shouldReload: config.reloadPlaygroundOnChange ?? false,
  }
}

const EXTERNAL_LINK_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4" aria-hidden="true">
      <path class="transition group-hover:translate-x-px group-hover:-translate-y-px group-focus:translate-x-px group-focus:-translate-y-px" d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"/>
      <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
  </svg>
`

/** `+name(args)`, the way the mixin is declared. */
function getSignature(entry: MixinManifestEntry): string {
  return `+${entry.name}${entry.args !== null ? `(${entry.args})` : ''}`
}

/** A small status marker next to a mixin in the explorer list. */
function renderStatus(entry: MixinManifestEntry): string {
  if (entry.error)
    return '<span class="size-2 shrink-0 rounded-full bg-red-600 dark:bg-red-400" aria-hidden="true"></span><span class="sr-only">compile error</span>'
  if (entry.hasSchema)
    return '<span class="size-2 shrink-0 rounded-full bg-styleguide-theme-highlight" aria-hidden="true"></span><span class="sr-only">playground</span>'
  return '<span class="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true"></span><span class="sr-only">schema error</span>'
}

function renderEditorLinks(config: ResolvedStyleguideConfiguration, entry: MixinManifestEntry | undefined): string {
  const links = entry ? getOpenInEditorLinks(config, entry.file, entry.line) : undefined
  if (!links)
    return ''

  // the explorer swaps the hrefs when another mixin is selected
  return `
    ${renderOpenInEditorLink('phpstorm', 'Pug', links.phpstorm).replace('<a', '<a data-explorer-editor="phpstorm"')}
    ${renderOpenInEditorLink('vscode', 'Pug', links.vscode).replace('<a', '<a data-explorer-editor="vscode"')}
  `
}

interface ExplorerFolder {
  folders: Map<string, ExplorerFolder>
  entries: MixinManifestEntry[]
}

const compareLabels = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare

/** Nest the mixins by the folders of their `mixinName` (`atoms/button` -> atoms > button). */
function buildExplorerTree(entries: MixinManifestEntry[]): ExplorerFolder {
  const root: ExplorerFolder = { folders: new Map(), entries: [] }
  for (const entry of entries) {
    let folder = root
    for (const segment of entry.path.slice(0, -1)) {
      let next = folder.folders.get(segment)
      if (!next) {
        next = { folders: new Map(), entries: [] }
        folder.folders.set(segment, next)
      }
      folder = next
    }
    folder.entries.push(entry)
  }
  return root
}

/** The mixins in the order the tree lists them: folders first, both alphabetical. */
function flattenExplorerTree(folder: ExplorerFolder): MixinManifestEntry[] {
  return [
    ...[...folder.folders].sort(([a], [b]) => compareLabels(a, b)).flatMap(([, child]) => flattenExplorerTree(child)),
    ...[...folder.entries].sort((a, b) => compareLabels(a.path.at(-1)!, b.path.at(-1)!)),
  ]
}

function getLabel(entry: MixinManifestEntry): string {
  return entry.path.at(-1)!
}

/**
 * The mixin explorer (`mixins.html`): a filterable tree of every public mixin (see `MixinManifest`), nested by `mixinName`, on the left, the selected
 * one's live preview in the middle and its controls, rendered code and Pug call in tabs below. The
 * selection and its props live in the hash (`#mixin=button&props=…`), so switching never reloads
 * the page and every state can be linked. `client/lib/playground/explorer.ts` drives it.
 */
export function getMixinExplorerHtml(manifest: MixinManifest, config: ResolvedStyleguideConfiguration): string {
  const tree = buildExplorerTree(manifest.mixins)
  const ordered = flattenExplorerTree(tree)
  const first = ordered.find(entry => entry.hasSchema) ?? ordered[0]

  const renderItem = (entry: MixinManifestEntry) => `
    <li data-explorer-row>
        <a
            class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition hover:text-styleguide-highlight focus-visible:text-styleguide-highlight aria-[current=true]:bg-styleguide-bg-highlight aria-[current=true]:text-styleguide-highlight aria-[current=true]:font-semibold"
            href="${getMixinExplorerHref(entry.id)}"
            title="${sanitizeSpecialCharacters(`+${entry.name}${entry.args !== null ? `(${entry.args})` : ''} · ${entry.file}:${entry.line}`)}"
            aria-current="${entry === first}"
            data-explorer-item="${entry.id}"
            data-filter-text="${sanitizeSpecialCharacters(`${entry.path.join('/')} ${entry.name} ${entry.file}`.toLowerCase())}"
        >
            <span class="truncate">${sanitizeSpecialCharacters(getLabel(entry))}</span>
            ${renderStatus(entry)}
        </a>
    </li>
  `

  const renderFolder = (folder: ExplorerFolder): string => `
    ${[...folder.folders].sort(([a], [b]) => compareLabels(a, b)).map(([label, child]) => `
    <li data-explorer-folder>
        <details class="group/folder" open>
            <summary class="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold tracking-wide uppercase opacity-70 transition hover:opacity-100 focus-visible:opacity-100 [&::-webkit-details-marker]:hidden">
                <svg class="size-3 shrink-0 transition-transform group-open/folder:rotate-90" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                </svg>
                <span class="truncate">${sanitizeSpecialCharacters(label)}</span>
            </summary>
            <ul class="grid gap-0.5 border-l pl-2 ml-3.5 border-styleguide-border">
                ${renderFolder(child)}
            </ul>
        </details>
    </li>
    `).join('\n')}
    ${[...folder.entries].sort((a, b) => compareLabels(getLabel(a), getLabel(b))).map(renderItem).join('\n')}
  `
  const explorerConfig = {
    manifestUrl: MIXIN_MANIFEST_PATH,
    isDevelopment: config.mode === 'development',
    shouldReload: config.reloadPlaygroundOnChange ?? false,
  }
  const editorLinks = Object.fromEntries(manifest.mixins.map(entry => [entry.id, getOpenInEditorLinks(config, entry.file, entry.line)]))

  const buttonClass = 'inline-flex items-center gap-1.5 p-3 cursor-pointer active:scale-[0.96] transition hover:text-styleguide-highlight focus:text-styleguide-highlight duration-200'
  const tabTriggerClass = 'inline-flex gap-1 items-center relative px-4 py-2 text-sm cursor-pointer aria-selected:text-styleguide-highlight transition duration-400'
  const tabs = [
    { id: 'controls', title: 'Controls' },
    { id: 'code', title: 'Code' },
    { id: 'pug', title: 'Pug call' },
  ]

  return `
<section
    class="mixin-explorer grid md:grid-cols-[240px_minmax(0,1fr)] md:h-[calc(100dvh-var(--header-height,65px))]"
    aria-label="Mixin explorer"
    data-mixin-explorer
    data-explorer-config="${sanitizeSpecialCharacters(JSON.stringify(explorerConfig))}"
    data-editor-links="${sanitizeSpecialCharacters(JSON.stringify(editorLinks))}"
>
    <nav class="flex min-h-0 flex-col border-b md:border-b-0 md:border-r border-styleguide-border" aria-label="Mixins">
        <div class="border-b p-3 border-styleguide-border">
            <label for="mixin-explorer-filter" class="sr-only">Filter mixins</label>
            <input
                id="mixin-explorer-filter"
                class="w-full rounded-md border px-3 py-1.5 text-sm bg-styleguide-bg-highlight border-styleguide-border placeholder:text-styleguide focus:outline-hidden focus-visible:border-styleguide-highlight"
                type="search"
                placeholder="Filter mixins"
                autocomplete="off"
                spellcheck="false"
                data-explorer-filter
            >
        </div>
        <div class="max-h-64 min-h-0 overflow-y-auto px-2 py-3 md:max-h-none md:grow">
            <ul class="grid gap-0.5">
                ${renderFolder(tree)}
            </ul>
            <p class="hidden px-2 text-sm" data-explorer-no-match>No mixin matches the filter.</p>
        </div>
    </nav>

    <div class="flex min-h-0 min-w-0 flex-col" data-explorer-stage>
        <div class="@container flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-2 pl-4 pr-2 border-styleguide-border md:pl-6">
            <div class="min-w-0 py-1">
                <p class="truncate text-xs tracking-wide uppercase opacity-70" data-explorer-path${first && first.path.length > 1 ? '' : ' hidden'}>${sanitizeSpecialCharacters(first?.path.slice(0, -1).join(' / ') ?? '')}</p>
                <h1 class="truncate text-xl font-semibold text-styleguide-theme-highlight" data-explorer-name>${sanitizeSpecialCharacters(first ? getLabel(first) : '')}</h1>
                <p class="max-w-[65ch] text-sm text-styleguide-highlight" data-explorer-description${first?.description ? '' : ' hidden'}>${sanitizeSpecialCharacters(first?.description ?? '')}</p>
                <p class="mt-0.5 truncate text-sm">
                    <code class="font-mono text-styleguide-highlight" data-explorer-signature>${first ? sanitizeSpecialCharacters(getSignature(first)) : ''}</code>
                    <span class="font-mono" data-explorer-location>${first ? sanitizeSpecialCharacters(`${first.file}:${first.line}`) : ''}</span>
                </p>
            </div>
            <div class="flex items-center text-sm font-light">
                ${renderEditorLinks(config, first)}
                <button
                    class="${buttonClass}"
                    type="button"
                    data-code-audit-iframe="mixin-explorer-preview"
                    aria-controls="code-audit-dialog"
                    aria-expanded="false"
                    data-explorer-requires-schema
                >
                    <span>Audit</span>
                </button>
                <a
                    class="group ${buttonClass}"
                    href="${first?.hasSchema ? getMixinStandaloneFileName(first.id) : '#'}"
                    target="_blank"
                    data-explorer-standalone
                    data-explorer-requires-schema
                >
                    Standalone
                    ${EXTERNAL_LINK_ICON}
                </a>
            </div>
        </div>

        <div class="relative grid min-h-[320px] grow bg-styleguide-bg-highlight p-4 md:p-6">
            <iframe
                id="mixin-explorer-preview"
                class="${first?.hasSchema ? 'preview-iframe ' : ''}!h-full w-full"
                src="${first?.hasSchema ? `${getMixinStandaloneFileName(first.id)}?controls=0&amp;embed=1` : 'about:blank'}"
                title="${sanitizeSpecialCharacters(first?.name ?? 'Mixin')} preview"
                data-preview="true"
                data-playground-preview
            ></iframe>
            <div class="absolute inset-0 hidden overflow-auto p-6 md:p-10" data-explorer-no-schema>
                <div class="max-w-[65ch]">
                    <p class="text-styleguide-highlight">The <code class="font-mono">mixinSchema</code> of <code class="font-mono font-semibold" data-explorer-no-schema-signature></code> could not be evaluated, so it has no playground. The block may only use <code class="font-mono">z</code>.</p>
                    <pre class="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border p-4 font-mono text-xs text-red-700 border-styleguide-border bg-styleguide-bg dark:text-red-400" data-explorer-schema-error></pre>
                </div>
            </div>
        </div>

        <div class="tabs flex h-[45%] min-h-[240px] shrink-0 flex-col border-t border-styleguide-border">
            <div class="flex items-center justify-between gap-3 border-b px-2 py-1.5 border-styleguide-border">
                <div class="relative inline-flex flex-wrap justify-start rounded-md p-0.5 bg-styleguide-bg-highlight" role="tablist" aria-label="Mixin details">
                    <div class="tab-trigger-background absolute inset-y-0.5 left-0 rounded bg-[rgb(242,242,242)] dark:bg-[rgb(26,26,26)]"></div>
                    ${tabs.map((tab, index) => `
                    <button
                        id="mixin-explorer-tab-${tab.id}"
                        class="${tabTriggerClass}"
                        role="tab"
                        aria-selected="${index === 0}"
                        aria-controls="mixin-explorer-panel-${tab.id}"
                    >${tab.title}</button>
                    `).join('\n')}
                </div>
                <div class="flex items-center text-sm font-light">
                    <button class="${buttonClass} py-1.5" type="button" data-playground-copy="pug" data-explorer-requires-schema>Copy Pug</button>
                    <button class="${buttonClass} py-1.5" type="button" data-playground-copy="html" data-explorer-requires-schema>Copy HTML</button>
                </div>
            </div>

            <div id="mixin-explorer-panel-controls" class="min-h-0 grow overflow-y-auto" role="tabpanel" aria-labelledby="mixin-explorer-tab-controls" tabindex="0">
                <div aria-label="Props" data-playground-panel></div>
                <p class="hidden p-6 text-sm" data-explorer-no-controls>No controls: the <code class="font-mono">mixinSchema</code> could not be evaluated.</p>
            </div>
            <div id="mixin-explorer-panel-code" class="hidden min-h-0 grow overflow-auto p-4 text-sm" role="tabpanel" aria-labelledby="mixin-explorer-tab-code" tabindex="-1">
                <div
                    class="code-highlight w-full overflow-x-auto"
                    data-source-code="${encodeURIComponent('<!-- rendering -->')}"
                    data-source-lang="html"
                    data-playground-code
                ></div>
            </div>
            <div id="mixin-explorer-panel-pug" class="hidden min-h-0 grow overflow-auto p-4 text-sm" role="tabpanel" aria-labelledby="mixin-explorer-tab-pug" tabindex="-1">
                <code class="block whitespace-pre-wrap break-all font-mono text-styleguide-highlight" data-playground-pug-call></code>
            </div>
        </div>
    </div>
</section>
  `
}

/**
 * The standalone page of a mixin: no styleguide chrome, only the project's assets, the theme
 * handling of the fullpage previews and the playground client, which renders the component straight
 * into this document and mounts its controls in a shadow root.
 */
export async function generateMixinStandaloneFile(data: {
  filePath: string
  entry: MixinManifestEntry
  config: ResolvedStyleguideConfiguration
}): Promise<void> {
  const { config, entry } = data
  await generateFullPageFile({
    id: `mixin:${entry.id}`,
    filePath: data.filePath,
    page: {
      title: `${entry.name} · Mixin`,
      lang: config.html.lang,
    },
    css: config.html.assets.css,
    js: config.html.assets.js,
    previewThemes: config.previewThemes,
    html: '<div data-kss-mixin-root></div>',
    brandColor: config.brandColor,
    deactivateDarkMode: config.deactivateDarkMode,
    allowSearchEngineIndexing: config.allowSearchEngineIndexing,
    playgroundConfig: JSON.stringify(getPlaygroundPageConfig(config, entry)),
  })
}
