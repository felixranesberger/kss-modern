import { debounce } from '@antfu/utils'
import { animate } from 'motion'
import { queryRequired } from '../utils.ts'
import { PausableInterval } from '../utils/pausable-interval.ts'
import { signal } from './signal.ts'

const ALERT_INTERVAL = 3000

const alertContainer = queryRequired<HTMLElement>('#alerts')

const animations: {
  element: HTMLDivElement
  interval: PausableInterval
}[] = []

const isHovered = signal(false)

isHovered.effect(debounce(50, () => {
  animations.toReversed().forEach(({ element, interval }, index) => {
    if (isHovered.value) {
      interval.setInterval(ALERT_INTERVAL - (index * 250))
      interval.pause()
    }
    else {
      interval.resume()
    }

    const scale = 1 - (index * 0.1)
    const translateY = index === 0 ? 0 : -10 * index

    const elementsBefore = animations.slice(0, index)
    const gap = 5

    animate(element, {
      y: isHovered.value
        ? elementsBefore.reduce((acc, { element }) => acc + element.offsetHeight + gap, 0) * -1
        : translateY,
      scale: isHovered.value
        ? 1
        : scale,
    }, {
      ease: 'easeOut',
      duration: 0.3,
    })
  })
}))

function removeOldestAlert(animation: 'top' | 'bottom', overflows: boolean) {
  const alertCount = animations.length - 1

  const firstAlert = animations.shift()
  if (!firstAlert)
    throw new Error('First alert not found')

  firstAlert.interval.stop()

  let translateY = -10 * (alertCount + 1)
  let scale = alertCount === 1 ? 1 : (1 - (alertCount) * 0.1)
  if (overflows) {
    translateY += 10
    scale -= 0.1
  }

  animate(firstAlert.element, {
    y: animation === 'top' ? translateY : '50%',
    scale,
    opacity: 0,
  }, {
    duration: animation === 'top' ? 0.2 : 0.3,
    ease: 'easeOut',
  }).then(() => {
    firstAlert.element.remove()
  })
}

export function renderAlert(message: string, svg?: string) {
  if (animations.length === 3) {
    removeOldestAlert('top', true)
  }

  const alert = document.createElement('div')
  alert.setAttribute('role', 'alert')
  alert.classList.add('c-toast', 'z-50')
  alert.style.opacity = '0%'

  const span = document.createElement('span')
  span.textContent = message
  alert.append(span)

  // prepend svg inside before text content
  if (svg) {
    const svgElement = document.createElement('div')
    svgElement.innerHTML = svg
    alert.prepend(svgElement)
  }

  alert.addEventListener('mouseenter', () => isHovered.value = true)
  alert.addEventListener('mouseleave', () => isHovered.value = false)

  alertContainer?.append(alert)

  animate(alert, {
    y: ['100%', 0],
    scale: 1,
    opacity: 1,
  }, {
    ease: 'easeOut',
    duration: 0.3,
  })

  animations.toReversed().forEach(({ element }, index) => {
    const scale = (1 - (index + 1) * 0.1)
    const translateY = -10 * (index + 1)

    animate(element, {
      y: translateY,
      scale,
    }, { ease: 'easeOut', duration: 0.3 })
  })

  const interval = new PausableInterval(() => removeOldestAlert('bottom', false), ALERT_INTERVAL)
  animations.push({ element: alert, interval })
  interval.start()
}
