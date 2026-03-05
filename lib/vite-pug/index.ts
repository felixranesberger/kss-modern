import type { PugWorkerOutput } from './worker.ts'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { fixAccessibilityIssues } from '../utils.ts'

const MAX_POOL_SIZE = os.cpus().length

let workerPool: Worker[] = []

async function terminateAllWorkers() {
  await Promise.all(workerPool.map(worker => worker.terminate()))
  workerPool = []
}

const processCache = new Map<string, string>()

// resolve worker paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workerFilePath = __dirname.includes('dist/') ? './vite-pug/worker.mjs' : './worker.ts'
const workerFilePathResolved = path.resolve(__dirname, workerFilePath)

// terminate workers automatically on terminal exit
const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const
signals.forEach(signal => process.on(signal, async () => await terminateAllWorkers()))

export async function compilePugMarkup(
  mode: 'production' | 'development',
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
) {
  const clonedRepository = structuredClone(repository)

  // get all processing id's
  const needsProcessingIds = Array.from(clonedRepository.entries())
    .map(([id]) => id)

  if (needsProcessingIds.length === 0)
    return clonedRepository

  // find maybe cached files
  if (mode === 'production') {
    needsProcessingIds.forEach((id) => {
      const cachedMarkup = processCache.get(id)
      if (!cachedMarkup)
        return

      clonedRepository.set(id, { markup: cachedMarkup })
      needsProcessingIds.splice(needsProcessingIds.indexOf(id), 1)
    })
  }

  const poolSize = Math.min(needsProcessingIds.length, MAX_POOL_SIZE)

  // Promise-based queue: waiters resolve when a worker becomes free
  const waiters: ((worker: Worker) => void)[] = []
  const freeWorkers: Worker[] = []

  function releaseWorker(worker: Worker) {
    const waiter = waiters.shift()
    if (waiter) {
      waiter(worker)
    }
    else {
      freeWorkers.push(worker)
    }
  }

  function acquireWorker(): Promise<Worker> {
    const worker = freeWorkers.pop()
    if (worker) {
      return Promise.resolve(worker)
    }
    return new Promise<Worker>(resolve => waiters.push(resolve))
  }

  // spawn workers
  workerPool = Array.from({ length: poolSize }, (_, index) => {
    const worker = new Worker(workerFilePathResolved, {
      name: `pug-worker-${index}`,
    })
    freeWorkers.push(worker)
    return worker
  })

  // process all files concurrently using the worker pool
  const tasks = needsProcessingIds.map(async (id) => {
    const { markup } = clonedRepository.get(id)!
    const worker = await acquireWorker()

    const result = await new Promise<PugWorkerOutput>((resolve) => {
      worker.once('message', resolve)
      worker.postMessage({ id, mode, html: markup, contentDir })
    })

    releaseWorker(worker)

    if ('error' in result) {
      console.error(result.error)
      return
    }

    clonedRepository.set(id, { markup: fixAccessibilityIssues(result.html) })
  })

  await Promise.all(tasks)
  await terminateAllWorkers()

  return clonedRepository
}
