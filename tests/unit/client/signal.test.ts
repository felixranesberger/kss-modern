import { describe, expect, it, vi } from 'vitest'
import { computed, effect, signal } from '../../../client/lib/signal'

describe('signal', () => {
  it('creates a signal with the given initial value', () => {
    const s = signal(42)
    expect(s.value).toBe(42)
  })

  it('returns the current value via .value getter', () => {
    const s = signal('hello')
    expect(s.value).toBe('hello')
  })

  it('dispatches a change event when .value is set to a new value', () => {
    const s = signal(1)
    const listener = vi.fn()
    s.addEventListener('change', listener)

    s.value = 2

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does NOT dispatch a change event when .value is set to the same value', () => {
    const s = signal(1)
    const listener = vi.fn()
    s.addEventListener('change', listener)

    s.value = 1

    expect(listener).not.toHaveBeenCalled()
  })

  it('.effect(fn) calls fn immediately and on each change', () => {
    const s = signal(10)
    const fn = vi.fn()

    s.effect(fn)

    expect(fn).toHaveBeenCalledTimes(1)

    s.value = 20
    expect(fn).toHaveBeenCalledTimes(2)

    s.value = 30
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('.effect(fn) returns a cleanup function that removes the listener', () => {
    const s = signal(10)
    const fn = vi.fn()

    const cleanup = s.effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    cleanup()

    s.value = 20
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('.valueOf() returns the raw value', () => {
    const s = signal(99)
    expect(s.valueOf()).toBe(99)
  })

  it('.toString() returns String(value)', () => {
    const s = signal(42)
    expect(s.toString()).toBe('42')

    const s2 = signal(null)
    expect(s2.toString()).toBe('null')
  })
})

describe('computed', () => {
  it('creates a computed signal with the initial derived value', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.value + b.value, [a, b])

    expect(sum.value).toBe(5)
  })

  it('recomputes when a dependency signal changes', () => {
    const a = signal(1)
    const b = signal(10)
    const sum = computed(() => a.value + b.value, [a, b])

    a.value = 5
    expect(sum.value).toBe(15)

    b.value = 20
    expect(sum.value).toBe(25)
  })
})

describe('effect', () => {
  it('calls fn immediately for each dependency', () => {
    const a = signal(1)
    const b = signal(2)
    const fn = vi.fn()

    effect([a, b], fn)

    // fn is called once per dep via dep.effect(fn), which calls fn() immediately
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('calls fn when any dependency changes', () => {
    const a = signal(1)
    const b = signal(2)
    const fn = vi.fn()

    effect([a, b], fn)
    fn.mockClear()

    a.value = 10
    expect(fn).toHaveBeenCalledTimes(1)

    b.value = 20
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('returns a cleanup function that removes all listeners', () => {
    const a = signal(1)
    const b = signal(2)
    const fn = vi.fn()

    const cleanup = effect([a, b], fn)
    fn.mockClear()

    cleanup()

    a.value = 10
    b.value = 20
    expect(fn).not.toHaveBeenCalled()
  })
})
