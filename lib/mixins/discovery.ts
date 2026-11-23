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
  /** `defineComponent('atoms/Button', props)`: the schema lives in a `.schema.ts` file. */
  isSchemaModule?: boolean
  /**
   * Where the mixin sits in the explorer, `/` nests folders: the `name: '…'` literal of
   * `defineComponent`, else `- var mixinName = 'atoms/button'`. Only plain literals are read.
   */
  mixinName?: string
  /** Slot names, see {@link findMixinSlots}. Present when the mixin has any. */
  slots?: string[]
}

export interface MixinCode {
  schemaSource?: string
  isDefineComponent?: boolean
  isSchemaModule?: boolean
  mixinName?: string
}

const DEFINE_COMPONENT_RE = /\bdefineComponent\s*\(/
const MIXIN_SCHEMA_RE = /\bmixinSchema\s*=/
/** `var|let|const mixinName = '…'` with a plain string literal; anything computed is not read. */
const MIXIN_NAME_RE = /^\s*(?:var|let|const)\s+mixinName\s*=\s*(['"])([^'"\n]*)\1\s*(?:;\s*)?$/
/** `defineComponent('…'`, the form whose schema lives in a `.schema.ts` file. */
const DEFINE_NAME_ARGUMENT_RE = /\bdefineComponent\s*\(\s*(['"])([^'"\n]*)\1/
/** `defineComponent({ name: '…'` as its first property, or `name: '…',` on a line of its own. */
const DEFINE_NAME_RE = /\bdefineComponent\s*\(\s*\{\s*name\s*:\s*(['"])([^'"\n]*)\1/
const DEFINE_NAME_LINE_RE = /^\s*name\s*:\s*(['"])([^'"\n]*)\1\s*(?:,\s*)?$/m
const MIXIN_KEYWORD_RE = /^\s*mixin\s/m
/** `const slots = pug_mixins.$fragments.collect(block)`, also with a destructuring pattern. */
const COLLECT_FRAGMENTS_RE = /\b(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*pug_mixins\.\$fragments\.collect\(\s*block\s*\)/
const IDENTIFIER_RE = /^[A-Z_$][\w$]*$/i
const DOLLAR_RE = /\$/g
/** The name of the default slot, filled by the `block` of a mixin call. */
export const DEFAULT_SLOT = 'default'

/** The `name` string literal of a `defineComponent` block, read without running it. */
export function readDefineComponentName(source: string): string | undefined {
  return (DEFINE_NAME_ARGUMENT_RE.exec(source) ?? DEFINE_NAME_RE.exec(source) ?? DEFINE_NAME_LINE_RE.exec(source))?.[2]
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

  if (defineSource !== undefined) {
    const isSchemaModule = DEFINE_NAME_ARGUMENT_RE.test(defineSource)
    return {
      schemaSource: defineSource,
      isDefineComponent: true,
      ...isSchemaModule ? { isSchemaModule } : {},
      mixinName: readDefineComponentName(defineSource) ?? mixinName,
    }
  }
  return { schemaSource, mixinName }
}

/** The JavaScript expressions of a node: code, conditions, loop sources, attributes, call arguments. */
function getNodeExpressions(node: any): string[] {
  const expressions: unknown[] = [node.val, node.test, node.obj, node.expr, node.args]
  for (const attribute of node.attrs ?? [])
    expressions.push(attribute.val)
  for (const attributeBlock of node.attributeBlocks ?? [])
    expressions.push(typeof attributeBlock === 'string' ? attributeBlock : attributeBlock.val)
  return expressions.filter((expression): expression is string => typeof expression === 'string')
}

/** The slot names a `collect(block)` result is read with: `slots.header`, `slots['header']` or a destructured name. */
function readNamedSlots(pattern: string, expressions: string[]): string[] {
  if (pattern.startsWith('{')) {
    return pattern.slice(1, -1).split(',').map(part => part.split(':')[0].split('=')[0].trim()).filter(name => IDENTIFIER_RE.test(name))
  }
  const variable = pattern.replace(DOLLAR_RE, '\\$')
  const accessRe = new RegExp(`(?<![\\w$.])${variable}\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*)|\\[\\s*(['"])([^'"\\n]+)\\2\\s*\\])`, 'g')
  return expressions.flatMap(expression => [...expression.matchAll(accessRe)].map(match => match[1] ?? match[3]))
}

/**
 * The slots of a mixin body, without descending into nested mixin definitions: {@link DEFAULT_SLOT}
 * for a `block`, and the named slots of a mixin that splits its block into fragments with
 * `const slots = pug_mixins.$fragments.collect(block)` and renders them with `slots.<name>`. The
 * caller fills those with `+fragment('<name>')`. The default slot comes first, the named slots
 * follow in source order.
 */
export function findMixinSlots(block: unknown): string[] {
  let hasBlock = false
  const expressions: string[] = []
  walk(block, (node) => {
    if (node.type === 'Mixin' && !node.call)
      return false
    if (node.type === 'MixinBlock')
      hasBlock = true
    expressions.push(...getNodeExpressions(node))
  })

  const pattern = expressions.map(expression => COLLECT_FRAGMENTS_RE.exec(expression)?.[1]).find(Boolean)
  const named = pattern === undefined ? [] : readNamedSlots(pattern, expressions)
  return [...new Set([...hasBlock ? [DEFAULT_SLOT] : [], ...named])]
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

    const slots = node.block ? findMixinSlots(node.block) : []
    mixins.push({
      name: node.name,
      args: node.args ?? null,
      line: node.line,
      ...node.block ? findMixinCode(node.block) : {},
      ...slots.length > 0 ? { slots } : {},
    })
  }

  return mixins
}
