import { sanitizeSpecialCharacters } from './shared.ts'

export interface SectionMeta {
  modifiers: { name: string }[]
}

export const INSERT_MARKUP_REGEX = /<insert-markup>(\d+(?:\.\d+)*)(?:-(\d*))?<\/insert-markup>/g

export function resolveInsertMarkupInRepository(
  repository: Map<string, { markup: string }>,
  sectionsById: Map<string, SectionMeta>,
): void {
  for (const [id, entry] of repository) {
    entry.markup = resolveMarkup(entry.markup, repository, sectionsById, new Set([id]))
  }
}

/**
 * Resolves <insert-markup> references for the given section ids WITHOUT mutating `repository`.
 * References are read recursively from `repository` (which should hold compiled, not-yet-resolved
 * markup for every section), so this is safe to call repeatedly during incremental rebuilds.
 * Returns a map of sectionId -> fully resolved markup.
 */
export function resolveInsertMarkupForSections(
  repository: Map<string, { markup: string }>,
  sectionsById: Map<string, SectionMeta>,
  ids: Iterable<string>,
): Map<string, string> {
  const resolved = new Map<string, string>()
  for (const id of ids) {
    const entry = repository.get(id)
    if (!entry)
      continue
    resolved.set(id, resolveMarkup(entry.markup, repository, sectionsById, new Set([id])))
  }
  return resolved
}

/** Returns the section ids referenced via <insert-markup> tags within the given markup. */
export function getInsertMarkupReferences(markup: string): string[] {
  return Array.from(markup.matchAll(INSERT_MARKUP_REGEX), match => match[1])
}

function resolveMarkup(
  markup: string,
  repository: Map<string, { markup: string }>,
  sectionsById: Map<string, SectionMeta>,
  visited: Set<string>,
): string {
  return markup.replace(INSERT_MARKUP_REGEX, (_match, refId: string, modifierIdxStr: string | undefined) => {
    if (visited.has(refId))
      return errorBlock(refId, `circular reference detected for section "${refId}"`)

    const refEntry = repository.get(refId)
    if (!refEntry)
      return errorBlock(refId, `section "${refId}" not found`)

    let inserted = refEntry.markup

    if (modifierIdxStr !== undefined && modifierIdxStr !== '') {
      const modifierIdx = Number(modifierIdxStr)
      const refSection = sectionsById.get(refId)
      const modifier = refSection?.modifiers[modifierIdx]
      if (!modifier)
        return errorBlock(refId, `modifier index ${modifierIdx} out of range for section "${refId}"`)

      const className = modifier.name.replace(/^\./, '')
      inserted = inserted.replaceAll('{{modifier_class}}', className)
    }

    const nextVisited = new Set(visited)
    nextVisited.add(refId)
    return resolveMarkup(inserted, repository, sectionsById, nextVisited)
  })
}

function errorBlock(refId: string, message: string): string {
  console.warn(`[insert-markup] ${message}`)
  return `<pre class="kss-modern-insert-markup-error" data-section-ref="${sanitizeSpecialCharacters(refId)}">[insert-markup] ${sanitizeSpecialCharacters(message)}</pre>`
}
