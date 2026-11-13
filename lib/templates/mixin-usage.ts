import type { MixinManifest, MixinManifestEntry } from '../mixins/types.ts'
import type { MixinUsageNode } from '../pug/mixin-trace.ts'
import { getMixinExplorerHref } from '../mixins/types.ts'
import { sanitizeSpecialCharacters } from '../shared.ts'

/** A public mixin in a section's call tree. */
export interface PublicMixinUsage {
  entry: MixinManifestEntry
  count: number
  children: PublicMixinUsage[]
}

/**
 * Reduce a section's mixin call tree to the public mixins (those in the manifest). An internal
 * mixin drops out and its public descendants move up to the nearest public ancestor, so a card
 * that renders a button through an internal helper still shows the button under the card.
 */
export function getPublicMixinUsage(usage: MixinUsageNode[], manifest: MixinManifest): PublicMixinUsage[] {
  const byName = new Map<string, MixinManifestEntry>()
  for (const entry of manifest.mixins) {
    // a name defined twice is listed twice; calls resolve to the first, as the ids do
    if (!byName.has(entry.name))
      byName.set(entry.name, entry)
  }

  const mergeUsage = (items: PublicMixinUsage[]): PublicMixinUsage[] => {
    const merged = new Map<string, PublicMixinUsage>()
    for (const item of items) {
      const existing = merged.get(item.entry.id)
      if (existing) {
        existing.count += item.count
        existing.children = mergeUsage([...existing.children, ...item.children])
      }
      else {
        merged.set(item.entry.id, { ...item, children: [...item.children] })
      }
    }
    return [...merged.values()]
  }

  const reduce = (nodes: MixinUsageNode[]): PublicMixinUsage[] => mergeUsage(nodes.flatMap((node) => {
    const children = reduce(node.children)
    const entry = byName.get(node.name)
    return entry ? [{ entry, count: node.count, children }] : children
  }))

  return reduce(usage)
}

function countMixins(items: PublicMixinUsage[], ids = new Set<string>()): Set<string> {
  for (const item of items) {
    ids.add(item.entry.id)
    countMixins(item.children, ids)
  }
  return ids
}

function renderNodes(items: PublicMixinUsage[], isRoot: boolean): string {
  return `
    <ul class="${isRoot ? 'grid gap-1' : 'mt-1 ml-2 grid gap-1 border-l pl-4 border-styleguide-border'}">
      ${items.map(item => `
        <li>
          <a
            class="group/mixin inline-flex flex-wrap items-baseline gap-x-2 rounded-md py-0.5 transition hover:text-styleguide-highlight focus-visible:text-styleguide-highlight"
            href="${getMixinExplorerHref(item.entry.id)}"
          >
            <span class="font-semibold text-styleguide-highlight group-hover/mixin:underline group-focus-visible/mixin:underline underline-offset-4">${sanitizeSpecialCharacters(item.entry.path.join(' / '))}</span>
            <code class="font-mono text-xs">+${sanitizeSpecialCharacters(item.entry.name)}</code>
            ${item.count > 1 ? `<span class="text-xs" aria-label="called ${item.count} times">×${item.count}</span>` : ''}
          </a>
          ${item.children.length > 0 ? renderNodes(item.children, false) : ''}
        </li>
      `).join('\n')}
    </ul>
  `
}

/**
 * The "Show mixins" disclosure under a section preview: the public mixins the section renders, as
 * the tree they are called in, each linking to the mixin explorer. Empty without public mixins.
 */
export function renderMixinUsage(usage: MixinUsageNode[] | undefined, manifest: MixinManifest): string {
  const items = getPublicMixinUsage(usage ?? [], manifest)
  if (items.length === 0)
    return ''

  const count = countMixins(items).size
  return `
    <details class="group/usage border-t border-styleguide-border" data-mixin-usage>
        <summary class="flex cursor-pointer items-center px-6 text-sm font-light bg-styleguide-bg">
            <span class="flex gap-2 items-center py-4 select-none">
                <svg class="h-4 w-4 group-open/usage:rotate-90 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                </svg>
                <span class="group-open/usage:hidden">Show mixins (${count})</span>
                <span class="group-open/usage:block hidden">Hide mixins (${count})</span>
            </span>
        </summary>
        <div class="border-t p-6 text-sm bg-styleguide-bg-highlight border-styleguide-border">
            ${renderNodes(items, true)}
        </div>
    </details>
  `
}
