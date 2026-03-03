import { animate, spring } from 'motion'
import { queryRequired } from '../utils.ts'
import { waitForIdleNetwork } from '../utils/network.ts'

export default function tabs(tabs: NodeListOf<HTMLElement>) {
  tabs.forEach((tab) => {
    const tabTriggers = tab.querySelectorAll<HTMLElement>('[role="tab"]')
    const tabContent = Array.from(tab.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
    const tabTriggerBackground = queryRequired<HTMLElement>('.tab-trigger-background', tab)

    setupTabInteraction(tabTriggers, tabTriggerBackground)
    setupIframePreloading(tabTriggers, tabContent)
  })
}

function setupTabInteraction(
  tabTriggers: NodeListOf<HTMLElement>,
  tabTriggerBackground: HTMLElement,
) {
  const calculateBackgroundPosition = (activeTrigger: HTMLElement, shouldAnimate: boolean) => {
    const width = activeTrigger.offsetWidth

    if (shouldAnimate) {
      const isFirstElement = activeTrigger === tabTriggers[0]
      const offset = isFirstElement
        ? activeTrigger.offsetLeft
        : activeTrigger.offsetLeft + 1

      animate(tabTriggerBackground, {
        width,
        x: `${offset}px`,
      }, {
        duration: 0.3,
        easing: 'ease-out',
        type: spring,
        bounce: 0.1,
      })
    }
    else {
      tabTriggerBackground.style.width = `${width}px`
      tabTriggerBackground.style.transform = `translateX(2px)`
    }
  }

  const initialActiveTrigger = tabTriggers[0]
  calculateBackgroundPosition(initialActiveTrigger, false)

  tabTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      calculateBackgroundPosition(trigger, true)
    })
  })

  return { calculateBackgroundPosition }
}

function testMoveBeforeSupport(): boolean {
  if (!('moveBefore' in Element.prototype))
    return false

  try {
    const testDiv = document.createElement('div')
    const testChild = document.createElement('span')
    testDiv.appendChild(testChild)
    testDiv.moveBefore(testChild, null)
    return true
  }
  catch {
    return false
  }
}

function setupIframePreloading(
  tabTriggers: NodeListOf<HTMLElement>,
  tabContent: HTMLElement[],
) {
  const isMobileView = window.innerWidth < 768
  if (isMobileView)
    return

  const supportsMoveBefore = testMoveBeforeSupport()
  const preloadingIframes = new Map<HTMLIFrameElement, { placeholder: Comment, container: HTMLDivElement } | { original: HTMLIFrameElement }>()

  setupTabClickHandlers(tabTriggers, tabContent, preloadingIframes, supportsMoveBefore)

  if (supportsMoveBefore) {
    preloadWithMoveBefore(tabTriggers, tabContent, preloadingIframes)
  }
  else {
    console.info('moveBefore API not supported, using clone fallback for iframe preloading')
    preloadWithClone(tabTriggers, tabContent, preloadingIframes)
  }
}

function setupTabClickHandlers(
  tabTriggers: NodeListOf<HTMLElement>,
  tabContent: HTMLElement[],
  preloadingIframes: Map<HTMLIFrameElement, any>,
  supportsMoveBefore: boolean,
) {
  tabTriggers.forEach(trigger => trigger.addEventListener('click', () => {
    tabTriggers.forEach((t) => {
      const isActive = t === trigger
      t.setAttribute('aria-selected', isActive.toString())
      const content = tabContent.find(c => c.getAttribute('aria-labelledby') === t.id)
      content?.setAttribute('tab-index', isActive ? '0' : '-1')
      content?.classList.toggle('hidden', !isActive)

      if (isActive) {
        handleActiveTabIframe(content, preloadingIframes, supportsMoveBefore)
      }
    })
  }))
}

function handleActiveTabIframe(
  content: HTMLElement | undefined,
  preloadingIframes: Map<HTMLIFrameElement, any>,
  supportsMoveBefore: boolean,
) {
  const iframe = content?.querySelector<HTMLIFrameElement>('iframe')
  if (!iframe || !preloadingIframes.has(iframe))
    return

  const data = preloadingIframes.get(iframe)!

  if (supportsMoveBefore && 'placeholder' in data) {
    // moveBefore approach: move iframe back
    const { placeholder, container } = data
    placeholder.parentNode?.moveBefore(iframe, placeholder.nextSibling)
    placeholder.remove()
    container.remove()
  }
  else if (!supportsMoveBefore && 'original' in data) {
    // Clone approach: replace original with loaded clone
    data.original.replaceWith(iframe)
    iframe.style.cssText = ''
    iframe.removeAttribute('aria-hidden')
  }

  preloadingIframes.delete(iframe)
}

function preloadWithMoveBefore(
  tabTriggers: NodeListOf<HTMLElement>,
  tabContent: HTMLElement[],
  preloadingIframes: Map<HTMLIFrameElement, any>,
) {
  tabTriggers.forEach((trigger) => {
    const content = tabContent.find(c => c.getAttribute('aria-labelledby') === trigger.id)
    if (!content)
      throw new Error(`No content found for trigger ${trigger.id}`)

    const iframe = content.querySelector<HTMLIFrameElement>('iframe')
    if (!iframe || iframe.loading !== 'lazy')
      return

    const preloadIframe = () => {
      const placeholder = document.createComment('iframe-placeholder')
      iframe.before(placeholder)

      const tempContainer = document.createElement('div')
      tempContainer.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;'
      document.body.appendChild(tempContainer)

      tempContainer.moveBefore(iframe, null)
      iframe.loading = 'eager'

      preloadingIframes.set(iframe, { placeholder, container: tempContainer })

      iframe.addEventListener('load', () => {
        if (preloadingIframes.has(iframe)) {
          placeholder.parentNode?.moveBefore(iframe, placeholder.nextSibling)
          placeholder.remove()
          tempContainer.remove()
          preloadingIframes.delete(iframe)
        }
      }, { once: true })
    }

    waitForIdleNetwork().then(preloadIframe)
  })
}

function preloadWithClone(
  tabTriggers: NodeListOf<HTMLElement>,
  tabContent: HTMLElement[],
  preloadingIframes: Map<HTMLIFrameElement, any>,
) {
  tabTriggers.forEach((trigger) => {
    const content = tabContent.find(c => c.getAttribute('aria-labelledby') === trigger.id)
    if (!content)
      throw new Error(`No content found for trigger ${trigger.id}`)

    const iframe = content.querySelector<HTMLIFrameElement>('iframe')
    if (!iframe || iframe.loading !== 'lazy')
      return

    const preloadIframe = () => {
      const clone = iframe.cloneNode(true) as HTMLIFrameElement
      clone.loading = 'eager'
      clone.style.cssText = 'position:absolute;top:-9999px;left:-9999px;visibility:visible;'
      clone.setAttribute('aria-hidden', 'true')

      preloadingIframes.set(clone, { original: iframe })

      clone.addEventListener('load', () => {
        if (preloadingIframes.has(clone)) {
          iframe.replaceWith(clone)
          clone.style.cssText = ''
          clone.removeAttribute('aria-hidden')
          preloadingIframes.delete(clone)
        }
      }, { once: true })

      document.body.appendChild(clone)
    }

    waitForIdleNetwork().then(preloadIframe)
  })
}
