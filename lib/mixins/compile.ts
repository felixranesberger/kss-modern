import path from 'node:path'
import pug from 'pug'
import { mixinMarkerPlugin } from '../pug/mixin-markers.ts'
import { installPugParseCache } from '../pug/parse-cache.ts'

installPugParseCache()

/** Compile options, part of every mixin module cache key. */
export const MIXIN_COMPILE_OPTIONS = {
  doctype: 'html',
  pretty: false,
  compileDebug: false,
  inlineRuntimeFunctions: true,
  name: 'render',
} as const

export interface CompiledMixinModule {
  /** ES module source exporting `render(locals)`. */
  code: string
  /** Absolute paths of every file the module was compiled from: the mixin's file and its includes. */
  dependencies: string[]
}

/** The local that carries slot contents by name into a render, see {@link getMixinWrapperSource}. */
export const MIXIN_SLOTS_LOCAL = '__kssSlots'

/**
 * The virtual template a mixin is compiled from: include its file, call it with `props`. With
 * `slots` (from the discovery), a render that passes `__kssSlots` fills them: `default` as the
 * call's block, a named slot as `+fragment('<name>')`. Without that local the call has no block.
 */
export function getMixinWrapperSource(file: string, name: string, slots: readonly string[] = []): string {
  const include = `include ${path.basename(file)}`
  if (slots.length === 0)
    return `${include}\n+${name}(props)`

  const isNamed = slots.some(slot => slot !== 'default')
  const fill = isNamed
    ? `      if __kssSlot === 'default'\n        != __kssContent\n      else\n        +fragment(__kssSlot)\n          != __kssContent`
    : `      != __kssContent`
  return [
    include,
    `if ${MIXIN_SLOTS_LOCAL}`,
    `  +${name}(props)`,
    `    each __kssContent, __kssSlot in ${MIXIN_SLOTS_LOCAL}`,
    fill,
    'else',
    `  +${name}(props)`,
  ].join('\n')
}

/**
 * Keep only what a mixin call needs to run: every mixin definition (including the ones pulled in
 * through `include`) and top-level unbuffered code a mixin may read, such as an icon map. Markup at
 * the top level of an included file is dropped, so compiling a mixin never renders its file's demo
 * content. Mixin definitions are kept whole, without walking into them.
 */
function collectRuntimeNodes(block: { nodes: any[] }, into: any[]): void {
  for (const node of block.nodes) {
    switch (node.type) {
      case 'Block':
      case 'NamedBlock':
        collectRuntimeNodes(node, into)
        break
      case 'Mixin':
        if (!node.call)
          into.push(node)
        break
      case 'Code':
        if (!node.buffer)
          into.push(node)
        break
      default:
        break
    }
  }
}

/** The postLink filter applied to every mixin compile. */
export const mixinPugPlugin = {
  postLink(ast: { nodes: any[] }) {
    const callNode = ast.nodes.at(-1)
    const runtimeNodes: any[] = []
    collectRuntimeNodes({ nodes: ast.nodes.slice(0, -1) }, runtimeNodes)
    ast.nodes = [...runtimeNodes, callNode]
    return ast
  },
}

/**
 * Precompile one mixin into a standalone ES module. The browser only ever changes prop values,
 * never the template, so the module carries no pug compiler: `render({ props, z,
 * defineComponent, useId, modifierClass })` returns HTML. `slots` are the mixin's slots, filled
 * through `__kssSlots`, see {@link getMixinWrapperSource}. Throws on a pug error.
 */
export function compileMixinModule(file: string, name: string, slots: readonly string[] = []): CompiledMixinModule {
  const absoluteFile = path.resolve(file)
  const { body, dependencies } = pug.compileClientWithDependenciesTracked(getMixinWrapperSource(absoluteFile, name, slots), {
    ...MIXIN_COMPILE_OPTIONS,
    // a sibling of the mixin's file, so its relative includes resolve exactly as in the file itself
    filename: path.join(path.dirname(absoluteFile), `__kss-mixin-${name}.pug`),
    plugins: [mixinPugPlugin, mixinMarkerPlugin],
  })

  return {
    code: `${body}\nexport { render }\n`,
    dependencies: [...new Set([absoluteFile, ...dependencies.map(dep => path.resolve(dep))])],
  }
}

export type MixinRender = (locals: Record<string, unknown>) => string

/** The `render` function of a module from {@link compileMixinModule}, for use in Node. */
export function loadMixinRender(code: string): MixinRender {
  // eslint-disable-next-line no-new-func
  return new Function(`${code.replace(/export \{ render \}\s*$/, '')}\nreturn render`)() as MixinRender
}
