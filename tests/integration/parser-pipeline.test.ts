import type { FileObject } from '../../lib/parser.ts'
import fs from 'fs-extra'
import { glob } from 'tinyglobby'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '../../lib/parser.ts'
import { createMinimalConfig } from '../fixtures/config.ts'

vi.mock('../../lib/markdown/index.ts', () => ({
  parseMarkdown: vi.fn(async (data) => {
    if ('markdownContent' in data)
      return `<p>${data.markdownContent.replace('Markdown:', '').trim()}</p>`
    return '<p>Mocked markdown</p>'
  }),
}))

describe('parser pipeline with real SCSS files', () => {
  const config = createMinimalConfig()

  async function loadScssFiles(): Promise<FileObject[]> {
    const paths = await glob('example-styleguide/sass/**/*.scss')
    return Promise.all(
      paths.map(async filePath => ({
        path: filePath,
        contents: await fs.readFile(filePath, 'utf-8'),
      })),
    )
  }

  it('parses real SCSS files and returns sections', async () => {
    const files = await loadScssFiles()
    expect(files.length).toBeGreaterThan(0)

    const result = await parse(files, config)
    expect(result).toBeDefined()
    expect(result!.content).toBeDefined()
    expect(result!.content.length).toBeGreaterThan(0)
  })

  it('output has correct first/second/third level hierarchy', async () => {
    const files = await loadScssFiles()
    const result = await parse(files, config)

    for (const firstLevel of result!.content) {
      expect(firstLevel.sectionLevel).toBe('first')
      expect(firstLevel.sections).toBeDefined()
      expect(Array.isArray(firstLevel.sections)).toBe(true)

      for (const secondLevel of firstLevel.sections) {
        expect(secondLevel.sectionLevel).toBe('second')
        expect(secondLevel.sections).toBeDefined()
        expect(Array.isArray(secondLevel.sections)).toBe(true)

        for (const thirdLevel of secondLevel.sections) {
          expect(thirdLevel.sectionLevel).toBe('third')
        }
      }
    }
  })

  it('all sections have required fields', async () => {
    const files = await loadScssFiles()
    const result = await parse(files, config)

    function assertSectionFields(section: any) {
      expect(section.id).toBeDefined()
      expect(typeof section.id).toBe('string')
      expect(section.header).toBeDefined()
      expect(typeof section.header).toBe('string')
      expect(section.sectionLevel).toBeDefined()
      expect(['first', 'second', 'third']).toContain(section.sectionLevel)
      expect(section.source).toBeDefined()
      expect(section.source.css).toBeDefined()
      expect(typeof section.source.css.file).toBe('string')
      expect(typeof section.source.css.line).toBe('number')
      expect(section.previewFileName).toBeDefined()
      expect(section.fullpageFileName).toBeDefined()
      expect(typeof section.description).toBe('string')
      expect(typeof section.markup).toBe('string')
      expect(Array.isArray(section.modifiers)).toBe(true)
    }

    for (const firstLevel of result!.content) {
      assertSectionFields(firstLevel)
      for (const secondLevel of firstLevel.sections) {
        assertSectionFields(secondLevel)
        for (const thirdLevel of secondLevel.sections) {
          assertSectionFields(thirdLevel)
        }
      }
    }
  })

  it('section references are correctly extracted', async () => {
    const files = await loadScssFiles()
    const result = await parse(files, config)

    for (const firstLevel of result!.content) {
      expect(firstLevel.id).toMatch(/^\d+(\.\d+)?$/)

      for (const secondLevel of firstLevel.sections) {
        expect(secondLevel.id).toMatch(/^\d+\.\d+$/)

        for (const thirdLevel of secondLevel.sections) {
          expect(thirdLevel.id).toMatch(/^\d+\.\d+\.\d+/)
        }
      }
    }
  })

  it('has no empty sections in output', async () => {
    const files = await loadScssFiles()
    const result = await parse(files, config)

    expect(result!.content.every(section => Boolean(section))).toBe(true)

    for (const firstLevel of result!.content) {
      expect(firstLevel).toBeTruthy()
      expect(firstLevel.sections.every((s: any) => Boolean(s))).toBe(true)

      for (const secondLevel of firstLevel.sections) {
        expect(secondLevel).toBeTruthy()
        expect(secondLevel.sections.every((s: any) => Boolean(s))).toBe(true)
      }
    }
  })
})
