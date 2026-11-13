/**
 * A popover anchored to a trigger that lists several values to copy, e.g. one color in HEX, RGB
 * and HSL. One shared popover serves every trigger on the page; `toggleCopyPopover()` fills it.
 *
 * It is a `popover="auto"` (top layer, light dismiss, Escape) holding plain groups of buttons,
 * not an ARIA menu, so Tab moves between the values. CSS anchor positioning places it below the
 * trigger and flips it at the viewport edges (`.c-copy-popover` in `client/style.css`). Browsers
 * without anchor positioning get the same placement from `positionWithoutAnchor()`.
 *
 * Copying keeps the popover open and confirms in the row itself, so several formats can be taken
 * one after another. A live region announces the copy to screen readers.
 */

export interface CopyPopoverItem {
  /** Short name of the value, e.g. `HEX`. */
  label: string
  value: string
}

export interface CopyPopoverOptions {
  /** Heading of the popover, also the accessible name of the value groups. */
  heading: string
  /** Muted line below the heading, e.g. the value as written in the source. */
  subheading?: string
  description?: string
  /** A CSS color shown as a swatch next to the heading. */
  preview?: string
  /** Groups of values, separated by a rule. */
  groups: CopyPopoverItem[][]
  /** Shown in the row and announced after copying. */
  copiedLabel?: string
  /** Shown in the row and announced when the clipboard refuses the value. */
  failedLabel?: string
}

interface ItemLabels {
  copied: string
  failed: string
}

const ANCHOR_NAME = '--copy-popover-anchor'
const VIEWPORT_GUTTER = 8
const TRIGGER_GAP = 8
const COPIED_DURATION = 1400

interface CopyPopover {
  root: HTMLElement
  preview: HTMLElement
  heading: HTMLElement
  subheading: HTMLElement
  description: HTMLElement
  body: HTMLElement
  status: HTMLElement
}

let popover: CopyPopover | undefined
let activeTrigger: HTMLElement | undefined

const supportsAnchorPositioning = CSS.supports('position-area: block-end')

function positionWithoutAnchor(root: HTMLElement, trigger: HTMLElement): void {
  const triggerRect = trigger.getBoundingClientRect()
  const { width, height } = root.getBoundingClientRect()

  const fitsBelow = triggerRect.bottom + TRIGGER_GAP + height <= window.innerHeight - VIEWPORT_GUTTER
  const top = fitsBelow
    ? triggerRect.bottom + TRIGGER_GAP
    : Math.max(VIEWPORT_GUTTER, triggerRect.top - TRIGGER_GAP - height)
  const left = Math.min(
    Math.max(VIEWPORT_GUTTER, triggerRect.left),
    window.innerWidth - VIEWPORT_GUTTER - width,
  )

  root.style.top = `${top}px`
  root.style.left = `${left}px`
}

/**
 * Scale the popover out of its trigger: below it the origin is the top edge, above it (after a
 * `flip-block`) the bottom edge, and likewise for the inline side. The CSS default origin is
 * `top left`, which keeps the measured left and top edges exact while the entry scale runs.
 */
function setTransformOrigin(root: HTMLElement, trigger: HTMLElement): void {
  const rootRect = root.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()

  const block = rootRect.top < triggerRect.top ? 'bottom' : 'top'
  const inline = rootRect.left < triggerRect.left - 1 ? 'right' : 'left'
  root.style.transformOrigin = `${inline} ${block}`
}

// `beforetoggle` fires synchronously for every close, light dismiss and Escape included
function handleBeforeToggle(event: ToggleEvent): void {
  if (event.newState === 'closed')
    activeTrigger?.setAttribute('aria-expanded', 'false')
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  return element
}

function createPopover(): CopyPopover {
  const root = createElement('div', 'c-copy-popover')
  root.id = 'copy-popover'
  root.setAttribute('popover', 'auto')
  root.style.setProperty('position-anchor', ANCHOR_NAME)

  const header = createElement('div', 'c-copy-popover__header')
  const preview = createElement('span', 'c-copy-popover__preview')
  preview.setAttribute('aria-hidden', 'true')
  const titles = createElement('div', 'c-copy-popover__titles')
  const heading = createElement('p', 'c-copy-popover__heading')
  heading.id = 'copy-popover-heading'
  const subheading = createElement('p', 'c-copy-popover__subheading')
  titles.append(heading, subheading)
  header.append(preview, titles)

  const description = createElement('p', 'c-copy-popover__description')
  const body = createElement('div', 'c-copy-popover__body')
  const status = createElement('p', 'sr-only')
  status.setAttribute('role', 'status')

  root.append(header, description, body, status)
  document.body.append(root)
  root.addEventListener('beforetoggle', event => handleBeforeToggle(event as ToggleEvent))

  return { root, preview, heading, subheading, description, body, status }
}

function setOptionalText(element: HTMLElement, text: string | undefined): void {
  element.textContent = text ?? ''
  element.hidden = !text
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    // `navigator.clipboard` is undefined outside a secure context, e.g. on a plain-http LAN address
    await navigator.clipboard.writeText(value)
    return true
  }
  catch (error) {
    console.error(error)
    return false
  }
}

function createItem(item: CopyPopoverItem, labels: ItemLabels, status: HTMLElement): HTMLButtonElement {
  const button = createElement('button', 'c-copy-popover__item')
  button.type = 'button'
  button.title = item.value

  const label = createElement('span', 'c-copy-popover__label')
  label.textContent = item.label

  const value = createElement('code', 'c-copy-popover__value')
  value.textContent = item.value

  const feedback = createElement('span', 'c-copy-popover__feedback')
  feedback.setAttribute('aria-hidden', 'true')

  const icon = createElement('span', 'c-copy-popover__icon')
  icon.setAttribute('aria-hidden', 'true')

  button.append(label, value, feedback, icon)

  let resetTimeout: number | undefined
  button.addEventListener('click', async () => {
    const isCopied = await copyToClipboard(item.value)
    const message = isCopied ? labels.copied : labels.failed

    feedback.textContent = message
    button.dataset.copyState = isCopied ? 'copied' : 'failed'
    status.textContent = `${message}: ${item.label} ${item.value}`
    window.clearTimeout(resetTimeout)
    resetTimeout = window.setTimeout(() => button.removeAttribute('data-copy-state'), COPIED_DURATION)
  })

  return button
}

function createGroup(items: CopyPopoverItem[], labels: ItemLabels, status: HTMLElement): HTMLElement {
  const group = createElement('div', 'c-copy-popover__group')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-labelledby', 'copy-popover-heading')
  group.append(...items.map(item => createItem(item, labels, status)))
  return group
}

function closePopover(fromPointer: boolean): void {
  const trigger = activeTrigger
  popover?.root.hidePopover()
  trigger?.focus({ focusVisible: !fromPointer } as FocusOptions)
}

export function isCopyPopoverOpenFor(trigger: HTMLElement): boolean {
  return activeTrigger === trigger && (popover?.root.matches(':popover-open') ?? false)
}

/**
 * Open the copy popover at `trigger`, or close it if it is already open there. `fromKeyboard`
 * moves focus to the first value, as a click with `event.detail === 0` came from Enter or Space.
 */
export function toggleCopyPopover(trigger: HTMLElement, options: CopyPopoverOptions, fromKeyboard = false): void {
  if (isCopyPopoverOpenFor(trigger)) {
    closePopover(!fromKeyboard)
    return
  }

  popover ??= createPopover()
  const { root, preview, heading, subheading, description, body, status } = popover

  if (root.matches(':popover-open'))
    root.hidePopover()

  heading.textContent = options.heading
  setOptionalText(subheading, options.subheading)
  setOptionalText(description, options.description)
  preview.hidden = !options.preview
  preview.style.setProperty('--copy-popover-preview', options.preview ?? 'transparent')
  status.textContent = ''

  const labels: ItemLabels = {
    copied: options.copiedLabel ?? 'Copied',
    failed: options.failedLabel ?? 'Copy failed',
  }
  body.replaceChildren(...options.groups
    .filter(items => items.length > 0)
    .map(items => createGroup(items, labels, status)))

  // The anchor stays on the last trigger until another one opens, so a closing animation keeps its place
  activeTrigger?.style.removeProperty('anchor-name')
  activeTrigger = trigger
  trigger.setAttribute('aria-controls', root.id)
  trigger.style.setProperty('anchor-name', ANCHOR_NAME)

  try {
    // `source` makes the trigger part of the popover's light-dismiss group, so clicking it closes
    // the popover instead of dismissing and reopening it
    root.showPopover({ source: trigger } as ShowPopoverOptions)
  }
  catch {
    root.showPopover()
  }
  trigger.setAttribute('aria-expanded', 'true')

  if (!supportsAnchorPositioning)
    positionWithoutAnchor(root, trigger)

  // Runs before the first frame, so the entry scale already starts from the trigger side
  root.style.removeProperty('transform-origin')
  setTransformOrigin(root, trigger)

  if (fromKeyboard)
    body.querySelector<HTMLButtonElement>('button')?.focus()
}
