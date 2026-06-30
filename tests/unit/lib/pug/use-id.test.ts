import { describe, expect, it } from 'vitest'
import { createUseId } from '../../../../lib/pug/compile-core.ts'

describe('createUseId', () => {
  it('namespaces and slugifies a key', () => {
    const useId = createUseId('2.30')
    expect(useId('email')).toBe('id-2-30-email')
    expect(useId('Email Address')).toBe('id-2-30-email-address')
  })

  it('returns the same id for the same key, regardless of call order', () => {
    const useId = createUseId('2.30')
    expect(useId('email')).toBe('id-2-30-email')
    useId('other')
    expect(useId('email')).toBe('id-2-30-email')
  })

  it('counts up for no-arg calls', () => {
    const useId = createUseId('2.30')
    expect(useId()).toBe('id-2-30-0')
    expect(useId()).toBe('id-2-30-1')
    expect(useId()).toBe('id-2-30-2')
  })

  it('keeps the no-arg counter independent of keyed calls', () => {
    const useId = createUseId('2.30')
    expect(useId('email')).toBe('id-2-30-email')
    expect(useId()).toBe('id-2-30-0')
    expect(useId('name')).toBe('id-2-30-name')
    expect(useId()).toBe('id-2-30-1')
  })

  it('resets the counter per render instance (stable across re-renders)', () => {
    expect(createUseId('2.30')()).toBe('id-2-30-0')
    expect(createUseId('2.30')()).toBe('id-2-30-0')
  })
})
