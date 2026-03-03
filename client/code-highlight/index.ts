import HighlightWorker from './worker.ts?worker'

const cache = new Map<string, string>()

const CODE_HIGHLIGHTED_ATTRIBUTE = 'data-highlighted'

const POOL_SIZE = 5

// Promise-based worker pool
const waiters: ((worker: Worker) => void)[] = []
const freeWorkers: Worker[] = []

Array.from({ length: POOL_SIZE }, () => {
  const worker = new HighlightWorker()
  freeWorkers.push(worker)
  return worker
})

function acquireWorker(): Promise<Worker> {
  const worker = freeWorkers.pop()
  if (worker) {
    return Promise.resolve(worker)
  }
  return new Promise<Worker>(resolve => waiters.push(resolve))
}

function releaseWorker(worker: Worker) {
  const waiter = waiters.shift()
  if (waiter) {
    waiter(worker)
  }
  else {
    freeWorkers.push(worker)
  }
}

async function runShiki(lang: 'text' | 'html', text: string) {
  const worker = await acquireWorker()

  return new Promise<string>((resolve) => {
    worker.onmessage = (event) => {
      releaseWorker(worker)
      resolve(event.data)
    }

    worker.postMessage({ lang, text })
  })
}

export async function highlightCode(element: HTMLElement, modifierClass?: string) {
  const isAlreadyHighlighted = element.getAttribute(CODE_HIGHLIGHTED_ATTRIBUTE) === 'true'
  if (isAlreadyHighlighted)
    return

  let source = element.getAttribute('data-source-code')
  if (!source)
    throw new Error('No source code provided')

  const lang = (element.getAttribute('data-source-lang') || 'html') as 'text' | 'html'
  if (!lang)
    throw new Error('No source code language provided')

  source = decodeURIComponent(source).trim()

  // if modifier is provided, replace the modifier class
  if (modifierClass) {
    source = source.replaceAll('{{modifier_class}}', modifierClass)
  }

  let code = ''
  const cacheKey = `${lang}:::${source}`

  if (cache.has(cacheKey)) {
    code = cache.get(cacheKey)!
  }
  else {
    code = await runShiki(lang, source)
    cache.set(cacheKey, code)
  }

  // add code to the element
  element.insertAdjacentHTML('beforeend', code)

  // mark as highlighted
  element.setAttribute(CODE_HIGHLIGHTED_ATTRIBUTE, 'true')
}
