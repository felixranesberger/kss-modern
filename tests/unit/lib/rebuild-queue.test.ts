import { describe, expect, it, vi } from 'vitest'
import { createRebuildQueue } from '../../../lib/rebuild-queue.ts'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('createRebuildQueue', () => {
  /**
   * The reason this queue exists: two builds at once race on the shared parse
   * context and on the output directory, where one deleting what the other writes
   * surfaces as a spurious ENOENT and kills the dev server.
   */
  it('never runs two rebuilds at the same time', async () => {
    let running = 0
    let maxRunning = 0

    const queue = createRebuildQueue({
      onStructural: async () => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        await sleep(10)
        running -= 1
      },
      onMarkup: async () => {},
    })

    queue.requestStructural()
    queue.requestStructural()
    queue.requestStructural()
    await queue.whenIdle()

    expect(maxRunning).toBe(1)
  })

  it('collapses a burst into the running rebuild plus a single rerun', async () => {
    let runs = 0

    const queue = createRebuildQueue({
      onStructural: async () => {
        runs += 1
        await sleep(20)
      },
      onMarkup: async () => {},
    })

    queue.requestStructural()
    for (let i = 0; i < 5; i++) {
      queue.requestStructural()
    }
    await queue.whenIdle()

    expect(runs).toBe(2)
  })

  it('merges markup files that arrive during a rebuild into one rerun', async () => {
    const batches: string[][] = []

    const queue = createRebuildQueue({
      onStructural: async () => {},
      onMarkup: async (files) => {
        batches.push(files)
        await sleep(20)
      },
    })

    queue.requestMarkup(['a.pug'])
    queue.requestMarkup(['b.pug'])
    queue.requestMarkup(['b.pug', 'c.pug'])
    await queue.whenIdle()

    expect(batches).toEqual([['a.pug'], ['b.pug', 'c.pug']])
  })

  /** A full rebuild rewrites everything, so queued markup work would be redundant. */
  it('lets a pending full rebuild absorb pending markup work', async () => {
    const markupBatches: string[][] = []
    let structuralRuns = 0

    const queue = createRebuildQueue({
      onStructural: async () => {
        structuralRuns += 1
      },
      onMarkup: async (files) => {
        markupBatches.push(files)
        await sleep(20)
      },
    })

    queue.requestMarkup(['a.pug'])
    queue.requestMarkup(['b.pug'])
    queue.requestStructural()
    await queue.whenIdle()

    expect(markupBatches).toEqual([['a.pug']])
    expect(structuralRuns).toBe(1)
  })

  it('reports a failed rebuild and stays usable afterwards', async () => {
    const onError = vi.fn()
    let structuralRuns = 0

    const queue = createRebuildQueue({
      onStructural: async () => {
        structuralRuns += 1
        if (structuralRuns === 1)
          throw new Error('build blew up')
      },
      onMarkup: async () => {},
      onError,
    })

    queue.requestStructural()
    await queue.whenIdle()

    queue.requestStructural()
    await queue.whenIdle()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(structuralRuns).toBe(2)
  })

  it('does not stall the queue when a rebuild fails mid-burst', async () => {
    const onError = vi.fn()
    const markupBatches: string[][] = []

    const queue = createRebuildQueue({
      onStructural: async () => {
        throw new Error('structural failed')
      },
      onMarkup: async (files) => {
        markupBatches.push(files)
      },
      onError,
    })

    queue.requestStructural()
    queue.requestMarkup(['a.pug'])
    await queue.whenIdle()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(markupBatches).toEqual([['a.pug']])
  })

  it('resolves whenIdle immediately while nothing is queued', async () => {
    const queue = createRebuildQueue({
      onStructural: async () => {},
      onMarkup: async () => {},
    })

    await expect(queue.whenIdle()).resolves.toBeUndefined()
  })
})
