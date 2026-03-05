export function formatHtmlComments(source: string): string {
  return source.split('\n').flatMap((line) => {
    if (!line.includes('<!--'))
      return [line]

    const indent = line.match(/^(\s*)/)?.[1] ?? ''
    const trimmed = line.trim()

    // Line is already only a comment — keep as is
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->') && !trimmed.slice(4, -3).includes('-->'))
      return [line]

    // Split line around HTML comments, giving each its own line
    const parts: string[] = []
    const remaining = line.trimStart()
    const commentRegex = /<!--.*?-->/g
    let lastIndex = 0

    for (const match of remaining.matchAll(commentRegex)) {
      const before = remaining.substring(lastIndex, match.index)
      if (before.trim())
        parts.push(before.trimEnd())
      parts.push(match[0])
      lastIndex = match.index! + match[0].length
    }

    const after = remaining.substring(lastIndex)
    if (after.trim())
      parts.push(after.trimStart())

    if (parts.length <= 1)
      return [line]

    return parts.map(part => `${indent}${part}`)
  }).join('\n')
}
