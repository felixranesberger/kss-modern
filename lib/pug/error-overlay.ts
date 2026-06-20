import type { PugCompileError } from './index.ts'
import { escape } from '../template-utils.ts'

/**
 * Build the HTML shown in place of a section whose pug failed to compile (development only).
 *
 * The string replaces the section's compiled markup, so it becomes that section's preview content —
 * rendering inside the preview iframe right where the broken section would have appeared. It must
 * stay self-contained and natural-height: styles are inlined (the fullpage only loads the consumer's
 * content CSS), no viewport units are used (the preview iframe auto-sizes by collapsing to its
 * content height, so `vh` would resolve against a zero-height viewport), and it sizes to 100% width
 * so it reads correctly whether or not it is injected into a section's `Wrapper:`.
 */
export function renderPugErrorOverlay(error: PugCompileError): string {
  const id = escape(error.id)
  const file = error.file ? escape(error.file) : ''
  const message = escape(error.message)

  return `
<div
  role="alert"
  style="box-sizing:border-box;width:100%;margin:0;padding:16px 18px;border:1px solid #f43f5e59;border-radius:12px;background:#1f1f23;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e4e4e7;line-height:1.5;text-align:left;"
>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#f43f5e" style="width:18px;height:18px;flex:none;" aria-hidden="true">
      <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
    </svg>
    <span style="font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#fb7185;">Pug compile error</span>
  </div>
  <h1 style="margin:0;font-size:16px;font-weight:600;color:#fafafa;">Section <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f43f5e1a;border-radius:5px;padding:1px 7px;color:#fda4af;">${id}</code> failed to compile</h1>
  ${file ? `<p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${file}</p>` : ''}
  <pre style="margin:12px 0 0;padding:12px 14px;background:#111113;border:1px solid #2a2a30;border-radius:8px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;color:#f4f4f5;white-space:pre;"><code>${message}</code></pre>
</div>`.trim()
}
