import type { StyleguideConfiguration } from './index.ts'
import path from 'node:path'
import { parseMarkdown } from './markdown'

export interface FileObject {
  base?: string
  path?: string
  contents: string
}

interface CommentBlock {
  line: number
  text: string
  raw: string
}

interface StyleGuide {
  files: string[]
  sections: Section[]
}

interface Section {
  raw: string
  header: string
  description: string
  modifiers: Modifier[]
  parameters: Parameter[]
  markup: string
  reference?: string
  deprecated?: boolean
  experimental?: boolean
  colors?: ColorObject[]
  icons?: IconObject[]
  figma?: string
  status?: string
  wrapper?: string
  htmlclass?: string
  bodyclass?: string
  weight?: number
  source: {
    filename: string
    path: string
    line: number
  }
}

interface Modifier {
  name: string
  description: string
}

interface Parameter {
  name: string
  defaultValue: string
  description: string
}

interface ColorObject {
  name?: string
  color: string
  description?: string
}

interface IconObject {
  name: string
  svg: string
}

interface ParseOptions {
  markdown?: boolean
  header?: boolean
  custom?: string[]
}

interface CommentRegex {
  single: RegExp
  docblockStart: RegExp
  multiStart: RegExp
  multiFinish: RegExp
}

/**
 * Convert colors doc block to a collection of color objects
 */
function parseColors(text: string): ColorObject[] {
  text = text.trim()
  const colors: ColorObject[] = []

  // Extract colors (hex, rgb, css variables etc)
  const regex = /^(\S+)\s*:\s*(var\(--[a-z0-9-]+\)|[a-z]+|#[0-9a-f]{3}|#(?:[0-9a-f]{2}){2,4}|(?:rgb|hsl)a?\((?:-?\d+%?[,\s]+){2,3}[\d.]+%?\))(?:\s*-\s*(.*))?$/gim

  let test = regex.exec(text)

  while (test !== null) {
    const color: ColorObject = {
      color: test[2],
    }

    if (test[1]) {
      color.name = test[1]
    }

    if (test[3]) {
      color.description = test[3]
    }

    colors.push(color)
    test = regex.exec(text)
  }

  return colors
}

function parseIcons(text: string): IconObject[] {
  text = text.trim()
  const icons: IconObject[] = []

  // Extract <svg> and <i> tags
  const regex = /^([^:]+):\s*(<svg[^>]*>[\s\S]*?<\/svg>|<i[^>]*><\/i>)$/gm

  let match = regex.exec(text)

  while (match !== null) {
    const icon: IconObject = {
      name: match[1].trim(),
      svg: match[2],
    }

    icons.push(icon)
    match = regex.exec(text)
  }

  // Add extra validation and error handling
  icons.forEach((icon, index) => {
    const isValidSvg = icon.svg.startsWith('<svg') && icon.svg.endsWith('</svg>')
    const isValidI = icon.svg.startsWith('<i') && icon.svg.endsWith('</i>')

    if (!isValidSvg && !isValidI) {
      console.warn(`Warning: Icon "${icon.name}" at index ${index} may have malformed content`)
    }
  })

  return icons
}

/**
 * Convert String to Float
 */
function toFloat(value: string): number {
  return Number.isNaN(Number(value)) ? 0 : Number.parseFloat(value)
}

/**
 * Parse an array/string of documented CSS
 */
function kssParser(input: string | (string | FileObject)[], options: ParseOptions = {}): StyleGuide {
  // Default parsing options
  options.markdown = options.markdown ?? true
  options.header = options.header ?? true
  options.custom = options.custom || []

  // Initialize files array and style guide object
  let files: FileObject[] = []
  const styleGuide: StyleGuide = {
    files: [],
    sections: [],
  }

  // Process input into files array
  if (typeof input === 'string') {
    files.push({ contents: input })
  }
  else {
    files = input.map((file) => {
      if (typeof file === 'string') {
        return { contents: file }
      }
      else {
        styleGuide.files.push(file.path as string)
        return file
      }
    })
  }

  // Process each file
  for (const file of files) {
    const comments = findCommentBlocks(file.contents)

    for (const comment of comments) {
      // Create new section
      const newSection: Section = {
        raw: comment.raw,
        header: '',
        description: '',
        modifiers: [],
        parameters: [],
        markup: '',
        source: {
          filename: file.base ? path.relative(file.base, file.path || '').replace(/\\/g, '/') : (file.path || ''),
          path: file.path || '',
          line: comment.line,
        },
      }

      // Split into paragraphs and process
      const paragraphs = comment.text.split('\n\n')

      // Find reference
      for (let i = 0; i < paragraphs.length; i++) {
        const reference = findReference(paragraphs[i])
        if (reference) {
          newSection.reference = reference
          paragraphs.splice(i, 1)
        }
      }

      if (!newSection.reference) {
        continue
      }

      // Process properties
      const sectionRecord = newSection as unknown as Record<string, unknown>
      processProperty(sectionRecord, paragraphs, 'Colors', parseColors)
      processProperty(sectionRecord, paragraphs, 'Wrapper', x => x.trim())
      processProperty(sectionRecord, paragraphs, 'htmlclass', x => x.trim())
      processProperty(sectionRecord, paragraphs, 'bodyclass', x => x.trim())
      processProperty(sectionRecord, paragraphs, 'Icons', parseIcons)
      processProperty(sectionRecord, paragraphs, 'Figma', x => x.trim())
      processProperty(sectionRecord, paragraphs, 'Status', x => x.trim().toLowerCase())
      processProperty(sectionRecord, paragraphs, 'Markup')
      processProperty(sectionRecord, paragraphs, 'Weight', toFloat)

      // Process custom properties
      for (const customProperty of options.custom!) {
        processProperty(sectionRecord, paragraphs, customProperty)
      }

      // Process section content
      if (paragraphs.length === 0) {
        newSection.header = newSection.reference
      }
      else if (paragraphs.length === 1) {
        newSection.header = newSection.description = paragraphs[0]
      }
      else {
        newSection.header = paragraphs[0]
        const possibleModifiers = paragraphs.pop() || ''
        let rawModifiers = possibleModifiers.split('\n')
        newSection.description = paragraphs.join('\n\n')

        // Process modifiers
        const numModifierLines = rawModifiers.length
        let hasModifiers = true
        let lastModifier = 0

        for (let j = 0; j < numModifierLines; j++) {
          if (rawModifiers[j].match(/^\s*(?:\S.*?|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])\s+-\s/g)) {
            lastModifier = j
          }
          else if (j === 0) {
            hasModifiers = false
            j = numModifierLines
          }
          else {
            rawModifiers[lastModifier] += ` ${rawModifiers[j].replace(/^\s+|\s+$/g, '')}`
            rawModifiers[j] = ''
          }
        }

        rawModifiers = rawModifiers.filter(line => line !== '')

        if (hasModifiers) {
          if (newSection.markup) {
            newSection.modifiers = createModifiers(rawModifiers)
          }
          else {
            newSection.parameters = createParameters(rawModifiers)
            newSection.modifiers = []
          }
        }
        else {
          newSection.description += `\n\n${possibleModifiers}`
          newSection.modifiers = []
        }
      }

      // Clean up header
      newSection.header = newSection.header.replace(/\n/g, ' ')

      // Check status
      newSection.deprecated = hasPrefix(newSection.description, 'Deprecated')
      newSection.experimental = hasPrefix(newSection.description, 'Experimental')

      // Handle header option
      if (options.header) {
        if (newSection.description.match(/\n{2,}/)) {
          newSection.description = newSection.description.replace(/^.*\n{2,}/, '')
        }
        else {
          newSection.description = ''
        }
      }

      styleGuide.sections.push(newSection)
    }
  }

  return styleGuide
}

/**
 * Find comment blocks in input string
 */
function findCommentBlocks(input: string): CommentBlock[] {
  const commentRegex: CommentRegex = {
    single: /^\s*\/\/.*$/,
    docblockStart: /^\s*\/\*\*\s*$/,
    multiStart: /^\s*\/\*+\s*$/,
    multiFinish: /^\s*\*\/\s*$/,
  }

  input = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const blocks: CommentBlock[] = []
  let block: CommentBlock = {
    line: 0,
    text: '',
    raw: '',
  }

  let indentAmount: string | false = false
  let insideSingleBlock = false
  let insideMultiBlock = false
  let insideDocblock = false

  input += '\n'
  const lines = input.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s*$/, '')

    if (!insideMultiBlock && !insideDocblock && line.match(commentRegex.single)) {
      block.raw += `${line}\n`
      block.text += `${line.replace(/^\s*\/\/\s?/, '')}\n`
      if (!insideSingleBlock) {
        block.line = i + 1
      }
      insideSingleBlock = true
      continue
    }

    if (insideSingleBlock || (insideMultiBlock || insideDocblock) && line.match(commentRegex.multiFinish)) {
      const doneWithCurrentLine = !insideSingleBlock
      block.text = block.text.replace(/^\n+/, '').replace(/\n+$/, '')
      blocks.push({ ...block })
      insideMultiBlock = insideDocblock = insideSingleBlock = false
      indentAmount = false
      block = { line: 0, text: '', raw: '' }
      if (doneWithCurrentLine)
        continue
    }

    if (line.match(commentRegex.docblockStart)) {
      insideDocblock = true
      block.raw += `${line}\n`
      block.line = i + 1
      continue
    }

    if (insideDocblock) {
      block.raw += `${line}\n`
      block.text += `${line.replace(/^\s*\*\s?/, '')}\n`
      continue
    }

    if (line.match(commentRegex.multiStart)) {
      insideMultiBlock = true
      block.raw += `${line}\n`
      block.line = i + 1
      continue
    }

    if (insideMultiBlock) {
      block.raw += `${line}\n`
      if (indentAmount === false) {
        if (line === '')
          continue
        indentAmount = line.match(/^\s*/)![0]
      }
      block.text += `${line.replace(new RegExp(`^${indentAmount}`), '')}\n`
    }
  }

  return blocks
}

/**
 * Create modifier objects from raw modifier strings
 */
function createModifiers(rawModifiers: string[]): Modifier[] {
  return rawModifiers.map((entry) => {
    const modifier = entry.split(/\s+-\s+/, 1)[0]
    const description = entry.replace(modifier, '').replace(/^\s+-\s+/, '')

    return {
      name: modifier,
      description,
    }
  })
}

/**
 * Create parameter objects from raw parameter strings
 */
function createParameters(rawParameters: string[]): Parameter[] {
  return rawParameters.map((entry) => {
    const parameter = entry.split(/\s+-\s+/, 1)[0]
    const defaultValue = ''
    const description = entry.replace(parameter, '').replace(/^\s+-\s+/, '')

    if (/\s+=\s+/.test(parameter)) {
      const tokens = parameter.split(/\s+=\s+/)
      return {
        name: tokens[0],
        defaultValue: tokens[1],
        description,
      }
    }

    return {
      name: parameter,
      defaultValue,
      description,
    }
  })
}

/**
 * Find reference number in text
 */
function findReference(text: string): string | false {
  text = text.trim().replace(/\s+/g, ' ')
  const regex = /^style\s?guide\s?[-:]?\s?/i

  if (regex.test(text)) {
    return text.replace(regex, '')
  }
  return false
}

/**
 * Process a property in the comment block
 */
function processProperty(
  section: Record<string, unknown>,
  paragraphs: string[],
  propertyName: string,
  processValue?: (value: string) => unknown,
): void {
  let indexToRemove: number | false = false
  propertyName = propertyName.toLowerCase()

  for (let i = 0; i < paragraphs.length; i++) {
    if (hasPrefix(paragraphs[i], propertyName)) {
      let value: unknown = paragraphs[i].replace(
        new RegExp(`^\\s*${propertyName}\\:\\s+?`, 'gim'),
        '',
      )
      if (typeof processValue === 'function') {
        value = processValue(value as string)
      }
      section[propertyName] = value
      indexToRemove = i
      break
    }
  }

  if (indexToRemove !== false) {
    paragraphs.splice(indexToRemove, 1)
  }
}

/**
 * Check if description has a specific prefix
 */
function hasPrefix(description: string, prefix: string): boolean {
  return new RegExp(`^\\s*${prefix}\\:`, 'gim').test(description)
}

function extractMarkdownPath(input: string): string | null {
  // Normalize the input by trimming and ensuring consistent spacing
  const normalizedInput = input.trim()

  // Check if the string starts with "Markdown:" (with optional space after the colon)
  const markdownPrefix = /^Markdown:\s*/i
  if (!markdownPrefix.test(normalizedInput)) {
    return null
  }

  // Extract the path by removing the prefix
  const path = normalizedInput.replace(markdownPrefix, '').trim()

  // Check if the path ends with .md
  if (!path.endsWith('.md')) {
    return null
  }

  return path
}

export interface in2Section {
  id: string
  sectionLevel: 'first' | 'second' | 'third'
  header: string
  description: string
  hasMarkdownDescription: boolean
  markup: string
  modifiers: {
    value: string
    description: string
  }[]
  colors?: ColorObject[]
  icons?: IconObject[]
  figma?: string
  status?: string
  wrapper?: string
  htmlclass?: string
  bodyclass?: string
  source: {
    css: {
      file: string
      line: number
    }
    markup?: {
      file: string
    }
  }
  previewFileName: string
  fullpageFileName: string
}

export interface in2FirstLevelSection extends in2Section {
  sections: in2SecondLevelSection[]
}

export interface in2SecondLevelSection extends in2Section {
  sections: in2Section[]
}

export async function parse(input: string | (string | FileObject)[], config: StyleguideConfiguration) {
  const data = kssParser(input).sections.filter(section => Boolean(section.reference))

  // stores the ids of the sections that are overwritten because the ids are duplicated
  const overwrittenSectionsIds: string[] = []

  // sort by reference id
  const sortedData = data.sort((a, b) => {
    return a.reference!.localeCompare(b.reference!)
  })

  let output: in2FirstLevelSection[] = []

  async function computeDescription(description: string, rootHeadingLevel: 1 | 2) {
    // make sure description specifies that it's markdown content
    if (!description || !description.includes('Markdown:'))
      return { description, hasMarkdownDescription: false }

    const markdownPath = extractMarkdownPath(description)

    // when we can't extract a markdown path from the description,
    // we assume the description is markdown content
    if (!markdownPath) {
      return {
        description: await parseMarkdown({ markdownContent: description, rootHeadingLevel }),
        hasMarkdownDescription: true,
      }
    }

    return {
      description: await parseMarkdown({ filePath: path.join(config.contentDir, markdownPath), rootHeadingLevel }),
      hasMarkdownDescription: true,
    }
  }

  function computeSource(section: Section): in2Section['source'] {
    const cssSource = section.source

    let sourceMarkup: in2Section['source']['markup'] = undefined

    const hasExtractableMarkupFile = section.markup.includes('<insert-vite-pug src="')
    if (hasExtractableMarkupFile) {
      // eslint-disable-next-line regexp/no-super-linear-backtracking
      const regexModifierLine = /<insert-vite-pug src="(.+?)".*(?:[\n\r\u2028\u2029]\s*)?(modifierClass="(.+?)")? *><\/insert-vite-pug>/g
      const vitePugTags = section.markup.match(regexModifierLine)
      if (!vitePugTags)
        throw new Error('No Vite Pug tags found')

      vitePugTags.forEach((vitePugTag) => {
        let pugSourcePath = vitePugTag.match(/src="(.+?)"/)?.[1]
        if (!pugSourcePath || !pugSourcePath.endsWith('.pug')) {
          throw new Error('No or invalid Pug source path found')
        }

        pugSourcePath = path.join(config.contentDir, pugSourcePath)

        sourceMarkup = {
          file: pugSourcePath,
        }
      })
    }

    return {
      css: {
        file: cssSource.filename,
        line: cssSource.line,
      },
      markup: sourceMarkup,
    }
  }

  for await (const section of sortedData) {
    if (!section.reference)
      return

    // first level sections always are in the format of "1.0", "2.0", etc
    const sectionIds = section.reference.split('.')
    const isFirstLevelSection = sectionIds.length === 1 || (sectionIds.length === 2 && sectionIds[1] === '0')

    if (isFirstLevelSection) {
      const { description, hasMarkdownDescription } = await computeDescription(section.description, 1)

      const firstIndex = Number(sectionIds[0])
      const isSectionIdDuplicated = !!output[firstIndex]
      if (isSectionIdDuplicated) {
        overwrittenSectionsIds.push(section.reference)
      }

      output[firstIndex] = {
        id: section.reference,
        sectionLevel: 'first',
        header: section.header,
        description,
        hasMarkdownDescription,
        markup: section.markup,
        sections: [],
        modifiers: section.modifiers.map(modifier => ({
          value: modifier.name,
          description: modifier.description,
        })),
        colors: section.colors,
        icons: section.icons,
        figma: section.figma,
        status: section.status,
        wrapper: section.wrapper,
        htmlclass: section.htmlclass,
        bodyclass: section.bodyclass,
        source: computeSource(section),
        previewFileName: `preview-${section.reference}.html`,
        fullpageFileName: `fullpage-${section.reference}.html`,
      }
    }
    else {
      const firstIndex = Number(sectionIds[0])
      const firstLevelParentSection = output[firstIndex]
      if (!firstLevelParentSection)
        throw new Error(`First level parent section ${firstLevelParentSection} not found for section ${section.reference}`)

      // e.g. components => accordion => accordion purple (6.1.1)
      const isThirdLevelSection = sectionIds.length >= 3

      if (isThirdLevelSection) {
        const secondIndex = Number(sectionIds[1])
        const secondLevelParentSection = firstLevelParentSection.sections[secondIndex]

        if (!secondLevelParentSection)
          throw new Error(`Second level parent section ${sectionIds[0]}.${sectionIds[1]} not found for section ${section.reference}`)

        const { description, hasMarkdownDescription } = await computeDescription(section.description, 2)

        const isSectionIdDuplicated = secondLevelParentSection.sections.some((s: in2Section) => s.id === section.reference)
        if (isSectionIdDuplicated) {
          overwrittenSectionsIds.push(section.reference)
        }

        secondLevelParentSection.sections.push({
          id: section.reference,
          sectionLevel: 'third',
          header: section.header,
          description,
          hasMarkdownDescription,
          markup: section.markup,
          modifiers: section.modifiers.map(modifier => ({
            value: modifier.name,
            description: modifier.description,
          })),
          colors: section.colors,
          icons: section.icons,
          figma: section.figma,
          status: section.status,
          wrapper: section.wrapper,
          htmlclass: section.htmlclass,
          bodyclass: section.bodyclass,
          source: computeSource(section),
          previewFileName: `preview-${section.reference}.html`,
          fullpageFileName: `fullpage-${section.reference}.html`,
        })
      }
      // e.g. components => accordion (6.1)
      else {
        const { description, hasMarkdownDescription } = await computeDescription(section.description, 1)

        const secondIndex = Number(sectionIds[1])
        const isSectionIdDuplicated = !!firstLevelParentSection.sections[secondIndex]
        if (isSectionIdDuplicated) {
          overwrittenSectionsIds.push(section.reference)
        }

        firstLevelParentSection.sections[secondIndex] = {
          id: section.reference,
          sectionLevel: 'second',
          header: section.header,
          description,
          hasMarkdownDescription,
          markup: section.markup,
          modifiers: section.modifiers.map(modifier => ({
            value: modifier.name,
            description: modifier.description,
          })),
          colors: section.colors,
          icons: section.icons,
          figma: section.figma,
          status: section.status,
          wrapper: section.wrapper,
          htmlclass: section.htmlclass,
          bodyclass: section.bodyclass,
          sections: [],
          source: computeSource(section),
          previewFileName: `preview-${section.reference}.html`,
          fullpageFileName: `fullpage-${section.reference}.html`,
        }
      }
    }
  }

  // filter out empty sections
  output = output.filter(section => Boolean(section))
  output.forEach((firstLevelSection) => {
    firstLevelSection.sections = firstLevelSection.sections.filter(section => Boolean(section))
    firstLevelSection.sections.forEach((secondLevelSection) => {
      secondLevelSection.sections = secondLevelSection.sections
        .filter(section => Boolean(section))
        .sort((a, b) => a.id.localeCompare(b.id))
    })
  })

  return {
    content: output,
    overwrittenSectionsIds,
  }
}
