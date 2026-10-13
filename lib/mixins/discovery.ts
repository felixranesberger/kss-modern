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
  /**
   * Source of the unbuffered code block declaring the schema: the one calling `defineComponent(`,
   * else the one assigning `mixinSchema`. Present when the mixin declares one.
   */
  schemaSource?: string
  /** `schemaSource` calls `defineComponent` rather than assigning `mixinSchema`. */
  isDefineComponent?: boolean
  /**
   * Where the mixin sits in the explorer, `/` nests folders: the `name: '…'` literal of
   * `defineComponent`, else `- var mixinName = 'atoms/button'`. Only plain literals are read.
   */
  mixinName?: string
}

export interface MixinCode {
  schemaSource?: string
  isDefineComponent?: boolean
  mixinName?: string
}

const DEFINE_COMPONENT_RE = /\bdefineComponent\s*\(/
const MIXIN_SCHEMA_RE = /\bmixinSchema\s*=/
/** `var|let|const mixinName = '…'` with a plain string literal; anything computed is not read. */
const MIXIN_NAME_RE = /^\s*(?:var|let|const)\s+mixinName\s*=\s*(['"])([^'"\n]*)\1\s*(?:;\s*)?$/
/** `defineComponent({ name: '…'` as its first property, or `name: '…',` on a line of its own. */
const DEFINE_NAME_RE = /\bdefineComponent\s*\(\s*\{\s*name\s*:\s*(['"])([^'"\n]*)\1/
const DEFINE_NAME_LINE_RE = /^\s*name\s*:\s*(['"])([^'"\n]*)\1\s*(?:,\s*)?$/m
const MIXIN_KEYWORD_RE = /^\s*mixin\s/m

/** The `name` string literal of a `defineComponent` block, read without running it. */
export function readDefineComponentName(source: string): string | undefined {
  return (DEFINE_NAME_RE.exec(source) ?? DEFINE_NAME_LINE_RE.exec(source))?.[2]
}

/**
 * Find the code declaring the mixin's schema and explorer name in a mixin body, without descending
 * into nested mixins: a `defineComponent(…)` block, or the older pair of a `mixinSchema` block and
 * a `mixinName` line. Everything is read here at build time; nothing is executed.
 */
export function findMixinCode(block: unknown): MixinCode {
  let defineSource: string | undefined
  let schemaSource: string | undefined
  let mixinName: string | undefined
  walk(block, (node) => {
    if (node.type === 'Mixin')
      return false
    if (node.type !== 'Code' || node.buffer)
      return
    if (defineSource === undefined && DEFINE_COMPONENT_RE.test(node.val))
      defineSource = node.val
    if (schemaSource === undefined && MIXIN_SCHEMA_RE.test(node.val))
      schemaSource = node.val
    const name = MIXIN_NAME_RE.exec(node.val)?.[2]
    if (mixinName === undefined && name !== undefined)
      mixinName = name
  })

  if (defineSource !== undefined)
    return { schemaSource: defineSource, isDefineComponent: true, mixinName: readDefineComponentName(defineSource) ?? mixinName }
  return { schemaSource, mixinName }
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
