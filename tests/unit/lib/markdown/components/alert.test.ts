import { describe, expect, it } from 'vitest'
import { alertRenderer } from '../../../../../lib/markdown/plugins/components/alert'

describe('alertRenderer', () => {
  it('defaults to info type', () => {
    const result = alertRenderer('<p>Content</p>', {})

    expect(result).toContain('bg-blue-100')
    expect(result).toContain('role="alert"')
  })

  it('renders warning type with yellow styles', () => {
    const result = alertRenderer('<p>Content</p>', { type: 'warning', title: 'Warning' })

    expect(result).toContain('bg-yellow-50')
    expect(result).toContain('text-yellow-800')
    expect(result).toContain('text-yellow-500')
  })

  it('renders error type with red styles', () => {
    const result = alertRenderer('<p>Content</p>', { type: 'error', title: 'Error' })

    expect(result).toContain('bg-red-100')
    expect(result).toContain('text-red-800')
    expect(result).toContain('text-red-500')
  })

  it('renders title when provided', () => {
    const result = alertRenderer('<p>Body</p>', { title: 'Important' })

    expect(result).toContain('Important')
    expect(result).toContain('font-bold')
  })

  it('does not render title element when title is not provided', () => {
    const result = alertRenderer('<p>Body</p>', {})

    expect(result).not.toContain('font-bold')
  })

  it('renders body content in the content div', () => {
    const result = alertRenderer('<p>My body content</p>', {})

    expect(result).toContain('<p>My body content</p>')
  })

  it('has role="alert" attribute', () => {
    const result = alertRenderer('<p>Content</p>', { type: 'info' })

    expect(result).toContain('role="alert"')
  })
})
