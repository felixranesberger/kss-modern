import { sanitizeSpecialCharacters } from './utils.ts'

export interface SectionMeta {
  modifiers: { name: string }[]
}

const INSERT_MARKUP_REGEX = /<insert-markup>(\d+(?:\.\d+)*)(?:-(\d*))?<\/insert-markup>/g

export function resolveInsertMarkupInRepository(
  repository: Map<string, { markup: string }>,
  sectionsById: Map<string, SectionMeta>,
): void {
  for (const [id, entry] of repository) {
    entry.markup = resolveMarkup(entry.markup, repository, sectionsById, new Set([id]))
  }
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
