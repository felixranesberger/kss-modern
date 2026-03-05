const SNAP_POINTS = [
  { width: 320, label: '320px – Mobile' },
  { width: 768, label: '768px – Tablet' },
  { width: 1024, label: '1024px – Desktop' },
  { width: 1200, label: '1200px – Desktop L' },
]

const SNAP_THRESHOLD = 14

function snapToBreakpoint(width: number): { width: number, label: string | null } {
  for (const point of SNAP_POINTS) {
    if (Math.abs(width - point.width) <= SNAP_THRESHOLD)
      return { width: point.width, label: point.label }
  }
  return { width, label: null }
}

function createWidthIndicator(container: HTMLElement): HTMLElement {
  const indicator = document.createElement('div')
  indicator.className = 'absolute -bottom-3 -right-0.5 text-[11px] leading-none font-mono opacity-0 pointer-events-none whitespace-nowrap transition-opacity duration-150'
  container.appendChild(indicator)
  return indicator
}

function updateIndicator(indicator: HTMLElement, width: number, label: string | null) {
  indicator.textContent = label ?? `${Math.round(width)}px`
  indicator.style.opacity = label ? '0.6' : '0.4'
}

export function initResizeHandles() {
  const containers = document.querySelectorAll<HTMLElement>('.preview-resize-container')

  containers.forEach((container) => {
    const handle = container.querySelector<HTMLElement>('.preview-resize-handle')
    if (!handle)
      return

    let startX = 0
    let startWidth = 0
    let indicator: HTMLElement | null = null

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      startX = e.clientX
      startWidth = container.offsetWidth
      handle.setPointerCapture(e.pointerId)
      container.classList.add('is-resizing')

      if (!indicator)
        indicator = createWidthIndicator(container)

      updateIndicator(indicator, startWidth, null)
    })

    handle.addEventListener('pointermove', (e: PointerEvent) => {
      if (!handle.hasPointerCapture(e.pointerId))
        return

      const delta = e.clientX - startX
      const parentWidth = container.parentElement?.clientWidth ?? container.offsetWidth
      const clampedWidth = Math.max(200, Math.min(startWidth + delta, parentWidth))

      if (clampedWidth >= parentWidth) {
        container.style.width = ''
      }
      else {
        const snapped = snapToBreakpoint(clampedWidth)
        container.style.width = `${snapped.width}px`
      }

      if (indicator) {
        const actualWidth = container.offsetWidth
        const snapped = snapToBreakpoint(actualWidth)
        updateIndicator(indicator, actualWidth, snapped.label)
      }
    })

    handle.addEventListener('lostpointercapture', () => {
      container.classList.remove('is-resizing')

      const parentWidth = container.parentElement?.clientWidth ?? 0
      const isAtFullWidth = container.offsetWidth >= parentWidth

      if (isAtFullWidth) {
        container.style.width = ''
        container.classList.remove('is-resized')
        if (indicator)
          indicator.style.opacity = ''
      }
      else {
        container.classList.add('is-resized')
        if (indicator)
          indicator.style.opacity = '0.4'
      }
    })

    handle.addEventListener('dblclick', () => {
      container.style.width = ''
      container.classList.remove('is-resized')
      if (indicator)
        indicator.style.opacity = ''
    })
  })
}
