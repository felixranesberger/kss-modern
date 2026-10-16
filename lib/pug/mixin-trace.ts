import walk from 'pug-walk'

/**
 * Records which mixins a section's markup calls, as the tree they are actually called in.
 *
 * A static scan of the templates would have to guess: a call inside `if`, a mixin passed a block
 * that calls others, a partial included twice. Tracing the real render answers it exactly. The
 * `preCodeGen` plugin wraps every mixin call in two unbuffered code lines, `enter(name)` before
 * and `exit()` after, which run against a trace object handed to the template as a local. Calls
 * made while a mixin runs, including those in the block passed to it, land as its children.
 */

/** One mixin in the call tree; repeated calls at the same level are merged into `count`. */
export interface MixinUsageNode {
  name: string
  count: number
  children: MixinUsageNode[]
}

/** The template local the injected code talks to. Prefixed so no template uses it by accident. */
export const MIXIN_TRACE_LOCAL = '__kssMixinTrace'

export interface MixinTrace {
  enter: (name: string) => void
  exit: () => void
  /** The recorded calls, merged per level. */
  read: () => MixinUsageNode[]
}

export function createMixinTrace(): MixinTrace {
  const root: MixinUsageNode[] = []
  const stack: MixinUsageNode[][] = [root]
  return {
    enter: (name) => {
      const node: MixinUsageNode = { name, count: 1, children: [] }
      stack.at(-1)!.push(node)
      stack.push(node.children)
    },
    exit: () => {
      if (stack.length > 1)
        stack.pop()
    },
    read: () => mergeMixinUsage(root),
  }
}

/** Merge calls of the same mixin on one level, summing counts and merging their children. */
export function mergeMixinUsage(nodes: MixinUsageNode[]): MixinUsageNode[] {
  const merged = new Map<string, MixinUsageNode>()
  for (const node of nodes) {
    const existing = merged.get(node.name)
    if (existing) {
      existing.count += node.count
      existing.children = [...existing.children, ...node.children]
    }
    else {
      merged.set(node.name, { name: node.name, count: node.count, children: [...node.children] })
    }
  }
  return [...merged.values()].map(node => ({ ...node, children: mergeMixinUsage(node.children) }))
}

function createCode(val: string, node: { line?: number, column?: number, filename?: string }) {
  return { type: 'Code', val, buffer: false, mustEscape: false, isInline: false, line: node.line, column: node.column, filename: node.filename }
}

/**
 * Pug plugin wrapping every mixin call in `enter`/`exit` calls on {@link MIXIN_TRACE_LOCAL}.
 * Calls with an interpolated name (`+#{name}()`) are left alone, their name is only known at runtime.
 */
export const mixinTracePlugin = {
  preCodeGen(ast: unknown) {
    return walk(ast, undefined, (node, replace) => {
      if (node.type !== 'Mixin' || !node.call || typeof node.name !== 'string' || node.name.includes('#{'))
        return
      replace([
        createCode(`${MIXIN_TRACE_LOCAL}.enter(${JSON.stringify(node.name)})`, node),
        node,
        createCode(`${MIXIN_TRACE_LOCAL}.exit()`, node),
      ])
    })
  },
}
