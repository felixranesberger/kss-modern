import { PUG_ERROR_OVERLAY_TAG } from '../../lib/shared.ts'

/**
 * Definition of the `<pug-error-overlay>` custom element used in development when a section's pug fails
 * to compile. `renderPugErrorOverlay` (server side) emits the bare tag — carrying the error in
 * `error-id` / `error-file` / `error-message` attributes — layered over the section's last good render;
 * this module, bundled into the fullpage client the preview always loads, upgrades that tag into the UI.
 *
 * The UI is modelled on the Next.js / Turbopack error dialog: a dark card with the error summary, then
 * a code-frame panel with a line-number gutter, the offending line highlighted, and a caret under the
 * failing column. Most pug compile errors (lexer/parser/linker) ship a code frame inside their message
 * — we parse that frame and repaint it; runtime errors that carry no frame fall back to the raw message.
 *
 * The error UI lives in a shadow root so its styles are encapsulated both ways — the consumer's content
 * CSS can't reach in, and these styles can't leak out — and it is shown through the Popover API so it
 * renders in the document's top layer, above any stacking context (z-index, transform, fixed header, …)
 * the section's own markup might create. Every error field is written via `textContent` (the syntax
 * highlighter only ever sets `textContent` on the spans it creates), so a pug error message can never
 * inject markup. Falls back to a max z-index fixed layer if the Popover API is absent.
 */

const ICON
  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#f43f5e" style="width:15px;height:15px;flex:none" aria-hidden="true"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" /></svg>'

const STYLES = `
  *{box-sizing:border-box}
  :host{display:block}
  :host([data-empty]){min-height:320px}
  .eo-pop{position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;padding:28px;background:rgba(0,0,0,.66);backdrop-filter:blur(3px);align-items:flex-start;justify-content:center;overflow:auto;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .eo-pop:popover-open,.eo-pop[data-fallback]{display:flex}
  .eo-pop[data-fallback]{z-index:2147483647}
  .eo-card{max-width:820px;width:100%;height:fit-content;padding:18px 20px 20px;border:1px solid #2a2a30;border-radius:14px;background:#161618;box-shadow:0 20px 60px -16px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.02);color:#e4e4e7;line-height:1.5;text-align:left}
  .eo-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .eo-badge{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#fb7185;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.24);border-radius:7px;padding:4px 9px}
  .eo-copy{font:inherit;font-size:12px;color:#a1a1aa;background:#1f1f23;border:1px solid #2e2e35;border-radius:7px;padding:5px 11px;cursor:pointer;transition:color .15s,border-color .15s}
  .eo-copy:hover{color:#fafafa;border-color:#3f3f47}
  .eo-copy:active{transform:translateY(1px)}
  .eo-title{margin:15px 0 0;font-size:16px;font-weight:600;color:#fafafa;white-space:pre-wrap;word-break:break-word}
  .eo-desc{margin:7px 0 0;font-size:13.5px;color:#a1a1aa}
  .eo-chip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:#27272a;border-radius:5px;padding:1px 6px;color:#e4e4e7}
  .eo-frame{margin:17px 0 0;border:1px solid #26262b;border-radius:10px;overflow:hidden;background:#0c0c0e}
  .eo-frame-head{display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:9px 13px;border-bottom:1px solid #1e1e22;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.4}
  .eo-fh-file{color:#d4d4d8}
  .eo-fh-loc{color:#71717a}
  .eo-fh-ctx{color:#71717a}
  .eo-code{overflow-x:auto;padding:8px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.6;--num-w:2ch}
  .eo-lines{display:inline-block;min-width:100%}
  .eo-row{display:flex}
  .eo-row.err{background:rgba(244,63,94,.1)}
  .ln{position:sticky;left:0;z-index:1;flex:none;display:flex;align-items:center;justify-content:flex-end;gap:5px;padding:0 16px 0 12px;background:#0c0c0e;color:#52525b;user-select:none}
  .eo-row.err .ln{background:#19090d;color:#fb7185;box-shadow:inset 2px 0 0 0 #f43f5e}
  .chev{width:7px;font-weight:700;color:#f43f5e}
  .num{min-width:var(--num-w);text-align:right}
  .lc{flex:none;white-space:pre;padding-right:18px;color:#e4e4e7}
  .eo-row.caret .lc{color:#f43f5e;font-weight:700}
  .eo-file{margin:14px 0 0;font-size:12.5px;color:#a1a1aa;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
  .eo-raw{margin:14px 0 0;padding:12px 14px;background:#0c0c0e;border:1px solid #26262b;border-radius:10px;max-height:360px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;color:#f4f4f5;white-space:pre}
  .tk-tag{color:#7dd3fc}
  .tk-kw{color:#c4b5fd}
  .tk-sel{color:#5eead4}
  .tk-str{color:#a5d6a7}
  .tk-com{color:#6b7280;font-style:italic}
`

interface FrameLine {
  num: number
  text: string
  isError: boolean
}

interface ParsedError {
  /** File path from the code-frame header, if present (the `error-file` attribute is preferred). */
  file: string | null
  /** 1-based line of the failing source line, if the frame reported it. */
  line: number | null
  /** 1-based column of the caret, if the frame reported it. */
  column: number | null
  /** The source lines around the error, with the failing one flagged. Empty when no frame was found. */
  frame: FrameLine[]
  /** The human-readable error text that follows the code frame (or the whole message when frameless). */
  summary: string
}

const PUG_KEYWORDS = new Set([
  'if',
  'else',
  'each',
  'for',
  'while',
  'case',
  'when',
  'default',
  'unless',
  'block',
  'extends',
  'include',
  'mixin',
  'append',
  'prepend',
  'yield',
  'in',
])

// A code-frame line: optional `> ` error marker, the line number, a pipe, then the source text.
const CODE_LINE_RE = /^(\s*(?:>\s*)?)(\d+)\| ?(.*)$/
// The caret line pug draws under the failing column: leading dashes/spaces then a single `^`.
const CARET_LINE_RE = /^[\s-]*\^\s*$/
// The frame header: `path/to/file.pug:line:col` (column optional), tolerating a leading `…Error:` label.
const HEADER_RE = /^(.*?):(\d+)(?::(\d+))?\s*$/

/**
 * Pull the structured pieces out of a pug error message. Compile errors carry a code frame we can
 * repaint; everything else falls through with an empty `frame` and the full message as `summary`.
 */
function parsePugError(message: string): ParsedError {
  const result: ParsedError = { file: null, line: null, column: null, frame: [], summary: '' }
  if (!message)
    return result

  const lines = message.split('\n')
  let start = 0

  // pug's frame opens with a bare `file:line:col` header; strip a leading `…Error:` label
  // defensively (in case the thrown error's message carries one) so the header regex still matches.
  const header = (lines[0] ?? '').replace(/^\w*Error:\s*/, '')
  const headerMatch = header.includes('|') ? null : header.match(HEADER_RE)
  if (headerMatch) {
    result.file = headerMatch[1] || null
    result.line = Number(headerMatch[2])
    result.column = headerMatch[3] ? Number(headerMatch[3]) : null
    start = 1
  }

  const messageLines: string[] = []
  let seenCode = false
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    const codeMatch = line.match(CODE_LINE_RE)
    if (codeMatch) {
      seenCode = true
      result.frame.push({ num: Number(codeMatch[2]), text: codeMatch[3], isError: codeMatch[1].includes('>') })
      continue
    }
    if (CARET_LINE_RE.test(line) && line.includes('^'))
      continue
    if (line.trim() === '' && !seenCode)
      continue
    messageLines.push(line)
  }

  while (messageLines.length && messageLines[0].trim() === '')
    messageLines.shift()
  while (messageLines.length && messageLines[messageLines.length - 1].trim() === '')
    messageLines.pop()
  result.summary = messageLines.join('\n').trim()

  return result
}

interface Token { cls?: string, text: string }

/** Tokenise the part of a pug line after its leading tag/keyword: `.class`/`#id` selectors and strings. */
function tokenizeRest(input: string, out: Token[]): void {
  let plain = ''
  const flush = (): void => {
    if (plain) {
      out.push({ text: plain })
      plain = ''
    }
  }
  for (let i = 0; i < input.length;) {
    const char = input[i]
    if (char === '"' || char === '\'') {
      flush()
      let j = i + 1
      while (j < input.length && input[j] !== char) {
        if (input[j] === '\\')
          j++
        j++
      }
      out.push({ cls: 'tk-str', text: input.slice(i, Math.min(j + 1, input.length)) })
      i = j + 1
    }
    else if (char === '.' || char === '#') {
      const sel = input.slice(i).match(/^[.#][\w-]+/)
      if (sel) {
        flush()
        out.push({ cls: 'tk-sel', text: sel[0] })
        i += sel[0].length
      }
      else {
        plain += char
        i++
      }
    }
    else {
      plain += char
      i++
    }
  }
  flush()
}

/** A deliberately light pug highlighter: leading indent, comments, the leading tag/keyword, then the rest. */
function pugTokens(text: string): Token[] {
  const out: Token[] = []
  const indent = text.match(/^\s*/)![0]
  let rest = text.slice(indent.length)
  if (indent)
    out.push({ text: indent })
  if (!rest)
    return out

  if (rest.startsWith('//')) {
    out.push({ cls: 'tk-com', text: rest })
    return out
  }

  const lead = rest.match(/^[A-Z][\w-]*/i)
  if (lead) {
    const word = lead[0]
    out.push({ cls: PUG_KEYWORDS.has(word) ? 'tk-kw' : 'tk-tag', text: word })
    rest = rest.slice(word.length)
  }

  tokenizeRest(rest, out)
  return out
}

/** Append a syntax-highlighted pug line to `el`, falling back to plain text if highlighting throws. */
function highlightInto(el: HTMLElement, text: string): void {
  try {
    for (const token of pugTokens(text)) {
      if (token.cls) {
        const span = document.createElement('span')
        span.className = token.cls
        span.textContent = token.text
        el.appendChild(span)
      }
      else {
        el.appendChild(document.createTextNode(token.text))
      }
    }
  }
  catch {
    el.textContent = text
  }
}

/** Create an element, optionally with a class and text content (the common create-and-fill pattern). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  if (text != null)
    node.textContent = text
  return node
}

/** Trim an absolute path down to its last three segments, prefixed with `…/` when truncated. */
function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length <= 3)
    return path.startsWith('/') ? `/${parts.join('/')}` : parts.join('/')
  return `…/${parts.slice(-3).join('/')}`
}

/** Build the code-frame panel: header (`file (line:col) @ section`) plus the highlighted source lines. */
function buildFrame(data: ParsedError, displayFile: string, id: string): HTMLElement {
  const frame = el('div', 'eo-frame')

  const head = el('div', 'eo-frame-head')
  const fileEl = el('span', 'eo-fh-file', displayFile ? shortenPath(displayFile) : 'unknown')
  fileEl.title = displayFile
  head.appendChild(fileEl)
  if (data.line != null)
    head.appendChild(el('span', 'eo-fh-loc', `(${data.line}${data.column != null ? `:${data.column}` : ''})`))
  if (id)
    head.appendChild(el('span', 'eo-fh-ctx', `@ ${id}`))
  frame.appendChild(head)

  const code = el('div', 'eo-code')
  const maxDigits = Math.max(...data.frame.map(line => String(line.num).length), 2)
  code.style.setProperty('--num-w', `${maxDigits}ch`)

  const lines = el('div', 'eo-lines')
  for (const line of data.frame) {
    const row = el('div', line.isError ? 'eo-row err' : 'eo-row')
    row.appendChild(buildGutter(String(line.num), line.isError))
    const lc = el('span', 'lc')
    highlightInto(lc, line.text)
    row.appendChild(lc)
    lines.appendChild(row)

    if (line.isError && data.column != null) {
      const caretRow = el('div', 'eo-row caret')
      caretRow.appendChild(buildGutter('', false))
      const caret = el('span', 'lc', '^')
      caret.style.paddingLeft = `${Math.max(0, data.column - 1)}ch`
      caretRow.appendChild(caret)
      lines.appendChild(caretRow)
    }
  }
  code.appendChild(lines)
  frame.appendChild(code)
  return frame
}

/** A gutter cell with a fixed-width chevron slot and right-aligned number, so every row's code aligns. */
function buildGutter(numText: string, isError: boolean): HTMLElement {
  const ln = el('span', 'ln')
  ln.appendChild(el('span', 'chev', isError ? '›' : ''))
  ln.appendChild(el('span', 'num', numText))
  return ln
}

class PugErrorOverlay extends HTMLElement {
  private initialized = false

  connectedCallback(): void {
    if (this.initialized)
      return
    this.initialized = true

    const root = this.attachShadow({ mode: 'open' })
    const style = el('style')
    style.textContent = STYLES
    root.appendChild(style)

    const id = this.getAttribute('error-id') ?? ''
    const file = this.getAttribute('error-file') ?? ''
    const message = this.getAttribute('error-message') ?? ''
    const data = parsePugError(message)
    const displayFile = file || data.file || ''

    const pop = el('div', 'eo-pop')
    pop.setAttribute('popover', 'manual')
    const card = el('div', 'eo-card')
    card.setAttribute('role', 'alert')
    pop.appendChild(card)

    const top = el('div', 'eo-top')
    const badge = el('span', 'eo-badge')
    const icon = el('span')
    icon.style.display = 'inline-flex'
    icon.innerHTML = ICON
    badge.appendChild(icon)
    badge.appendChild(el('span', '', 'Pug compile error'))
    top.appendChild(badge)
    top.appendChild(this.buildCopyButton(message))
    card.appendChild(top)

    const titleText = (data.summary.split('\n')[0] || '').trim() || 'Failed to compile'
    card.appendChild(el('h1', 'eo-title', titleText))

    const desc = el('p', 'eo-desc')
    if (id) {
      desc.appendChild(document.createTextNode('Section '))
      desc.appendChild(el('code', 'eo-chip', id))
      desc.appendChild(document.createTextNode(' couldn’t be compiled.'))
    }
    else {
      desc.textContent = 'A section couldn’t be compiled.'
    }
    card.appendChild(desc)

    if (data.frame.length) {
      card.appendChild(buildFrame(data, displayFile, id))
    }
    else {
      if (displayFile) {
        const fileEl = el('p', 'eo-file', shortenPath(displayFile))
        fileEl.title = displayFile
        card.appendChild(fileEl)
      }
      // The title already shows a single-line message; only fall back to the raw block when the
      // message carries more than that (a stack trace or multi-line detail) so nothing is hidden.
      if (message.includes('\n')) {
        const pre = el('pre', 'eo-raw')
        pre.appendChild(el('code', '', message))
        card.appendChild(pre)
      }
    }

    root.appendChild(pop)

    try {
      ;(pop as HTMLElement & { showPopover: () => void }).showPopover()
    }
    catch {
      pop.setAttribute('data-fallback', '')
    }
  }

  /** A "Copy error" button that copies the raw pug message; quietly no-ops if the clipboard is blocked. */
  private buildCopyButton(message: string): HTMLButtonElement {
    const button = el('button', 'eo-copy')
    button.type = 'button'
    button.textContent = 'Copy error'
    button.addEventListener('click', () => {
      void navigator.clipboard?.writeText(message).then(
        () => {
          button.textContent = 'Copied'
          setTimeout(() => (button.textContent = 'Copy error'), 1500)
        },
        () => {},
      )
    })
    return button
  }
}

/** Register the `<pug-error-overlay>` element once; a no-op if it is already defined. */
export function definePugErrorOverlay(): void {
  if (!customElements.get(PUG_ERROR_OVERLAY_TAG))
    customElements.define(PUG_ERROR_OVERLAY_TAG, PugErrorOverlay)
}
