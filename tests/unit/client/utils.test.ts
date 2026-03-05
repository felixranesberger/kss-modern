import { describe, expect, it } from 'vitest'
import { id, sectionSanitizeId } from '../../../client/utils'

describe('id generator', () => {
  it('yields sequential prefixed IDs starting from id-0', () => {
    const first = id.next().value
    const second = id.next().value
    const third = id.next().value

    expect(first).toBe('id-0')
    expect(second).toBe('id-1')
    expect(third).toBe('id-2')
  })
})

describe('sectionSanitizeId', () => {
  it('converts to lowercase', () => {
    expect(sectionSanitizeId('Section')).toBe('section')
  })

  it('replaces dots with hyphens', () => {
    expect(sectionSanitizeId('Section.Name')).toBe('section-name')
  })

  it('handles multiple dots', () => {
    expect(sectionSanitizeId('A.B.C')).toBe('a-b-c')
  })

  it('handles string with no dots or uppercase', () => {
    expect(sectionSanitizeId('already-clean')).toBe('already-clean')
  })

  it('handles empty string', () => {
    expect(sectionSanitizeId('')).toBe('')
  })
})
