import type { PugWorkerOutput } from './worker.ts'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { computeDepSignatures, PugCompileCache } from './cache.ts'
import { compileMarkup } from './compile-core.ts'
import { PugDependencyGraph } from './dependency-graph.ts'

type Mode = 'production' | 'development'

const MAX_POOL_SIZE = os.cpus().length
// Below this many cache misses, compile on the main thread instead of spawning a worker pool.
// Incremental dev rebuilds touch one or two sections, so this avoids pool spawn/teardown churn.
const INLINE_THRESHOLD = 2

// Module-level singletons that live for the dev-server lifetime, replacing the old prod-only
// `processCache`. The cache invalidates per-dependency; the graph maps changed files -> sections.
const cache = new PugCompileCache()
const graph = new PugDependencyGraph()

export function getPugDependencyGraph(): PugDependencyGraph {
  return graph
}

/** Test helper: clear the module-level cache + dependency graph between cases. */
export function resetPugState(): void {
  cache.clear()
  graph.clear()
}

// resolve worker paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workerFilePath = __dirname.includes('dist/') ? './pug/worker.mjs' : './worker.ts'
const workerFilePathResolved = path.resolve(__dirname, workerFilePath)

let workerPool: Worker[] = []

async function terminateAllWorkers() {
  await Promise.all(workerPool.map(worker => worker.terminate()))
  workerPool = []
}

// terminate workers automatically on terminal exit
const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const
signals.forEach(signal => process.on(signal, async () => await terminateAllWorkers()))

function storeResult(id: string, markupSource: string, html: string, dependencies: string[]): Promise<void> {
  graph.setDependencies(id, dependencies)
  return computeDepSignatures(dependencies).then((depSignatures) => {
    cache.set(id, { markupSource, compiledHtml: html, dependencies, depSignatures })
  })
}

/** On a compile failure keep the last good output if we have one; otherwise leave the raw markup. */
function keepLastGood(repository: Map<string, { markup: string }>, id: string): void {
  const lastGood = cache.get(id)
  if (lastGood)
    repository.set(id, { markup: lastGood.compiledHtml })
}

async function compileInline(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  id: string,
): Promise<void> {
  const markupSource = repository.get(id)!.markup
  try {
    const { html, dependencies } = await compileMarkup(contentDir, mode, markupSource, id)
    repository.set(id, { markup: html })
    await storeResult(id, markupSource, html, dependencies)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Pug markup failed to compile for section "${id}": ${message}`)
    keepLastGood(repository, id)
  }
}

async function compileViaWorkerPool(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: string[],
): Promise<void> {
  const poolSize = Math.min(ids.length, MAX_POOL_SIZE)

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

  workerPool = Array.from({ length: poolSize }, (_, index) => {
    const worker = new Worker(workerFilePathResolved, {
      name: `pug-worker-${index}`,
    })
    freeWorkers.push(worker)
    return worker
  })

  const tasks = ids.map(async (id) => {
    const markupSource = repository.get(id)!.markup
    const worker = await acquireWorker()

    const result = await new Promise<PugWorkerOutput>((resolve) => {
      worker.once('message', resolve)
      worker.postMessage({ id, mode, html: markupSource, contentDir })
    })

    releaseWorker(worker)

    if ('error' in result) {
      console.error(result.error)
      keepLastGood(repository, id)
      return
    }

    repository.set(id, { markup: result.html })
    await storeResult(id, markupSource, result.html, result.dependencies)
  })

  await Promise.all(tasks)
  await terminateAllWorkers()
}

/**
 * Compile the given section ids, reusing cached output for sections whose markup and dependency
 * files are unchanged. Misses compile inline (small dev rebuilds) or via a worker pool (cold/large
 * builds). Returns a clone of `repository` with the requested ids replaced by compiled HTML.
 */
async function compileIds(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: string[],
): Promise<Map<string, { markup: string }>> {
  const clonedRepository = structuredClone(repository)
  if (ids.length === 0)
    return clonedRepository

  const misses: string[] = []
  await Promise.all(ids.map(async (id) => {
    const entry = clonedRepository.get(id)
    if (!entry)
      return

    if (await cache.isFresh(id, entry.markup)) {
      const cached = cache.get(id)!
      clonedRepository.set(id, { markup: cached.compiledHtml })
      graph.setDependencies(id, cached.dependencies)
      return
    }

    misses.push(id)
  }))

  if (misses.length === 0)
    return clonedRepository

  const useInline = mode === 'development' && misses.length <= INLINE_THRESHOLD
  if (useInline) {
    await Promise.all(misses.map(id => compileInline(mode, contentDir, clonedRepository, id)))
  }
  else {
    await compileViaWorkerPool(mode, contentDir, clonedRepository, misses)
  }

  return clonedRepository
}

/**
 * Full compile of every section in the repository (initial build / structural rebuild).
 * Seeds the cache + dependency graph; unchanged sections are served from cache.
 */
export async function compilePugMarkup(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
): Promise<Map<string, { markup: string }>> {
  return compileIds(mode, contentDir, repository, Array.from(repository.keys()))
}

/**
 * Incremental compile of only the given section ids (a `.pug` change). Cache-aware, so
 * insert-markup consumers whose own pug is unchanged are returned from cache.
 */
export async function compilePugMarkupIncremental(
  mode: Mode,
  contentDir: `${string}/`,
  repository: Map<string, { markup: string }>,
  ids: Iterable<string>,
): Promise<Map<string, { markup: string }>> {
  const wanted = Array.from(ids).filter(id => repository.has(id))
  return compileIds(mode, contentDir, repository, wanted)
}
