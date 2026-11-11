/**
 * Markup features for the stage `shape`: an element with the path of its tags and first classes,
 * every further class, every modifier class and every attribute name. Texts and attribute values
 * do not count.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const TAG_RE = /<(\/?)([a-z][\w:-]*)(\s[^>]*|\/)?>/gi
const ATTRIBUTE_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g

/** BEM modifiers and state classes. */
function isModifier(name: string): boolean {
  return name.includes('--') || /^(?:is|has)-/.test(name)
}

export function markupFeatures(html: string): Set<string> {
  const features = new Set<string>()
  const stack: { tag: string, path: string }[] = []
  for (const [, closing, rawTag, attributes = ''] of html.matchAll(TAG_RE)) {
    const tag = rawTag.toLowerCase()
    if (closing) {
      const open = stack.findLastIndex(element => element.tag === tag)
      if (open >= 0)
        stack.length = open
      continue
    }
    let classes: string[] = []
    for (const [, rawName, double, single, bare] of attributes.matchAll(ATTRIBUTE_RE)) {
      const name = rawName.toLowerCase()
      features.add(`attr:${name}`)
      if (name === 'class')
        classes = (double ?? single ?? bare ?? '').split(/\s+/).filter(Boolean)
    }
    for (const name of classes.filter(isModifier))
      features.add(`mod:${name}`)
    // Only the first class names the element in the path, usually the BEM block or element.
    // Further classes like `theme-green` count once each, so they do not repeat every path below.
    const [first, ...others] = classes.filter(name => !isModifier(name))
    for (const name of others)
      features.add(`class:${name}`)
    const self = first === undefined ? tag : `${tag}.${first}`
    const path = stack.length > 0 ? `${stack.at(-1)!.path} > ${self}` : self
    features.add(`el:${path}`)
    if (!attributes.trimEnd().endsWith('/') && !VOID.has(tag))
      stack.push({ tag, path })
  }
  return features
}
