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

/** The virtual template a mixin is compiled from: include its file, call it with `props`. */
export function getMixinWrapperSource(file: string, name: string): string {
  return `include ${path.basename(file)}\n+${name}(props)`
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
 * defineComponent, useId, modifierClass })` returns HTML. Throws on a pug error.
 */
export function compileMixinModule(file: string, name: string): CompiledMixinModule {
  const absoluteFile = path.resolve(file)
  const { body, dependencies } = pug.compileClientWithDependenciesTracked(getMixinWrapperSource(absoluteFile, name), {
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
