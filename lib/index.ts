import type { SectionMeta } from './insert-markup.ts'
import type { FileObject, in2FirstLevelSection, in2Section } from './parser.ts'
import type { MenuSearchKeywords } from './templates/preview.ts'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import { glob } from 'tinyglobby'
import { sectionSanitizeId } from '../client/utils.ts'
import { generateFaviconFiles } from './favicon.ts'
import { getInsertMarkupReferences, resolveInsertMarkupForSections } from './insert-markup.ts'
import { logger } from './logger.ts'
import { parse } from './parser.ts'
import { compilePugMarkup, compilePugMarkupIncremental, getLastCompileTimings, getPugDependencyGraph, getPugPoolInfo } from './pug'
import { replaceWrapperContent } from './shared.ts'
import { generateFullPageFile } from './templates/fullpage.ts'
import {
  generatePreviewFile,
  getAlerts,
  getCodeAuditDialog,
  getHeaderHtml,
  getMainContentHtml,
  getNextPageControlsHtml,
  getSearchHtml,
  getSidebarMenuHtml,
} from './templates/preview.ts'
import { watchStyleguideForChanges } from './watcher.ts'

export { createLogger, type LogBox, type Logger, logger } from './logger.ts'

export interface StyleguideConfiguration {
  mode: 'development' | 'production'
  outDir: string
  contentDir: `${string}/`
  projectTitle: string
  deactivateDarkMode?: boolean
  launchInEditor?: boolean | {
    rootDir: string
  }
  theme: string | {
    light: string
    dark: string
  }
  logoSignet?: {
    href: string
  } | {
    svgContent: string
  }
  html: {
    lang: string
    assets: {
      css: {
        type?: 'regular' | 'overwriteStyleguide'
        src: string
      }[]
      js: {
        type?: 'regular' | 'overwriteStyleguide'
        src: string
        additionalAttributes?: Record<string, string>
      }[]
    }
  }
  plugins?: {
    ogImage?: (section: in2Section) => string
  }
}

interface StyleguideBuildOutput {
  errors?: {
    overwrittenSectionsIds?: string[]
  }
}

interface SearchSectionMapping {
  title: string
  items: {
    label: string
    href: string
    searchKeywords: MenuSearchKeywords
  }[]
}

interface MenuSectionMapping {
  title: string
  items: { label: string, href: string, status?: string }[]
}

/**
 * Expensive, parse-derived state computed once and reused across incremental rebuilds.
 * A markup-only edit never changes section structure, so the parsed tree, navigation mappings,
 * and lookups stay valid; only affected sections are recompiled and rewritten.
 */
export interface StyleguideContext {
  baseDirectory: string
  parsedContent: in2FirstLevelSection[]
  overwrittenSectionsIds: string[]
  sectionsById: Map<string, SectionMeta>
  /** section id -> original (pre-compile) markup, i.e. the compile input */
  rawMarkupBySection: Map<string, string>
  /** section id -> compiled markup that is NOT yet <insert-markup>-resolved (persistent) */
  compiledRepository: Map<string, { markup: string }>
  /** refId -> ids whose compiled markup embeds <insert-markup>refId</insert-markup> */
  insertMarkupConsumers: Map<string, Set<string>>
  headerHtml: string
  searchHtml: string
  menuSectionMapping: MenuSectionMapping[]
  /** section id (second & third level) -> its parsed node */
  nodeById: Map<string, in2Section>
  /** any section id -> the location of its owning second-level section (for preview regen) */
  ownerLocationById: Map<string, { firstLevelIndex: number, secondLevelIndex: number }>
}

/**
 * Parse given contentDir and get structured data for further processing
 */
export async function parseStyleguide(contentDir: StyleguideConfiguration['contentDir']) {
  // find all files in the content directory that have .css or .scss extension recursive
  // and also contain the styleguide comment
  const styleguideContentPaths = await glob(`${contentDir}/**/*.{css,scss}`)
  const styleguideContent: FileObject[] = await Promise.all(
    styleguideContentPaths.map(async filePath => ({
      path: filePath,
      contents: await fs.readFile(filePath, 'utf-8'),
    })),
  )

  const rawParsedOutput = await parse(styleguideContent, contentDir)
  if (!rawParsedOutput) {
    throw new Error(
      `No styleguide sections found in "${contentDir}". Scanned ${styleguideContentPaths.length} .css/.scss file(s) — make sure at least one contains a KSS "Styleguide x.x" comment block.`,
    )
  }

  return rawParsedOutput
}

function buildNavigationMappings(parsedContent: in2FirstLevelSection[]): {
  searchSectionMapping: SearchSectionMapping[]
  menuSectionMapping: MenuSectionMapping[]
} {
  const searchSectionMapping: SearchSectionMapping[] = []
  const menuSectionMapping: MenuSectionMapping[] = []

  parsedContent.forEach((firstLevelSection, indexFirstLevel) => {
    searchSectionMapping[indexFirstLevel] = { title: firstLevelSection.header, items: [] }
    menuSectionMapping[indexFirstLevel] = { title: firstLevelSection.header, items: [] }

    firstLevelSection.sections.forEach((secondLevelSection, indexSecondLevel) => {
      const menuHref = indexFirstLevel === 0 && indexSecondLevel === 0 ? '/index.html' : `/${secondLevelSection.previewFileName}`

      searchSectionMapping[indexFirstLevel].items.push({
        label: secondLevelSection.header,
        searchKeywords: [
          {
            keywords: [secondLevelSection.header, secondLevelSection.description].filter(Boolean),
          },
          ...secondLevelSection.sections
            .flatMap((thirdLevelSection) => {
              return {
                id: sectionSanitizeId(`section-${thirdLevelSection.id}`),
                keywords: [thirdLevelSection.header, thirdLevelSection.description].filter(Boolean),
              }
            }),
        ],
        href: menuHref,
      })

      menuSectionMapping[indexFirstLevel].items.push({
        label: secondLevelSection.header,
        href: menuHref,
        status: secondLevelSection.status,
      })
    })
  })

  return { searchSectionMapping, menuSectionMapping }
}

/**
 * Write a section's fullpage HTML file. Render failures are logged and swallowed so a single bad
 * section never aborts the build of all the others.
 */
async function writeFullPageFile(config: StyleguideConfiguration, baseDirectory: string, section: in2Section): Promise<void> {
  if (section.markup === undefined || section.markup.length === 0)
    return

  try {
    let htmlMarkup = section.markup
    if (section.wrapper) {
      htmlMarkup = replaceWrapperContent(section.wrapper, htmlMarkup)
    }

    await generateFullPageFile({
      id: section.id,
      filePath: path.join(baseDirectory, section.fullpageFileName),
      page: {
        title: section.header,
        description: !section.hasMarkdownDescription ? section.description : undefined,
        lang: config.html.lang,
        htmlclass: section.htmlclass,
        bodyclass: section.bodyclass,
      },
      css: config.html.assets.css,
      js: config.html.assets.js,
      html: htmlMarkup,
      theme: config.theme,
      ogImageUrl: config.plugins?.ogImage
        ? config.plugins.ogImage(section)
        : undefined,
    })
  }
  catch (error) {
    logger.error(`Error processing section ${section.id}:`, error)
  }
}

function writePreviewFile(
  config: StyleguideConfiguration,
  context: StyleguideContext,
  firstLevelIndex: number,
  secondLevelIndex: number,
): Promise<void> {
  const { parsedContent, baseDirectory, menuSectionMapping, headerHtml, searchHtml } = context
  const firstLevelSection = parsedContent[firstLevelIndex]
  const secondLevelSection = firstLevelSection.sections[secondLevelIndex]

  let sectionBefore = firstLevelSection.sections[secondLevelIndex - 1]
  if (!sectionBefore && !(firstLevelIndex === 0)) {
    sectionBefore = parsedContent[firstLevelIndex - 1].sections.at(-1)!
  }

  let sectionAfter = firstLevelSection.sections[secondLevelIndex + 1]
  if (!sectionAfter && parsedContent[firstLevelIndex + 1]) {
    sectionAfter = parsedContent[firstLevelIndex + 1].sections.at(0)!
  }

  const nextPageControlsData: {
    before?: { label: string, href: string }
    after?: { label: string, href: string }
  } = {}

  if (sectionBefore) {
    nextPageControlsData.before = { label: sectionBefore.header, href: sectionBefore.previewFileName }
  }

  if (sectionAfter) {
    nextPageControlsData.after = { label: sectionAfter.header, href: sectionAfter.previewFileName }
  }

  const preloadIframes: string[] = []
  if (secondLevelSection.markup) {
    preloadIframes.push(secondLevelSection.fullpageFileName)
  }
  secondLevelSection.sections.forEach((thirdLevelSection) => {
    if (thirdLevelSection.markup) {
      preloadIframes.push(thirdLevelSection.fullpageFileName)
    }
  })

  const isHtmlIndexPage = firstLevelIndex === 0 && secondLevelIndex === 0
  const filePath = isHtmlIndexPage
    ? path.join(baseDirectory, 'index.html')
    : path.join(baseDirectory, secondLevelSection.previewFileName)

  return generatePreviewFile({
    filePath,
    page: {
      title: secondLevelSection.header,
      description: secondLevelSection.description,
      lang: config.html.lang,
    },
    css: config.html.assets.css,
    js: config.html.assets.js,
    html: {
      header: headerHtml,
      sidebarMenu: getSidebarMenuHtml(menuSectionMapping, secondLevelSection.previewFileName),
      mainContent: getMainContentHtml(secondLevelSection, config),
      nextPageControls: getNextPageControlsHtml(nextPageControlsData),
      search: searchHtml,
      codeAuditDialog: getCodeAuditDialog(),
      alerts: getAlerts(),
      preloadIframes,
    },
    theme: config.theme,
    deactivateDarkMode: config.deactivateDarkMode,
    ogImageUrl: config.plugins?.ogImage
      ? config.plugins.ogImage(secondLevelSection)
      : undefined,
  })
}

/** Record that `consumerId`'s compiled markup embeds <insert-markup>refId</insert-markup>. */
function addInsertMarkupConsumer(consumers: Map<string, Set<string>>, refId: string, consumerId: string): void {
  let set = consumers.get(refId)
  if (!set) {
    set = new Set()
    consumers.set(refId, set)
  }
  set.add(consumerId)
}

/** Rebuild the <insert-markup> reverse-index edges for a single (recompiled) section. */
function reindexInsertMarkupConsumer(context: StyleguideContext, id: string): void {
  for (const consumers of context.insertMarkupConsumers.values()) {
    consumers.delete(id)
  }

  const entry = context.compiledRepository.get(id)
  if (!entry)
    return

  for (const refId of getInsertMarkupReferences(entry.markup)) {
    addInsertMarkupConsumer(context.insertMarkupConsumers, refId, id)
  }
}

/**
 * Parse the styleguide and compile all pug markup, producing the reusable context. Section nodes
 * are mutated to hold their final (compiled + insert-markup-resolved) markup, ready for writing.
 */
async function buildContext(config: StyleguideConfiguration): Promise<StyleguideContext> {
  const { content: parsedContent, overwrittenSectionsIds } = await parseStyleguide(config.contentDir)
  const baseDirectory = path.relative(process.cwd(), config.outDir)

  const rawMarkupBySection = new Map<string, string>()
  const sectionsById = new Map<string, SectionMeta>()
  const nodeById = new Map<string, in2Section>()
  const ownerLocationById = new Map<string, { firstLevelIndex: number, secondLevelIndex: number }>()

  parsedContent.forEach((firstLevelSection, firstLevelIndex) => {
    firstLevelSection.sections.forEach((secondLevelSection, secondLevelIndex) => {
      sectionsById.set(secondLevelSection.id, { modifiers: secondLevelSection.modifiers.map(m => ({ name: m.value })) })
      nodeById.set(secondLevelSection.id, secondLevelSection)
      ownerLocationById.set(secondLevelSection.id, { firstLevelIndex, secondLevelIndex })
      if (secondLevelSection.markup)
        rawMarkupBySection.set(secondLevelSection.id, secondLevelSection.markup)

      secondLevelSection.sections.forEach((thirdLevelSection) => {
        sectionsById.set(thirdLevelSection.id, { modifiers: thirdLevelSection.modifiers.map(m => ({ name: m.value })) })
        nodeById.set(thirdLevelSection.id, thirdLevelSection)
        ownerLocationById.set(thirdLevelSection.id, { firstLevelIndex, secondLevelIndex })
        if (thirdLevelSection.markup)
          rawMarkupBySection.set(thirdLevelSection.id, thirdLevelSection.markup)
      })
    })
  })

  // compile all pug markup (output is compiled but not yet <insert-markup>-resolved)
  const repository = new Map<string, { markup: string }>()
  for (const [id, markup] of rawMarkupBySection)
    repository.set(id, { markup })
  const compiledRepository = await compilePugMarkup(config.mode, config.contentDir, repository)

  // reverse <insert-markup> index, built from compiled (unresolved) markup
  const insertMarkupConsumers = new Map<string, Set<string>>()
  for (const [id, entry] of compiledRepository) {
    for (const refId of getInsertMarkupReferences(entry.markup)) {
      addInsertMarkupConsumer(insertMarkupConsumers, refId, id)
    }
  }

  // resolve <insert-markup> cross-references and assign the final markup onto the section nodes
  const resolved = resolveInsertMarkupForSections(compiledRepository, sectionsById, compiledRepository.keys())
  for (const [id, markup] of resolved) {
    const node = nodeById.get(id)
    if (node)
      node.markup = markup
  }

  const { searchSectionMapping, menuSectionMapping } = buildNavigationMappings(parsedContent)
  const headerHtml = getHeaderHtml(config)
  const searchHtml = getSearchHtml(searchSectionMapping)

  return {
    baseDirectory,
    parsedContent,
    overwrittenSectionsIds,
    sectionsById,
    rawMarkupBySection,
    compiledRepository,
    insertMarkupConsumers,
    headerHtml,
    searchHtml,
    menuSectionMapping,
    nodeById,
    ownerLocationById,
  }
}

async function copyStyleguideAssets(config: StyleguideConfiguration): Promise<void> {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const findAssetsDirectoryPath = () => {
    const isLibraryDevelopmentIndexTs = __filename.endsWith('/lib/index.ts')
    if (isLibraryDevelopmentIndexTs)
      return path.resolve(process.cwd(), 'dist/styleguide-assets')

    // this is returned when the library is run by the real user
    return path.resolve(__dirname, '../../styleguide-assets')
  }

  const assetsDirectoryPath = findAssetsDirectoryPath()
  const assetsDirectoryOutputPath = path.join(config.outDir, 'styleguide-assets')
  const isAssetsDirectoryAlreadyCopied = await fs.exists(assetsDirectoryOutputPath) && (await fs.readdir(assetsDirectoryOutputPath)).length > 0
  if (!isAssetsDirectoryAlreadyCopied) {
    await fs.copy(assetsDirectoryPath, assetsDirectoryOutputPath)
    await generateFaviconFiles(assetsDirectoryOutputPath, config.theme)
  }
}

/**
 * Full build: parse, compile every section, and write all fullpage + preview files. Returns the
 * reusable context so the watcher can perform targeted incremental rebuilds afterwards.
 */
export async function buildAll(config: StyleguideConfiguration): Promise<{ errors: StyleguideBuildOutput['errors'], context: StyleguideContext }> {
  // ensure clean output directory and delete all html files
  if (config.mode === 'production' && await fs.exists(config.outDir)) {
    const files = await glob(`${config.outDir}/**/*.html`)
    await Promise.all(files.map(file => fs.remove(file)))
  }

  const context = await buildContext(config)

  const fileWriteTasks: Promise<void>[] = []
  context.parsedContent.forEach((firstLevelSection, firstLevelIndex) => {
    firstLevelSection.sections.forEach((secondLevelSection, secondLevelIndex) => {
      if (secondLevelSection.markup) {
        fileWriteTasks.push(writeFullPageFile(config, context.baseDirectory, secondLevelSection))
      }

      secondLevelSection.sections.forEach((thirdLevelSection) => {
        if (thirdLevelSection.markup) {
          fileWriteTasks.push(writeFullPageFile(config, context.baseDirectory, thirdLevelSection))
        }
      })

      fileWriteTasks.push(writePreviewFile(config, context, firstLevelIndex, secondLevelIndex))
    })
  })

  // asset copy and the HTML writes are independent — run them concurrently
  await Promise.all([copyStyleguideAssets(config), ...fileWriteTasks])

  const errors: StyleguideBuildOutput['errors'] = {}
  if (context.overwrittenSectionsIds.length > 0) {
    errors.overwrittenSectionsIds = context.overwrittenSectionsIds
  }

  return {
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    context,
  }
}

/**
 * Builds the styleguide
 * @param config - The configuration for the styleguide
 */
export async function buildStyleguide(config: StyleguideConfiguration): Promise<StyleguideBuildOutput> {
  const { errors } = await buildAll(config)
  return { errors }
}

/**
 * Incrementally rebuild only the sections affected by a markup change: recompile their pug
 * (cache-aware), re-resolve <insert-markup>, and rewrite just their fullpage + owning preview files.
 * `changedSectionIds` are the sections whose pug (or a dependency) changed.
 */
export async function rebuildSections(
  config: StyleguideConfiguration,
  context: StyleguideContext,
  changedSectionIds: Iterable<string>,
): Promise<void> {
  // expand to the transitive set of sections affected via <insert-markup> consumers
  const affected = new Set<string>()
  const queue = [...changedSectionIds]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (affected.has(id))
      continue
    affected.add(id)
    const consumers = context.insertMarkupConsumers.get(id)
    if (consumers) {
      for (const consumer of consumers) {
        if (!affected.has(consumer))
          queue.push(consumer)
      }
    }
  }

  // recompile the affected sections that actually have markup (cache-aware)
  const subset = new Map<string, { markup: string }>()
  for (const id of affected) {
    const raw = context.rawMarkupBySection.get(id)
    if (raw !== undefined)
      subset.set(id, { markup: raw })
  }
  if (subset.size === 0)
    return

  const startedAt = performance.now()
  const workersBefore = getPugPoolInfo().workers

  const recompiled = await compilePugMarkupIncremental(config.mode, config.contentDir, subset, subset.keys())
  for (const [id, entry] of recompiled) {
    context.compiledRepository.set(id, { markup: entry.markup })
    reindexInsertMarkupConsumer(context, id)
  }
  const afterCompile = performance.now()

  // re-resolve <insert-markup> for the affected sections and update their nodes
  const resolved = resolveInsertMarkupForSections(context.compiledRepository, context.sectionsById, affected)
  for (const [id, markup] of resolved) {
    const node = context.nodeById.get(id)
    if (node)
      node.markup = markup
  }
  const afterResolve = performance.now()

  // write only the affected fullpages and their (deduped) owning preview pages
  const writeTasks: Promise<void>[] = []
  const previewsToWrite = new Set<string>()
  for (const id of affected) {
    const node = context.nodeById.get(id)
    if (node?.markup) {
      writeTasks.push(writeFullPageFile(config, context.baseDirectory, node))
    }
    const location = context.ownerLocationById.get(id)
    if (location) {
      previewsToWrite.add(`${location.firstLevelIndex}:${location.secondLevelIndex}`)
    }
  }
  for (const key of previewsToWrite) {
    const [firstLevelIndex, secondLevelIndex] = key.split(':').map(Number)
    writeTasks.push(writePreviewFile(config, context, firstLevelIndex, secondLevelIndex))
  }

  await Promise.all(writeTasks)
  const afterWrite = performance.now()

  // dev-only breakdown so the incremental-rebuild hot path can be profiled from the console
  if (config.mode === 'development') {
    const ms = (value: number): string => `${value.toFixed(1)}ms`
    const pool = getPugPoolInfo()
    const spawned = pool.workers - workersBefore
    const t = getLastCompileTimings()
    logger.info(
      `Incremental rebuild: ${affected.size} section(s), ${writeTasks.length} file(s) in ${ms(afterWrite - startedAt)} `
      + `(compile ${ms(afterCompile - startedAt)}, insert-markup ${ms(afterResolve - afterCompile)}, write ${ms(afterWrite - afterResolve)}) `
      + `[cpus=${pool.cpus}, pool=${pool.maxPoolSize}, workers=${pool.workers}${spawned > 0 ? `, +${spawned} cold-spawned` : ''}] `
      + `compile breakdown over ${t.sections} section(s): read ${ms(t.read)}, parse ${ms(t.parse)}, render ${ms(t.render)}, a11y ${ms(t.a11y)} (summed per-section; read=disk I/O, parse=lex/parse/codegen)`,
    )
  }
}

/**
 * What triggered a {@link watchStyleguide} rebuild:
 * - `structural` — a CSS/SCSS/Markdown edit that can change section structure; the whole styleguide is rebuilt.
 * - `markup` — a Pug/HTML edit; only `sections` (those depending on `file`) are rebuilt.
 */
export type StyleguideChange
  = | { type: 'structural' }
    | { type: 'markup', file: string, sections: string[] }

/**
 * Builds the styleguide and watches for changes
 * @param config - The configuration for the styleguide
 * @param onChange - Optional callback invoked after each rebuild, with the change that triggered it
 * @param onError - Optional callback function to call when an error occurs while building the styleguide
 */
export async function watchStyleguide(
  config: StyleguideConfiguration,
  onChange?: (change: StyleguideChange) => void,
  onError?: (errorData: StyleguideBuildOutput['errors']) => void,
) {
  const initialBuild = await buildAll(config)
  if (onError && initialBuild.errors) {
    onError(initialBuild.errors)
  }

  let context = initialBuild.context

  // make sure content dir ends with /
  const contentDirPath = config.contentDir.endsWith('/') ? config.contentDir : `${config.contentDir}/`

  watchStyleguideForChanges(contentDirPath, {
    // css/scss/md edits can change section structure -> full rebuild + fresh context
    onStructuralChange: () => {
      (async () => {
        const localBuild = await buildAll(config)
        context = localBuild.context
        if (onChange)
          onChange({ type: 'structural' })
        if (onError && localBuild.errors) {
          onError(localBuild.errors)
        }
      })().catch((error) => {
        logger.error('Error during rebuild:', error)
      })
    },
    // a .pug/.html source edit -> recompile + rewrite only the sections that depend on it
    onMarkupChange: (changedFile: string) => {
      (async () => {
        const affected = getPugDependencyGraph().getAffectedSections(changedFile)
        if (affected.length === 0)
          return
        await rebuildSections(config, context, affected)
        if (onChange)
          onChange({ type: 'markup', file: changedFile, sections: affected })
      })().catch((error) => {
        logger.error('Error during incremental rebuild:', error)
      })
    },
  })
}
