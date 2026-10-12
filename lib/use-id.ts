/**
 * The `useId` helper exposed to Pug templates. Pure, so the build (`lib/pug/compile-core.ts`) and the
 * mixin playground in the browser (`client/lib/playground`) hand out identical ids.
 */
import { sectionSanitizeId } from '../client/utils.ts'

/**
 * Creates the `useId` helper for a single render.
 *
 * Ids carry an `id-` prefix so they always start with a letter: a section id is numeric
 * (e.g. `80.90`), and a leading digit is a valid HTML id but NOT a valid CSS/querySelector token
 * (`document.querySelector('#80-90-x')` throws), so the prefix keeps generated ids safe to select.
 *
 * With a key, the id is derived purely from the section id and that key, e.g.
 * `useId('email')` inside section `2.30` returns `id-2-30-email`. It never depends on call
 * order, so the same key returns the same id on every re-render — a label and its input
 * can share one: `label(for=id)` / `input(id=id)`.
 *
 * Without a key, `useId()` hands out a fresh sequential id per call (`id-2-30-0`, `id-2-30-1`, …)
 * for "just give me a unique one" cases. The counter resets each render, so an unchanged
 * template stays stable across re-renders; it only shifts if no-arg calls are added/reordered.
 */
export function createUseId(sectionId: string) {
  const namespace = `id-${sectionSanitizeId(sectionId)}`
  let autoCounter = 0
  return (key?: string) => {
    if (key === undefined) {
      return `${namespace}-${autoCounter++}`
    }

    const suffix = String(key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return suffix ? `${namespace}-${suffix}` : namespace
  }
}
