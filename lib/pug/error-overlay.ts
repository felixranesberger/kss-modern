import type { PugCompileError } from './index.ts'
import { PUG_ERROR_OVERLAY_TAG } from '../shared.ts'
import { escape } from '../template-utils.ts'

/**
 * Build the HTML for a section whose pug failed to compile (development only): the section's last
 * successfully compiled markup, followed by a `<pug-error-overlay>` element that paints the error on
 * the top layer over it. The element is defined in `client/lib/pug-error-overlay.ts`, bundled into the
 * fullpage client the preview always loads — so this only emits the tag, carrying the error in escaped
 * attributes the element reads via `textContent` (a pug error message can never inject markup).
 *
 * `lastHtml` stays in the light DOM so it keeps the consumer's page styling and contributes the
 * document height the preview iframe sizes to (it is sized to `body.scrollHeight`, and top-layer
 * elements don't count). When a previous render exists the preview keeps its content and height (no
 * collapse / jump-to-top); when `lastHtml` is empty the element carries `data-empty` so it still
 * reserves height for the overlay. `lastHtml` is already-compiled HTML and is not escaped.
 *
 * The overlay is not part of the section's source, so `stripPugErrorOverlay` removes it from the
 * code-copy value, the "show code" view, and the html-validate audit while the iframe still renders it.
 */
export function renderPugErrorOverlay(error: PugCompileError, lastHtml = ''): string {
  const id = escape(error.id)
  // newlines survive an HTML attribute, but encode them so a formatter can't collapse the code frame
  const message = escape(error.message).replace(/\r?\n/g, '&#10;')
  const fileAttr = error.file ? ` error-file="${escape(error.file)}"` : ''
  const emptyAttr = lastHtml ? '' : ' data-empty'

  const overlay = `<${PUG_ERROR_OVERLAY_TAG} error-id="${id}"${fileAttr} error-message="${message}"${emptyAttr}></${PUG_ERROR_OVERLAY_TAG}>`
  return `${lastHtml}${overlay}`.trim()
}
