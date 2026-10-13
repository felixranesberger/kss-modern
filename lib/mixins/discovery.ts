import lex from 'pug-lexer'
import parse from 'pug-parser'
import walk from 'pug-walk'

/** A mixin definition found in a `.pug` file. */
export interface DiscoveredMixin {
  name: string
  /** The raw argument list as written, e.g. `props` or `label, opts = {}`; null without parentheses. */
  args: string | null
  /** 1-based line of the `mixin` keyword. */
  line: number
  /** Source of the unbuffered code block assigning `mixinSchema`, when the mixin declares one. */
  schemaSource?: string
  /** `- var mixinName = 'atoms/button'`: where the mixin sits in the explorer, `/` nests folders. */
  mixinName?: string
}

const MIXIN_SCHEMA_RE = /\bmixinSchema\s*=/
/** `var|let|const mixinName = '…'` with a plain string literal; anything computed is not read. */
const MIXIN_NAME_RE = /^\s*(?:var|let|const)\s+mixinName\s*=\s*(['"])([^'"\n]*)\1\s*(?:;\s*)?$/
const MIXIN_KEYWORD_RE = /^\s*mixin\s/m

/**
 * Find the `mixinSchema` code block and the `mixinName` line in a mixin body, without descending
 * into nested mixins. Both are read here at build time; neither is executed.
 */
export function findMixinCode(block: unknown): { schemaSource?: string, mixinName?: string } {
  const found: { schemaSource?: string, mixinName?: string } = {}
  walk(block, (node) => {
    if (node.type === 'Mixin')
      return false
    if (node.type !== 'Code' || node.buffer)
      return
    if (found.schemaSource === undefined && MIXIN_SCHEMA_RE.test(node.val))
      found.schemaSource = node.val
    const name = MIXIN_NAME_RE.exec(node.val)?.[2]
    if (found.mixinName === undefined && name !== undefined)
      found.mixinName = name
  })
  return found
}

/**
 * List the mixins a `.pug` source defines at its top level. Mixins defined inside a conditional,
 * a tag or another mixin are skipped: the playground compiles each mixin on its own, and those only
 * exist once their surrounding code ran. Throws when the source does not parse.
 */
export function discoverMixins(source: string, filename: string): DiscoveredMixin[] {
  // most partials define no mixin at all, and lexing is the expensive part
  if (!MIXIN_KEYWORD_RE.test(source))
    return []

  const ast = parse(lex(source, { filename }), { filename, src: source })
  const mixins: DiscoveredMixin[] = []

  for (const node of ast.nodes) {
    if (node.type !== 'Mixin' || node.call)
      continue

    mixins.push({
      name: node.name,
      args: node.args ?? null,
      line: node.line,
      ...node.block ? findMixinCode(node.block) : {},
    })
  }

  return mixins
}
