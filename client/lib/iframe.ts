const MAX_WAIT_TIME = 5000

// NOTE: this module belongs to the `preview-inline` bundle, which is inlined
// into every page as a classic <script>. It must therefore stay free of exports
// that other entries import: a shared module would be split into a chunk, and
// the inlined script would start with an `import` statement it cannot execute —
// leaving the whole preview page invisible. `client/lib/a11y-report.ts` keeps
// its own copy of the readiness wait for exactly that reason.
async function waitForIframes(iframes: HTMLIFrameElement[]) {
  const getIsIframeLoaded = (iframe: HTMLIFrameElement) => {
    const doc = iframe.contentWindow?.document
    if (!doc)
      return false

    const hasBody = doc.body && doc.body.children.length > 0
    const isComplete = doc.readyState === 'complete'

    return hasBody && isComplete && doc.body.children.length > 0
  }

  await Promise.allSettled(
    iframes.map((iframe) => {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          const isIframeReady = getIsIframeLoaded(iframe)
          if (isIframeReady) {
            clearInterval(interval)
            return resolve()
          }
        }, 100)

        // resolve after some time, even if iframe is not loaded
        setTimeout(() => {
          clearInterval(interval)
          return resolve()
        }, MAX_WAIT_TIME)
      })
    }),
  )
}

function calculateIframeHeight(iframe: HTMLIFrameElement) {
  const doc = iframe.contentWindow?.document
  if (!doc)
    throw new Error('iFrame was not fully loaded yet')

  iframe.style.height = '0px'
  // eslint-disable-next-line ts/no-unused-expressions
  iframe.offsetHeight // Force reflow

  const contentHeight = Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    doc.documentElement.offsetHeight,
    doc.body.offsetHeight,
    doc.documentElement.clientHeight,
    doc.body.clientHeight,
  )

  iframe.style.height = `${contentHeight}px`
}

/**
 * The element the URL hash points at. A hash can also carry state rather than an id (the mixin
 * playground's `#props=…`), which is no valid selector, so it is looked up by id, never queried.
 */
function getHashTarget(): HTMLElement | null {
  if (!window.location.hash)
    return null
  try {
    return document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
  }
  catch {
    return null
  }
}

export function removeDocumentLoadingClass() {
  document.body.classList.add('js-loaded')
}

export default async (iframes: HTMLIFrameElement[]) => {
  await waitForIframes(iframes)

  iframes.forEach((iframe) => {
    calculateIframeHeight(iframe)

    const iframeWindow = iframe.contentWindow
    if (!iframeWindow)
      return

    const observer = new ResizeObserver(() => calculateIframeHeight(iframe))
    observer.observe(iframeWindow.document.body)

    // <details> toggle doesn't trigger ResizeObserver when body is constrained by iframe height
    iframeWindow.document.body.querySelectorAll('details').forEach((details) => {
      details.addEventListener('toggle', () => calculateIframeHeight(iframe))
    })
  })

  // calculate new when window size changes
  window.addEventListener('resize', () => {
    iframes.forEach(iframe => calculateIframeHeight(iframe))
  })

  // jump to anchor links when iframes are calculated
  const target = getHashTarget()
  if (target) {
    // TODO: check if we somehow can improve this dumb setTimeout functionality
    // wait till iframes are resized, so we can jump to anchor links
    await new Promise(resolve => setTimeout(resolve, 200))

    target.scrollIntoView()
  }

  removeDocumentLoadingClass()
}
