import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchDebounce } from '../../../lib/scheduling.ts'

describe('batchDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call the function before the window elapses', () => {
    const fn = vi.fn()
    const dispatch = batchDebounce<string>(fn, 300)

    dispatch('a')
    vi.advanceTimersByTime(299)

    expect(fn).not.toHaveBeenCalled()
  })

  it('delivers a single item as a one-element batch', () => {
    const fn = vi.fn()
    const dispatch = batchDebounce<string>(fn, 300)

    dispatch('a')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledWith(['a'])
  })

  it('collects every item within the window into one batch', () => {
    const fn = vi.fn()
    const dispatch = batchDebounce<string>(fn, 300)

    dispatch('a')
    vi.advanceTimersByTime(100)
    dispatch('b')
    vi.advanceTimersByTime(100)
    dispatch('c')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('restarts the window on every item, so a steady stream defers delivery', () => {
    const fn = vi.fn()
    const dispatch = batchDebounce<string>(fn, 300)

    for (let i = 0; i < 10; i++) {
      dispatch(`item-${i}`)
      vi.advanceTimersByTime(200)
    }

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][0]).toHaveLength(10)
  })

  it('starts a fresh batch after delivery', () => {
    const fn = vi.fn()
    const dispatch = batchDebounce<string>(fn, 300)

    dispatch('a')
    vi.advanceTimersByTime(300)
    dispatch('b')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenNthCalledWith(1, ['a'])
    expect(fn).toHaveBeenNthCalledWith(2, ['b'])
  })

  it('keeps duplicate items, leaving deduplication to the consumer', () => {
    const fn = vi.fn()
    const dispatch = batchDebounce<string>(fn, 300)

    dispatch('a')
    dispatch('a')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledWith(['a', 'a'])
  })
})
