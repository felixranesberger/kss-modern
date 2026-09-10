export interface RebuildQueueHandlers {
  /** Full rebuild — reparses everything and produces a fresh context. */
  onStructural: () => Promise<void>
  /** Incremental rebuild of the sections depending on the given markup files. */
  onMarkup: (changedFiles: string[]) => Promise<void>
  /** Reports a handler that rejected. The queue keeps draining either way. */
  onError?: (error: unknown) => void
}

export interface RebuildQueue {
  requestStructural: () => void
  requestMarkup: (changedFiles: Iterable<string>) => void
  /** Resolves once no rebuild is running and nothing is queued. */
  whenIdle: () => Promise<void>
}

/**
 * Serializes styleguide rebuilds.
 *
 * Without this, every watch event starts its own rebuild immediately: two saves
 * a few milliseconds apart run two full builds at once, which race on the shared
 * parse context and on the output directory — one build deleting the files the
 * other is writing surfaces as a spurious ENOENT and takes the dev server down.
 *
 * Requests that arrive while a rebuild is running are merged into the next run
 * rather than queued one-by-one, so a burst costs at most one extra rebuild. A
 * pending full rebuild absorbs pending markup work, because reparsing everything
 * already covers it.
 */
export function createRebuildQueue(handlers: RebuildQueueHandlers): RebuildQueue {
  let isRunning = false
  let isStructuralPending = false
  const pendingMarkupFiles = new Set<string>()
  let idleResolvers: (() => void)[] = []

  const hasPendingWork = () => isStructuralPending || pendingMarkupFiles.size > 0

  const releaseIdleWaiters = () => {
    const resolvers = idleResolvers
    idleResolvers = []
    resolvers.forEach(resolve => resolve())
  }

  const runNext = async () => {
    if (isStructuralPending) {
      isStructuralPending = false
      // A full rebuild reparses and rewrites everything, so any markup work
      // queued alongside it would be redundant.
      pendingMarkupFiles.clear()
      await handlers.onStructural()
      return
    }

    const changedFiles = [...pendingMarkupFiles]
    pendingMarkupFiles.clear()
    await handlers.onMarkup(changedFiles)
  }

  const drain = async () => {
    if (isRunning)
      return

    isRunning = true
    try {
      while (hasPendingWork()) {
        try {
          await runNext()
        }
        catch (error) {
          // One failed rebuild must not stall the queue: a later save has to be
          // able to recover the styleguide.
          handlers.onError?.(error)
        }
      }
    }
    finally {
      isRunning = false
      releaseIdleWaiters()
    }
  }

  return {
    requestStructural: () => {
      isStructuralPending = true
      void drain()
    },
    requestMarkup: (changedFiles) => {
      for (const file of changedFiles) {
        pendingMarkupFiles.add(file)
      }
      void drain()
    },
    whenIdle: () => {
      if (!isRunning && !hasPendingWork())
        return Promise.resolve()

      return new Promise<void>((resolve) => {
        idleResolvers.push(resolve)
      })
    },
  }
}
