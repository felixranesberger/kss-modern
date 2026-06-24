import { PUG_ERROR_OVERLAY_TAG } from '../../lib/shared.ts'

/**
 * Definition of the `<pug-error-overlay>` custom element used in development when a section's pug fails
 * to compile. `renderPugErrorOverlay` (server side) emits the bare tag — carrying the error in
 * `error-id` / `error-file` / `error-message` attributes — layered over the section's last good render;
 * this module, bundled into the fullpage client the preview always loads, upgrades that tag into the UI.
 *
 * The error UI lives in a shadow root so its styles are encapsulated both ways — the consumer's content
 * CSS can't reach in, and these styles can't leak out — and it is shown through the Popover API so it
 * renders in the document's top layer, above any stacking context (z-index, transform, fixed header, …)
 * the section's own markup might create. The error fields are written via `textContent`, so a pug error
 * message can never inject markup. Falls back to a max z-index fixed layer if the Popover API is absent.
 */

const ICON
  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#f43f5e" style="width:18px;height:18px;flex:none" aria-hidden="true"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" /></svg>'

const STYLES = `
  *{box-sizing:border-box}
  :host{display:block}
  :host([data-empty]){min-height:320px}
  .eo-pop{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;padding:24px;background:rgba(9,9,11,.72);align-items:flex-start;justify-content:center;overflow:auto;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .eo-pop:popover-open,.eo-pop[data-fallback]{display:flex}
  .eo-pop[data-fallback]{z-index:2147483647}
  .eo-card{max-width:760px;width:100%;height:fit-content;padding:16px 18px;border:1px solid #f43f5e59;border-radius:12px;background:#1f1f23;box-shadow:0 12px 32px -12px rgba(0,0,0,.7);color:#e4e4e7;line-height:1.5;text-align:left}
  .eo-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}
  .eo-badge{font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#fb7185}
  .eo-title{margin:0;font-size:16px;font-weight:600;color:#fafafa}
  .eo-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f43f5e1a;border-radius:5px;padding:1px 7px;color:#fda4af}
  .eo-file{margin:8px 0 0;font-size:13px;color:#a1a1aa;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
  .eo-pre{margin:12px 0 0;padding:12px 14px;background:#111113;border:1px solid #2a2a30;border-radius:8px;max-height:360px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;color:#f4f4f5;white-space:pre}
`

const TEMPLATE = `
  <style>${STYLES}</style>
  <div class="eo-pop" popover="manual">
    <div class="eo-card" role="alert">
      <div class="eo-head">${ICON}<span class="eo-badge">Pug compile error</span></div>
      <h1 class="eo-title">Section <code class="eo-id"></code> failed to compile</h1>
      <p class="eo-file"></p>
      <pre class="eo-pre"><code class="eo-msg"></code></pre>
    </div>
  </div>
`

class PugErrorOverlay extends HTMLElement {
  private initialized = false

  connectedCallback(): void {
    if (this.initialized)
      return
    this.initialized = true

    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = TEMPLATE

    root.querySelector('.eo-id')!.textContent = this.getAttribute('error-id') ?? ''
    root.querySelector('.eo-msg')!.textContent = this.getAttribute('error-message') ?? ''

    const fileEl = root.querySelector('.eo-file')!
    const file = this.getAttribute('error-file')
    if (file)
      fileEl.textContent = file
    else
      fileEl.remove()

    const pop = root.querySelector<HTMLElement & { showPopover: () => void }>('.eo-pop')!
    try {
      pop.showPopover()
    }
    catch {
      pop.setAttribute('data-fallback', '')
    }
  }
}

/** Register the `<pug-error-overlay>` element once; a no-op if it is already defined. */
export function definePugErrorOverlay(): void {
  if (!customElements.get(PUG_ERROR_OVERLAY_TAG))
    customElements.define(PUG_ERROR_OVERLAY_TAG, PugErrorOverlay)
}
