import type { FSWatcher } from 'chokidar'
import path from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { watchStyleguideForChanges } from '../../lib/watcher.ts'

const tmp = path.resolve('tests/.tmp-watcher')
const pugPath = path.join(tmp, 'pug', 'comp.pug')
const addedPug = path.join(tmp, 'pug', 'added.pug')
const scssPath = path.join(tmp, 'sass', 'styles.scss')
const mdPath = path.join(tmp, 'docs.md')

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

    watcher = watchStyleguideForChanges(`${tmp}/`, { onStructuralChange, onMarkupChange })
    await new Promise<void>(resolve => watcher.on('ready', () => resolve()))
  }, 20_000)

  afterAll(async () => {
    await watcher.close()
    await fs.remove(tmp)
  })

  it('routes a .pug change to onMarkupChange with the absolute path', async () => {
    onMarkupChange.mockClear()
    onStructuralChange.mockClear()

    await fs.writeFile(pugPath, '.comp v2 changed\n')
    await waitFor(() => onMarkupChange.mock.calls.length > 0)

    expect(onMarkupChange).toHaveBeenCalledWith(path.resolve(pugPath))
    expect(onStructuralChange).not.toHaveBeenCalled()
  })

  it('routes a newly added .pug file to onMarkupChange', async () => {
    onMarkupChange.mockClear()

    await fs.writeFile(addedPug, 'p added\n')
    await waitFor(() => onMarkupChange.mock.calls.length > 0)

    expect(onMarkupChange).toHaveBeenCalledWith(path.resolve(addedPug))
  })

  it('routes a deleted .pug file to onMarkupChange', async () => {
    onMarkupChange.mockClear()

    await fs.remove(addedPug)
    await waitFor(() => onMarkupChange.mock.calls.length > 0)

    expect(onMarkupChange).toHaveBeenCalledWith(path.resolve(addedPug))
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
})
