import walk from 'pug-walk'
import { findMixinCode } from '../mixins/discovery.ts'

/**
 * Wraps the output of every public mixin, one that declares a `mixinSchema`, in a pair of HTML
 * comments: `<!-- START CARD-->` before it and `<!-- END CARD-->` after it. The integrator sees
 * where a component begins and ends in the delivered markup, and no template has to write the
 * markers by hand. The name comes from the last segment of `mixinName` (`molecules/Card` -> `CARD`,
 * `organisms/form/FileUpload` -> `FILE UPLOAD`), else from the mixin's own name.
 *
 * A mixin that already writes its own `// START …` comment at the top level of its body is left
 * alone, so templates can move over one by one and an AST that passes the plugin twice gains no
 * second pair.
 */

/** The marker name for a mixin: words of its last `mixinName` segment, upper case. */
export function getMixinMarkerName(name: string, mixinName?: string): string {
  const segment = mixinName?.split('/').map(part => part.trim()).filter(Boolean).at(-1) ?? name
  return segment
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_\s]+/g, ' ')
    .trim()
    .toUpperCase()
}

interface PugNode {
  type: string
  val?: string
  buffer?: boolean
  call?: boolean
  name?: string
  line?: number
  column?: number
  filename?: string
  block?: { nodes: PugNode[] }
}

function createComment(val: string, node: PugNode): PugNode {
  return { type: 'Comment', val, buffer: true, line: node.line, column: node.column, filename: node.filename }
}

function hasStartMarker(nodes: PugNode[]): boolean {
  return nodes.some(node => node.type === 'Comment' && node.buffer === true && node.val?.trim().startsWith('START '))
}

/** Pug plugin adding the START/END markers around every public mixin's output. */
export const mixinMarkerPlugin = {
  preCodeGen(ast: unknown) {
    return walk(ast, (node: PugNode) => {
      if (node.type !== 'Mixin' || node.call || !node.block || typeof node.name !== 'string')
        return
      if (hasStartMarker(node.block.nodes))
        return

      const { schemaSource, mixinName } = findMixinCode(node.block)
      if (schemaSource === undefined)
        return

      const markerName = getMixinMarkerName(node.name, mixinName)
      node.block.nodes = [
        createComment(` START ${markerName}`, node),
        ...node.block.nodes,
        createComment(` END ${markerName}`, node),
      ]
    })
  },
}
