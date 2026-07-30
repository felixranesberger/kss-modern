import type { FSWatcher } from 'chokidar'
import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchStyleguideForChanges } from '../../lib/watcher.ts'

const tmp = path.resolve('tests/.tmp-watcher')
const pugPath = path.join(tmp, 'pug', 'comp.pug')
const addedPug = path.join(tmp, 'pug', 'added.pug')
const scssPath = path.join(tmp, 'sass', 'styles.scss')
const mdPath = path.join(tmp, 'docs.md')

/**
 * Pause long enough for pending filesystem events to be delivered and for the
 * watcher's batch window to close, so one test's events cannot bleed into the next.
 */
function settle(ms = 500): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate())
        resolve()
      else if (Date.now() - start > timeoutMs)
        reject(new Error('timed out waiting for a watcher event'))
      else
        setTimeout(tick, 25)
    }
    tick()
  })
}

describe('watchStyleguideForChanges (real fs events)', () => {
  const onStructuralChange = vi.fn()
  const onMarkupChange = vi.fn()
  let watcher: FSWatcher

  beforeAll(async () => {
    await fs.remove(tmp)
    await fs.ensureDir(path.join(tmp, 'pug'))
    await fs.ensureDir(path.join(tmp, 'sass'))
    await fs.writeFile(pugPath, '.comp v1\n')
    await fs.writeFile(scssPath, '/*\nComp\n\nMarkup: <div>x</div>\n\nStyleguide 1.1\n*/\n')
    await fs.writeFile(mdPath, '# Docs v1\n')

    // Let the fixture writes settle *before* watching. Started immediately, chokidar
    // may report them as `change` events shortly after `ready` instead of treating
    // them as the ignored initial state — and a stray structural event landing in the
    // same batch as a test's markup edit is coalesced into a full rebuild, so the
    // markup handler correctly never fires and the test sees a phantom failure.
    await settle()

    watcher = watchStyleguideForChanges(`${tmp}/`, { onStructuralChange, onMarkupChange })
    await new Promise<void>(resolve => watcher.on('ready', () => resolve()))
    await settle()
  }, 20_000)

  afterAll(async () => {
    await watcher.close()
    await fs.remove(tmp)
  })

  // Events are dispatched in batches, so a preceding test's edit can still be in
  // flight. Draining before each test keeps the assertions about what was and was
  // not called meaningful.
  beforeEach(settle)

  it('routes a .pug change to onMarkupChange with the absolute path', async () => {
    onMarkupChange.mockClear()
    onStructuralChange.mockClear()

    await fs.writeFile(pugPath, '.comp v2 changed\n')
    await waitFor(() => onMarkupChange.mock.calls.length > 0)

    expect(onMarkupChange).toHaveBeenCalledWith([path.resolve(pugPath)])
    expect(onStructuralChange).not.toHaveBeenCalled()
  })

  it('routes a newly added .pug file to onMarkupChange', async () => {
    onMarkupChange.mockClear()

    await fs.writeFile(addedPug, 'p added\n')
    await waitFor(() => onMarkupChange.mock.calls.length > 0)

    expect(onMarkupChange).toHaveBeenCalledWith([path.resolve(addedPug)])
  })

  it('routes a deleted .pug file to onMarkupChange', async () => {
    onMarkupChange.mockClear()

    await fs.remove(addedPug)
    await waitFor(() => onMarkupChange.mock.calls.length > 0)

    expect(onMarkupChange).toHaveBeenCalledWith([path.resolve(addedPug)])
  })

  it('routes a .scss KSS change to onStructuralChange', async () => {
    onMarkupChange.mockClear()
    onStructuralChange.mockClear()

    await fs.writeFile(scssPath, '/*\nComp\n\nMarkup: <div>y</div>\n\nStyleguide 1.1\n*/\n')
    await waitFor(() => onStructuralChange.mock.calls.length > 0)

    expect(onStructuralChange).toHaveBeenCalled()
    expect(onMarkupChange).not.toHaveBeenCalled()
  })

  it('routes a .md change to onStructuralChange', async () => {
    onStructuralChange.mockClear()

    await fs.writeFile(mdPath, '# Docs v2\n')
    await waitFor(() => onStructuralChange.mock.calls.length > 0)

    expect(onStructuralChange).toHaveBeenCalled()
  })

  /**
   * A branch switch or a bulk edit touches many files at once. Without batching that
   * is one rebuild per file; with it, one rebuild for the whole set.
   */
  it('delivers several markup edits as one batched call', async () => {
    onMarkupChange.mockClear()
    onStructuralChange.mockClear()

    const secondPug = path.join(tmp, 'pug', 'second.pug')
    await fs.writeFile(pugPath, '.comp batched\n')
    await fs.writeFile(secondPug, '.second batched\n')
    await waitFor(() => onMarkupChange.mock.calls.length > 0)
    await settle()

    expect(onMarkupChange).toHaveBeenCalledTimes(1)
    expect([...onMarkupChange.mock.calls[0][0]].sort()).toEqual(
      [path.resolve(pugPath), path.resolve(secondPug)].sort(),
    )
  })

  it('coalesces a markup edit alongside a structural one into a single full rebuild', async () => {
    onMarkupChange.mockClear()
    onStructuralChange.mockClear()

    await fs.writeFile(pugPath, '.comp with structural\n')
    await fs.writeFile(scssPath, '/*\nComp\n\nMarkup: <div>z</div>\n\nStyleguide 1.1\n*/\n')
    await waitFor(() => onStructuralChange.mock.calls.length > 0)
    await settle()

    expect(onStructuralChange).toHaveBeenCalledTimes(1)
    expect(onMarkupChange).not.toHaveBeenCalled()
  })

  it('swallows watcher error events instead of crashing the process', () => {
    // Regression: FSWatcher is an EventEmitter, so before an 'error' listener was attached an
    // emitted error with no listener was re-thrown and killed the dev server. A parallel build
    // rewriting a watched output dir surfaces exactly this as a transient ENOENT (often a failed
    // unlink of a path that already vanished).
    const enoent = Object.assign(
      new Error('ENOENT: no such file or directory, unlink \'HTML-Prototype/dist-typo3\''),
      { code: 'ENOENT' },
    )
    expect(() => watcher.emit('error', enoent)).not.toThrow()

    // a non-transient error is logged but likewise must not escape and take the process down
    expect(() => watcher.emit('error', new Error('boom'))).not.toThrow()
  })
})
