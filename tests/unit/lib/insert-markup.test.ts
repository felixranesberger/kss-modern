import { describe, expect, it } from 'vitest'
import { resolveInsertMarkupForSections } from '../../../lib/insert-markup.ts'

describe('resolveInsertMarkupForSections', () => {
  const sectionsById = new Map([
    ['1.1', { modifiers: [{ name: '.btn--primary' }] }],
    ['1.2', { modifiers: [{ name: '.alert--danger' }] }],
    ['2.1', { modifiers: [] }],
  ])

  it('inserts the modifier render of pug markup', () => {
    const repository = new Map([
      ['1.1', { markup: '<button data-variant="default"></button>', modifierMarkup: ['<button data-variant="primary"></button>'] }],
      ['2.1', { markup: '<insert-markup>1.1-0</insert-markup>' }],
    ])
    const resolved = resolveInsertMarkupForSections(repository, sectionsById, ['2.1'])
    expect(resolved.get('2.1')?.markup).toBe('<button data-variant="primary"></button>')
  })

  it('swaps the placeholder in plain HTML without modifier renders', () => {
    const repository = new Map([
      ['1.2', { markup: '<div class="alert {{modifier_class}}"></div>' }],
      ['2.1', { markup: '<insert-markup>1.2-0</insert-markup>' }],
    ])
    const resolved = resolveInsertMarkupForSections(repository, sectionsById, ['2.1'])
    expect(resolved.get('2.1')?.markup).toBe('<div class="alert alert--danger"></div>')
  })

  it('resolves references inside the modifier renders of a section', () => {
    const repository = new Map([
      ['1.2', { markup: '<p>alert</p>' }],
      ['1.1', { markup: '<div></div>', modifierMarkup: ['<div><insert-markup>1.2</insert-markup></div>'] }],
    ])
    const resolved = resolveInsertMarkupForSections(repository, sectionsById, ['1.1'])
    expect(resolved.get('1.1')?.modifierMarkup).toEqual(['<div><p>alert</p></div>'])
  })
})
