import { describe, expect, it } from 'vitest'
import { getFields } from '../../../../client/lib/playground/fields.ts'
import { formatPugCall, readPropsFromUrl, writePropsToHash, writePropsToQuery } from '../../../../client/lib/playground/state.ts'

describe('props in the URL', () => {
  it('round-trips props through the hash', () => {
    const url = writePropsToHash(new URL('https://example.test/page.html?controls=0'), { label: 'Save & go', count: 2 })
    expect(url.searchParams.get('controls')).toBe('0')
    expect(readPropsFromUrl(url)).toEqual({ props: { label: 'Save & go', count: 2 } })
  })

  it('reads ?props= and prefers the hash over it', () => {
    const query = writePropsToQuery(new URL('https://example.test/page.html'), { label: 'Query' })
    expect(readPropsFromUrl(query).props).toEqual({ label: 'Query' })
    expect(readPropsFromUrl(writePropsToHash(query, { label: 'Hash' })).props).toEqual({ label: 'Hash' })
  })

  it('refuses props from a link that carry markup or a script URL', () => {
    expect(readPropsFromUrl(writePropsToHash(new URL('https://example.test/'), { label: '<img src=x onerror=alert(1)>' })).error).toMatch(/not applied/)
    expect(readPropsFromUrl(writePropsToQuery(new URL('https://example.test/'), { link: { href: ' JavaScript:alert(1)' } })).error).toMatch(/not applied/)
    expect(readPropsFromUrl(writePropsToQuery(new URL('https://example.test/'), { href: 'https://example.test/a?b=c&d' })).props).toEqual({ href: 'https://example.test/a?b=c&d' })
  })

  it('reports invalid props', () => {
    expect(readPropsFromUrl(new URL('https://example.test/?props=%7Bnope')).error).toMatch(/not valid JSON/)
    expect(readPropsFromUrl(new URL('https://example.test/?props=%5B1%5D')).error).toMatch(/JSON object/)
  })
})

describe('formatPugCall', () => {
  it('writes the props as a Pug call', () => {
    expect(formatPugCall('button', { 'label': 'It\'s', 'icon': 'disk', 'data-x': [1, true] }))
      .toBe('+button({ label: \'It\\\'s\', icon: \'disk\', \'data-x\': [1, true] })')
  })

  it('leaves out props equal to their schema default', () => {
    const fields = getFields({ type: 'object', properties: { label: { type: 'string' }, variant: { type: 'string', enum: ['a', 'b'], default: 'a' } } })
    expect(formatPugCall('button', { label: 'Save', variant: 'a' }, fields)).toBe('+button({ label: \'Save\' })')
    expect(formatPugCall('button', {}, fields)).toBe('+button({})')
  })

  it('quotes record keys that are no identifiers', () => {
    expect(formatPugCall('button', { attributes: { 'data-open': true, 'hidden': false } }))
      .toBe('+button({ attributes: { \'data-open\': true, hidden: false } })')
  })

  it('leaves out fields of list entries equal to their default', () => {
    const fields = getFields({
      type: 'object',
      properties: {
        links: {
          type: 'array',
          items: { type: 'object', properties: { text: { type: 'string' }, isExternal: { type: 'boolean', default: false } }, required: ['text'] },
        },
      },
    })
    expect(formatPugCall('linkList', { links: [{ text: 'Home', isExternal: false }, { text: 'Docs', isExternal: true }] }, fields))
      .toBe('+linkList({ links: [{ text: \'Home\' }, { text: \'Docs\', isExternal: true }] })')
  })
})
