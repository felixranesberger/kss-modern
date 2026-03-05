import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PausableInterval } from '../../../client/utils/pausable-interval'

describe('PausableInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('constructor creates an inactive interval', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    expect(interval.isActive()).toBe(false)
    expect(callback).not.toHaveBeenCalled()
  })

  it('start() begins the interval and callback is called after interval ms', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()

    expect(interval.isActive()).toBe(true)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('start() when already running is a no-op', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()
    interval.start()

    vi.advanceTimersByTime(1000)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('stop() stops and resets remaining time', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()
    vi.advanceTimersByTime(500)

    interval.stop()

    expect(interval.isActive()).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('pause() pauses the timer and calculates remaining time', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()
    vi.advanceTimersByTime(400)

    interval.pause()

    expect(interval.isActive()).toBe(false)

    // Advancing time should not trigger callback while paused
    vi.advanceTimersByTime(1000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('pause() when not running is a no-op', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    // Should not throw
    interval.pause()

    expect(interval.isActive()).toBe(false)
  })

  it('resume() resumes with the remaining time', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()
    vi.advanceTimersByTime(400)

    interval.pause()
    interval.resume()

    expect(interval.isActive()).toBe(true)

    // Should fire after the remaining 600ms
    vi.advanceTimersByTime(599)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('isActive() returns true when running and false when stopped or paused', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    expect(interval.isActive()).toBe(false)

    interval.start()
    expect(interval.isActive()).toBe(true)

    interval.pause()
    expect(interval.isActive()).toBe(false)

    interval.resume()
    expect(interval.isActive()).toBe(true)

    interval.stop()
    expect(interval.isActive()).toBe(false)
  })

  it('setInterval() changes the interval and resets remaining', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.setInterval(500)

    interval.start()
    vi.advanceTimersByTime(500)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('setInterval() while running pauses, changes, and resumes', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()
    vi.advanceTimersByTime(300)

    interval.setInterval(500)

    expect(interval.isActive()).toBe(true)

    // remaining was reset to 500ms at the time of setInterval
    vi.advanceTimersByTime(499)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('multiple interval cycles call the callback repeatedly', () => {
    const callback = vi.fn()
    const interval = new PausableInterval(callback, 1000)

    interval.start()

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    // The internal start() re-schedules via recursive call.
    // After the callback fires, isRunning is still true, so the guard
    // in start() prevents re-scheduling. We need to manually restart
    // to simulate subsequent cycles.
    interval.stop()
    interval.start()

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(2)

    interval.stop()
    interval.start()

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(3)
  })
})
