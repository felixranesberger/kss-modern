/**
 * Indent rendered playground markup for the code view. The build formats section code with Biome,
 * which does not run in the browser; this covers the same need for markup that changes on every
 * keystroke: one element per line, text-only elements kept on one line. Only for display, the
 * output is never rendered (whitespace around inline elements is not preserved).
 */

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const INDENT = '  '

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function openTag(element: Element): string {
  const attributes = [...element.attributes]
    .map(attribute => attribute.value === '' ? attribute.name : `${attribute.name}="${escapeAttribute(attribute.value)}"`)
  return `<${element.localName}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}>`
}

function formatNode(node: Node, depth: number, lines: string[]): void {
  const indent = INDENT.repeat(depth)

  switch (node.nodeType) {
    case Node.TEXT_NODE: {
      const text = node.textContent?.replace(/\s+/g, ' ').trim()
      if (text)
        lines.push(`${indent}${escapeText(text)}`)
      return
    }
    case Node.COMMENT_NODE:
      lines.push(`${indent}<!--${node.textContent ?? ''}-->`)
      return
    case Node.ELEMENT_NODE:
      break
    default:
      return
  }

  const element = node as Element
  const tag = element.localName
  if (VOID_ELEMENTS.has(tag)) {
    lines.push(`${indent}${openTag(element)}`)
    return
  }

  // <template> keeps its children in a separate fragment
  const children = [...(element instanceof HTMLTemplateElement ? element.content.childNodes : element.childNodes)]
  const isTextOnly = children.every(child => child.nodeType === Node.TEXT_NODE)
  if (isTextOnly) {
    const text = escapeText((element.textContent ?? '').replace(/\s+/g, ' ').trim())
    lines.push(`${indent}${openTag(element)}${text}</${tag}>`)
    return
  }

  lines.push(`${indent}${openTag(element)}`)
  children.forEach(child => formatNode(child, depth + 1, lines))
  lines.push(`${indent}</${tag}>`)
}

export function formatHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const lines: string[] = []
  template.content.childNodes.forEach(child => formatNode(child, 0, lines))
  return lines.join('\n')
}
