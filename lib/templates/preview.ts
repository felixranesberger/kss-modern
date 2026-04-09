import type { StyleguideConfiguration } from '../index.ts'
import type { in2SecondLevelSection, in2Section } from '../parser.ts'
import path from 'node:path'
import process from 'node:process'
import { objectEntries } from '@antfu/utils'
import { sectionSanitizeId } from '../../client/utils.ts'
import { ensureStartingSlash, generateId, logicalWriteFile, sanitizeSpecialCharacters } from '../utils.ts'

function getHasSectionExternalFullpage(section: in2Section) {
  return section.markup.length > 0
    && (section.icons === undefined || section.icons.length === 0)
    && (section.colors === undefined || section.colors.length === 0)
}

function getLogoContent(config: StyleguideConfiguration) {
  if (!config.logoSignet)
    return config.projectTitle

  let signetContent = ''

  if ('href' in config.logoSignet) {
    signetContent += `<img
      src="${config.logoSignet.href}"
      width="24"
      height="24"
      alt="${config.projectTitle} Logo"
    >`
  }
  else if ('svgContent' in config.logoSignet) {
    signetContent += `${config.logoSignet.svgContent}`
  }

  signetContent += config.projectTitle

  return signetContent
}

export function getHeaderHtml(config: StyleguideConfiguration) {
  return `
<header class="sticky top-0 z-10 mx-auto flex w-full min-[1222px]:border-x border-b pr-6 max-w-[1600px] border-styleguide-border bg-styleguide-bg-highlight">
    <a
      class="mr-4 flex gap-4 items-center border-r py-4 pr-4 pl-6 border-styleguide-border w-[260px] font-semibold tracking-tight text-styleguide-theme-highlight [&>svg]:!size-6 [&>img]:!size-6"
      href="/"
    >
        ${getLogoContent(config)}
    </a>

    <div class="flex grow items-center justify-end py-4 md:justify-between">
        <button
            class="inline-flex items-center cursor-pointer justify-between gap-2 rounded-full border p-2 text-sm transition border-styleguide-border hover:text-styleguide-highlight focus:text-styleguide-highlight active:scale-[0.96] md:py-1.5 md:rounded-md md:px-2"
            type="button"
            aria-controls="search-dialog"
            aria-expanded="false"
            data-open-search=""
        >
            <span class="sr-only md:not-sr-only">Search page</span>

            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5 md:hidden">
                <path fill-rule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" />
            </svg>

            <kbd class="relative hidden items-center gap-1 rounded-md border font-semibold text-[10px] border-styleguide-border px-1.5 pt-[4px] pb-[3px] md:inline-flex">
                <span class="winlinux-only inline-block text-[10px] leading-[10px]">Ctrl</span>
                <span class="mac-only inline-block text-[12px] leading-[12px]">⌘</span>
                <span class="leading-[10px]">K</span>
            </kbd>
        </button>

        <div class="flex gap-4">
          ${config.launchInEditor
            ? `
              <form class="hidden editor-select md:block">
                <fieldset class="flex items-center rounded-3xl border border-styleguide-border">
                  <legend class="sr-only">Select a preferred editor</legend>
                  
                  <div>
                    <input id="phpstorm" class="sr-only peer" type="radio" value="phpstorm" name="editor">
                    <label for="phpstorm" class="cursor-pointer p-2 block peer-checked:saturate-100 saturate-0 transition">
                        <span class="sr-only">PHPStorm</span>
                        <img 
                            src="styleguide-assets/icons/phpstorm.svg"
                            width="70" 
                            height="70" 
                            class="size-4" 
                            alt="PHPStorm Logo" 
                            aria-hidden="true" 
                        >
                    </label>
                  </div>
                  
                  <div>
                    <input id="vscode" class="sr-only peer" type="radio" value="vscode" name="editor">
                    <label for="vscode" class="cursor-pointer p-2 block peer-checked:saturate-100 saturate-0 transition">
                        <span class="sr-only">VSCode</span>
                        <img 
                            src="styleguide-assets/icons/vscode.svg"
                            width="70" 
                            height="70" 
                            class="size-4" 
                            alt="VSCode Logo" 
                            aria-hidden="true" 
                        >
                    </label>
                  </div>
                </fieldset>
              </form>
            `
            : ``}
        
          ${!(config.deactivateDarkMode ?? false)
            ? `
              <form class="hidden theme-select md:block">
                <fieldset class="flex items-center rounded-3xl border border-styleguide-border">
                    <legend class="sr-only">Select a display theme</legend>
    
                    <input id="normal" class="sr-only" type="radio" value="normal" name="theme">
                    <label for="normal" class="cursor-pointer p-2">
                        <span class="sr-only">System</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                        </svg>
                    </label>
    
                    <input id="light" class="sr-only" type="radio" value="light" name="theme">
                    <label for="light" class="cursor-pointer p-2">
                        <span class="sr-only">Light</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                        </svg>
                    </label>
    
                    <input id="dark" class="sr-only" type="radio" value="dark" name="theme">
                    <label for="dark" class="cursor-pointer p-2">
                        <span class="sr-only">Dark</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                        </svg>
                    </label>
                </fieldset>
              </form>
          `
            : ``}
        </div>
    </div>
</header>
`.trim()
}

export function getSidebarMenuHtml(
  sections: {
    title: string
    items: { label: string, href: string, status?: string }[]
  }[],
  activePageHref: string,
) {
  const getItemStatusHTMLClasses = (status?: string) => {
    switch (status) {
      case 'complete':
        return ' menu-item--status-complete'

      case 'progress':
      case 'in-progress':
        return ' menu-item--status-progress'

      case 'feedback':
      case 'awaits-feedback':
        return ' menu-item--status-feedback'

      case 'pending':
        return ' menu-item--status-pending'

      default:
        return ''
    }
  }

  const getItemHtml = (item: { label: string, href: string, status?: string }) => {
    if (item.href.includes(activePageHref)) {
      return `<div class="menu-item menu-item--active${getItemStatusHTMLClasses(item.status)}">${item.label}</div>`
    }

    return `<a class="menu-item${getItemStatusHTMLClasses(item.status)}" href="${item.href}">${item.label}</a>`
  }

  return `
<ol class="grid gap-6 px-3 py-6">
    ${sections.map(section => `
        <li>
            <span class="block rounded-md px-3 text-sm font-semibold text-styleguide-theme-highlight">
                ${section.title}
            </span>
            <ol class="mt-3 grid gap-2">
                ${section.items.map(item => `
                    <li>
                       ${getItemHtml(item)}
                    </li>
                `).join('\n')}
            </ol>
        </li>
    `).join('\n')}
</ol>
`.trim()
}

export function getCodeAuditDialog() {
  return `
    <dialog 
        id="code-audit-dialog"
        class="fixed inset-0 top-8 z-30 py-6 backdrop:hidden -mb-px size-full md:h-auto md:max-h-[85dvh] max-w-none overflow-y-auto rounded-t-2xl border bg-styleguide-bg border-styleguide-border text-styleguide md:max-w-[720px] md:top-12 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:rounded-2xl mx-0 lg:top-24"
      >
          <h2 class="flex items-center gap-2 mb-4 px-6">
            <svg class="-mt-0.5 h-4 transition duration-200" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 122.88" aria-hidden="true"><title>accessibility</title><path fill="currentcolor" d="M61.44,0A61.46,61.46,0,1,1,18,18,61.21,61.21,0,0,1,61.44,0Zm-.39,74.18L52.1,98.91a4.94,4.94,0,0,1-2.58,2.83A5,5,0,0,1,42.7,95.5l6.24-17.28a26.3,26.3,0,0,0,1.17-4,40.64,40.64,0,0,0,.54-4.18c.24-2.53.41-5.27.54-7.9s.22-5.18.29-7.29c.09-2.63-.62-2.8-2.73-3.3l-.44-.1-18-3.39A5,5,0,0,1,27.08,46a5,5,0,0,1,5.05-7.74l19.34,3.63c.77.07,1.52.16,2.31.25a57.64,57.64,0,0,0,7.18.53A81.13,81.13,0,0,0,69.9,42c.9-.1,1.75-.21,2.6-.29l18.25-3.42A5,5,0,0,1,94.5,39a5,5,0,0,1,1.3,7,5,5,0,0,1-3.21,2.09L75.15,51.37c-.58.13-1.1.22-1.56.29-1.82.31-2.72.47-2.61,3.06.08,1.89.31,4.15.61,6.51.35,2.77.81,5.71,1.29,8.4.31,1.77.6,3.19,1,4.55s.79,2.75,1.39,4.42l6.11,16.9a5,5,0,0,1-6.82,6.24,4.94,4.94,0,0,1-2.58-2.83L63,74.23,62,72.4l-1,1.78Zm.39-53.52a8.83,8.83,0,1,1-6.24,2.59,8.79,8.79,0,0,1,6.24-2.59Zm36.35,4.43a51.42,51.42,0,1,0,15,36.35,51.27,51.27,0,0,0-15-36.35Z"/></svg>
            <span class="text-lg font-semibold text-styleguide-highlight leading-[1]">
                Code Audit Results
            </span>
          </h2>
          
          <ol class="audit-results"></ol>
    </dialog>
  `
}

interface Tab { title: string, content: string, icon?: string }

function renderTab(data: Tab[]) {
  const tabId = generateId()

  return `
    <div class="tabs">
        <div
            class="inline-flex relative justify-start flex-wrap rounded-md p-0.5 bg-styleguide-bg-highlight" 
            role="tablist"
        >
            <div
                class="tab-trigger-background absolute inset-y-0.5 left-0 bg-[rgb(242,242,242)] dark:bg-[rgb(26,26,26)] rounded"
            ></div>
        
            ${data.map((tab, index) => `
                <button 
                    id="tab-trigger-${tabId}-${index}"
                    role="tab"
                    aria-selected="${(index === 0).toString()}"
                    aria-controls="tab-panel-${tabId}-${index}" 
                    class="inline-flex gap-1 items-center relative px-4 py-2 text-sm cursor-pointer aria-selected:text-styleguide-highlight transition duration-400"
                >
                    ${tab.icon ?? ''}
                    ${tab.title}
                </button>
            `).join('\n')}
        </div>
        
        ${data.map((tab, index) => `
            <div
                id="tab-panel-${tabId}-${index}"
                class="${index === 0 ? '' : 'hidden'}"
                role="tabpanel"
                aria-labelledby="tab-trigger-${tabId}-${index}"
                tabindex="${index === 0 ? '0' : '-1'}"
              >
                ${tab.content}
            </div>
        `).join('\n')}
    </div>
  `
}

export function getMainContentHtml(secondLevelSection: in2SecondLevelSection, config: StyleguideConfiguration) {
  let output = ''

  function renderSection(section: in2Section) {
    if (section.colors && section.colors.length > 0) {
      output += getMainContentSectionWrapper(section, getMainContentColors(section))
    }
    else if (section.icons && section.icons.length > 0) {
      output += getMainContentSectionWrapper(section, getMainContentIcons(section))
    }
    else {
      const content = section.markup || (!section.markup && section.figma) ? getMainContentRegular(section, config) : undefined
      output += getMainContentSectionWrapper(section, content)
    }
  }

  renderSection(secondLevelSection)
  secondLevelSection.sections.forEach(renderSection)

  return output
}

function getMainContentSectionWrapper(section: in2Section, html?: string): string {
  let headingTag = ''
  let headingClass = ''

  if (section.sectionLevel === 'second') {
    headingTag = 'h1'
    headingClass = 'text-4xl'
  }
  else if (section.sectionLevel === 'third') {
    const isDeeplyNested = section.id.split('.').length > 3

    headingTag = isDeeplyNested ? 'h3' : 'h2'
    headingClass = isDeeplyNested ? 'text-xl' : 'text-2xl'
  }

  const computeDescription = () => {
    if (!section.description)
      return ''

    if (section.hasMarkdownDescription) {
      return `
        <div class="markdown-container-folded relative mb-8">
            <div class="markdown-container mt-2 max-h-[400px] overflow-hidden">
                ${section.description}
            </div>
            
            <div class="markdown-show-more-container hidden absolute inset-x-0 bottom-0 flex justify-center max-w-[65ch] after:absolute after:inset-x-0 after:bottom-0 after:h-[120px] after:bg-gradient-to-t after:from-styleguide-bg after:to-transparent after:pointer-events-none">
                <button
                    type="button" 
                    class="markdown-show-more px-2 py-1 bg-styleguide-bg-highlight rounded-2xl cursor-pointer border border-styleguide-border hover:text-styleguide-highlight active:scale-[0.96] md:min-w-[150px] z-10"
                >
                    Show more
                </button>
            </div>
        </div>
      `
    }

    return `<p class="mt-2${section.sectionLevel === 'second' ? ' text-xl' : ''}">${section.description}</p>`
  }

  return `
<section 
  id="section-${sectionSanitizeId(section.id)}" 
  class="styleguide-section border-b px-4 py-10 border-b-styleguide-border scroll-mt-[50px] md:px-10"
>
    <div class="flex items-center justify-between gap-6">
        <a class="relative group" href="#section-${sectionSanitizeId(section.id)}">
            <svg class="absolute top-1/2 -left-6 -translate-y-1/2 opacity-0 transition size-[18px] group-hover:opacity-100 group-focus:opacity-100"
                 xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z"/>
                <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z"/>
            </svg>
            <${headingTag} class="${headingClass} font-semibold text-styleguide-theme-highlight">${section.header}</${headingTag}>
        </a>

        ${getHasSectionExternalFullpage(section)
          ? `
          <a 
            class="p-2 group hover:text-styleguide-highlight focus:text-styleguide-highlight" 
            href="/${section.fullpageFileName}" 
            target="_blank" 
            title="Open ${section.header} in fullpage"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4">
                <path class="transition group-hover:translate-x-px group-hover:-translate-y-px group-focus:translate-x-px group-focus:-translate-y-px" d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"/>
                <path class="transition" d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
            </svg>
          </a>
        `
          : ''}
    </div>
    ${computeDescription()}
${html ?? ''}
</section>
  `
}

function getMainContentRegular(section: in2Section, config: StyleguideConfiguration): string {
  const openInEditorPaths: {
    css?: { vscode: string, phpstorm: string }
    html?: { vscode: string, phpstorm: string }
  } = {}

  if (config.mode === 'development' && config.launchInEditor) {
    const computedRootPath = config.launchInEditor && typeof config.launchInEditor === 'object' && 'rootDir' in config.launchInEditor
      ? config.launchInEditor.rootDir
      : process.cwd()

    const cssFilePath = ensureStartingSlash(path.join(computedRootPath, section.source.css.file))
    const cssLineNumber = section.source.css.line + 1 // increment by one to match section title directly
    openInEditorPaths.css = {
      vscode: `vscode://file//${cssFilePath}:${cssLineNumber}`,
      phpstorm: `phpstorm://open?file=${cssFilePath}&line=${cssLineNumber}`,
    }

    if (section.source.markup && section.source.markup.file) {
      const htmlFilePath = ensureStartingSlash(path.join(computedRootPath, section.source.markup.file))
      openInEditorPaths.html = {
        vscode: `vscode://file//${htmlFilePath}`,
        phpstorm: `phpstorm://open?file=${htmlFilePath}`,
      }
    }
  }

  const computeFigmaExternalLink = (url?: string) => {
    if (!url)
      return ''

    const urlObj = new URL(url)
    urlObj.hostname = 'www.figma.com'

    return urlObj.toString()
  }

  // Preserve classes in tailwind
  // group/phpstorm
  // group/vscode
  // group-hover/phpstorm:saturate-100
  // group-hover/vscode:saturate-100
  const renderOpenInEditorLink = (editorType: 'phpstorm' | 'vscode', contentType: 'CSS' | 'HTML' | 'Pug', link: string) => `
    <a
        class="hidden editor-${editorType}-only @md:inline-flex items-center group/${editorType} gap-1.5 p-4 desktop-device-only cursor-pointer active:scale-90 transition hover:text-styleguide-highlight duration-200" 
        href="${link}"
    >
        <span class="hidden @2xl:inline-block">Open ${contentType}</span>
        <span class="sr-only">in ${editorType}</span>
        <img 
            src="styleguide-assets/icons/${contentType.toLowerCase()}.svg"
            width="512" 
            height="512" 
            class="size-4 saturate-0 group-hover/${editorType}:saturate-100 transition" 
            alt="${editorType} Logo" 
            aria-hidden="true"
        >
    </a>
  `

  const codePreviewMarkup = `
    <!-- Preview Box -->
    <div class="mt-4 overflow-hidden rounded-2xl border border-styleguide-border">
        <div class="w-full border-b p-6 bg-styleguide-bg-highlight border-styleguide-border">
            <div class="preview-resize-container relative max-w-full group/resize [&.is-resizing_iframe]:pointer-events-none">
                <iframe
                      id="preview-fullpage-${sectionSanitizeId(section.id)}"
                      src="/${section.fullpageFileName}"
                      class="preview-iframe"
                      data-preview="true"
                      title="${section.header} Preview"
                      scrolling="no"
                ></iframe>
                <div class="preview-resize-handle absolute top-0 right-0 w-3 h-full cursor-col-resize hidden md:flex items-center justify-center touch-none after:content-[''] after:w-1 after:h-[80%] after:rounded-full after:bg-current after:opacity-0 after:transition-opacity after:duration-150 group-hover/resize:after:opacity-[0.12] hover:after:opacity-[0.3] group-[.is-resized]/resize:after:opacity-[0.12] group-[.is-resizing]/resize:after:opacity-[0.3]" aria-hidden="true"></div>
            </div>
        </div>

        <!-- Code -->
        <details class="group @container">
           <summary class="flex cursor-pointer justify-between items-center rounded-b-2xl px-6 text-sm font-light bg-styleguide-bg">
                <span class="flex gap-2 items-center py-4 select-none">
                    <svg class="h-4 w-4 group-open:rotate-90 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
                        <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                    </svg>

                    <span class="group-open:hidden">Show code</span>
                    <span class="group-open:block hidden">Hide code</span>
                </span>
                
                <span class="flex items-center"> 
                    ${section.figma
                      ? `<a
                            class="inline-flex items-center group/figma gap-1.5 p-4 desktop-device-only cursor-pointer active:scale-90 transition hover:text-styleguide-highlight duration-200" 
                            href="${computeFigmaExternalLink(section.figma)}"
                            target="_blank"
                        >
                            <span class="hidden @2xl:inline-block">Open in</span>
                            <span class="sr-only">Figma</span>
                            <img 
                                src="styleguide-assets/icons/figma.svg"
                                width="600" 
                                height="600" 
                                class="size-4 saturate-0 group-hover/figma:saturate-100 transition" 
                                alt="Figma Logo" 
                                aria-hidden="true" 
                            >
                        </a>`
                      : ''}
                
                      ${openInEditorPaths.html
                        ? `
                            ${renderOpenInEditorLink('phpstorm', openInEditorPaths.html.phpstorm.includes('.pug') ? 'Pug' : 'HTML', openInEditorPaths.html.phpstorm)}
                            ${renderOpenInEditorLink('vscode', openInEditorPaths.html.phpstorm.includes('.pug') ? 'Pug' : 'HTML', openInEditorPaths.html.vscode)}
                          `
                        : ''}
                          
                      ${openInEditorPaths.css
                        ? `
                            ${renderOpenInEditorLink('phpstorm', 'CSS', openInEditorPaths.css.phpstorm)}
                            ${renderOpenInEditorLink('vscode', 'CSS', openInEditorPaths.css.vscode)}
                          `
                        : ''}

                    <button
                        class="inline-flex items-center gap-1.5 p-4 cursor-pointer active:scale-90 transition hover:text-styleguide-highlight duration-200" 
                        type="button"
                        data-clipboard-value="${encodeURIComponent(section.markup)}"
                        data-clipboard-uri-encoded="true"
                    >
                        <svg class="h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <title>Clipboard</title>
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>

                        <span class="hidden @2xl:inline-block">Copy</span>
                        <span class="sr-only"> Code</span>
                    </button>

                    <button
                        class="inline-flex items-center gap-1.5 p-4 cursor-pointer active:scale-90 transition hover:text-styleguide-highlight duration-200" 
                        type="button"
                        data-code-audit-iframe="preview-fullpage-${sectionSanitizeId(section.id)}"
                        aria-controls="code-audit-dialog"
                        aria-expanded="false"
                    >
                        <svg class="h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 122.88" aria-hidden="true"><title>accessibility</title><path fill="currentcolor" d="M61.44,0A61.46,61.46,0,1,1,18,18,61.21,61.21,0,0,1,61.44,0Zm-.39,74.18L52.1,98.91a4.94,4.94,0,0,1-2.58,2.83A5,5,0,0,1,42.7,95.5l6.24-17.28a26.3,26.3,0,0,0,1.17-4,40.64,40.64,0,0,0,.54-4.18c.24-2.53.41-5.27.54-7.9s.22-5.18.29-7.29c.09-2.63-.62-2.8-2.73-3.3l-.44-.1-18-3.39A5,5,0,0,1,27.08,46a5,5,0,0,1,5.05-7.74l19.34,3.63c.77.07,1.52.16,2.31.25a57.64,57.64,0,0,0,7.18.53A81.13,81.13,0,0,0,69.9,42c.9-.1,1.75-.21,2.6-.29l18.25-3.42A5,5,0,0,1,94.5,39a5,5,0,0,1,1.3,7,5,5,0,0,1-3.21,2.09L75.15,51.37c-.58.13-1.1.22-1.56.29-1.82.31-2.72.47-2.61,3.06.08,1.89.31,4.15.61,6.51.35,2.77.81,5.71,1.29,8.4.31,1.77.6,3.19,1,4.55s.79,2.75,1.39,4.42l6.11,16.9a5,5,0,0,1-6.82,6.24,4.94,4.94,0,0,1-2.58-2.83L63,74.23,62,72.4l-1,1.78Zm.39-53.52a8.83,8.83,0,1,1-6.24,2.59,8.79,8.79,0,0,1,6.24-2.59Zm36.35,4.43a51.42,51.42,0,1,0,15,36.35,51.27,51.27,0,0,0-15-36.35Z"/></svg>
                        <span class="hidden md:inline-block">Audit</span>
                    </button>
                    
                    ${getHasSectionExternalFullpage(section)
                      ? `
                       <a
                            class="hidden [.styleguide-section--large_&]:inline-block -mr-2 px-2 py-4 group/externallink hover:text-styleguide-highlight focus:text-styleguide-highlight"
                            href="/${section.fullpageFileName}"
                            target="_blank"
                            title="Open ${section.header} in fullpage"
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4">
                            <path class="transition group-hover/externallink:translate-x-px group-hover/externallink:-translate-y-px group-focus/externallink:translate-x-px group/externallink-focus:-translate-y-px" d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"/>
                            <path class="transition" d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                        </svg>
                      </a>
                    `
                      : ''}
                </span>
            </summary>

            <div class="border-t p-6 text-sm bg-styleguide-bg-highlight border-styleguide-border">
                <div 
                  id="code-fullpage-${sectionSanitizeId(section.id)}" 
                  class="overflow-x-auto w-full code-highlight"
                  data-source-code="${encodeURIComponent(section.markup)}"
                  data-source-lang="html"
                ></div>
            </div>
        </details>
    </div>
    
    ${section.modifiers?.length > 0
      ? `
       <!-- Modifiers List -->
      <h3 class="mt-6 flex items-center text-xl font-semibold text-styleguide-theme-highlight gap-1.5">
          ${section.header} Modifiers
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4 text-styleguide">
              <path d="M7.25 1.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5ZM11.536 2.904a.75.75 0 1 1 1.06 1.06l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.061ZM14.5 7.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 .75-.75ZM4.464 9.975a.75.75 0 0 1 1.061 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061ZM4.5 7.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 .75-.75ZM5.525 3.964a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 1.06-1.061l1.061 1.06ZM8.779 7.438a.75.75 0 0 0-1.368.366l-.396 5.283a.75.75 0 0 0 1.212.646l.602-.474.288 1.074a.75.75 0 1 0 1.449-.388l-.288-1.075.759.11a.75.75 0 0 0 .726-1.165L8.78 7.438Z" />
          </svg>
      </h3>
      <ul class="mt-4 grid gap-6 overflow-hidden rounded-2xl border p-6 border-styleguide-border bg-styleguide-bg-highlight md:gap-x-10 md:gap-y-14">
          ${section.modifiers?.map(modifier => `
              <li>
                <div>
                    <div class="flex items-center justify-between gap-6">
                        <div class="flex items-center gap-3">
                            <h4 class="font-semibold text-styleguide-theme-highlight">${modifier.description}</h4>
    
                            <button
                                class="inline-block rounded-md cursor-copy border py-1 font-mono font-semibold transition duration-500 text-[10px] border-styleguide-border px-2.5 bg-styleguide-bg-highlight hover:text-styleguide-highlight focus:text-styleguide-highlight"
                                type="button"
                                title="Copy content"
                                data-clipboard-value="${modifier.value}"
                                data-clipboard-alert-message="${modifier.value.split('.').length === 0 ? 'Copied class name to clipboard!' : 'Copied class names to clipboard!'}"
                            >
                                ${modifier.value}
                            </button>
                        </div>
    
                        <a 
                            class="p-2 group"
                            href="/${section.fullpageFileName}?modifier=${modifier.value}" 
                            target="_blank" 
                            title="Open in fullpage"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
                                <path class="transition group-hover:translate-x-px group-hover:-translate-y-px group-focus:translate-x-px group-focus:-translate-y-px"
                                      d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"/>
                                <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                            </svg>
                        </a>
                    </div>
    
                    <div class="preview-resize-container relative max-w-full group/resize [&.is-resizing_iframe]:pointer-events-none mt-2">
                        <iframe
                              src="/${section.fullpageFileName}"
                              class="preview-iframe"
                              data-preview="true"
                              data-modifier="${modifier.value}"
                              title="${section.header} Preview - Modifier: ${modifier.value}"
                              scrolling="no"
                        ></iframe>
                        <div class="preview-resize-handle absolute top-0 right-0 w-3 h-full cursor-col-resize hidden md:flex items-center justify-center touch-none after:content-[''] after:w-1 after:h-[80%] after:rounded-full after:bg-current after:opacity-0 after:transition-opacity after:duration-150 group-hover/resize:after:opacity-[0.12] hover:after:opacity-[0.3] group-[.is-resized]/resize:after:opacity-[0.12] group-[.is-resizing]/resize:after:opacity-[0.3]" aria-hidden="true"></div>
                    </div>
                </div>
            </li>
          `).join('\n')}
      </ul>
    `
      : ''}
  `

  if (section.figma) {
    const computedFigmaUrl = new URL(section.figma)
    computedFigmaUrl.searchParams.append('theme', 'system') // theme will also be overwritten by theme-selector
    computedFigmaUrl.searchParams.append('mode', 'dev')
    computedFigmaUrl.searchParams.append('page-selector', 'false')
    computedFigmaUrl.searchParams.append('scaling', 'contain')

    const tabs: Tab[] = [
      {
        title: 'Design',
        icon: `<img src="styleguide-assets/icons/figma.svg" width="600" height="600" alt="Figma Logo" class="size-3">`,
        content: `
              <div class="mt-4 overflow-hidden rounded-2xl border border-styleguide-border">
                  <div class="w-full border-b px-6 pt-6 pb-3 dark:pb-6 bg-styleguide-bg-highlight border-styleguide-border">
                      <iframe 
                        width="800" 
                        height="450" 
                        src="${computedFigmaUrl.href}"
                        class="aspect-video size-full"
                        title="${section.header} Figma Design Preview" 
                        allowfullscreen
                        loading="<replace-figma-iframe-loading-strategy>"
                      ></iframe>
                  </div>
              </div>
            `,
      },
    ]

    if (section.markup && section.markup.length > 0) {
      tabs.unshift({
        title: 'Preview',
        content: codePreviewMarkup,
      })
    }

    return `
      <div class="mt-4">
        ${renderTab(tabs).replaceAll('<replace-figma-iframe-loading-strategy>', tabs.length > 1 ? 'lazy' : 'eager')}
      </div>
    `
  }

  return codePreviewMarkup
}

function getMainContentColors(section: in2Section): string {
  return `
    <ul class="my-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        ${section.colors?.map(
          color => `<li>
            <button 
                class="relative w-full rounded-2xl px-4 py-6 cursor-copy" 
                type="button"
                style="background-color: ${color.color}"
                data-clipboard-value="${color.color}"
                data-clipboard-alert-message="Copied color to clipboard!"
              >
                <span class="sr-only">Copy color to clipboard</span>  
              </button>
          </li>`,
        ).join('\n')}
    </ul>
  `
}

export function getAlerts() {
  return `
    <div id="alerts"></div>
  `
}

function getMainContentIcons(section: in2Section): string {
  return `
    <form
        id="icon-search"
        class="my-6 flex items-center overflow-hidden rounded-2xl border px-4 py-2 gap-2.5 bg-styleguide-bg-highlight border-styleguide-border"
        onsubmit="return false;"
    >
        <label for="icon-search-input">
            <span class="sr-only">Search icons</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd" />
            </svg>
        </label>

        <input
            id="icon-search-input"
            class="grow bg-transparent icon-search-input h-[28px] focus:outline-hidden"
            placeholder="Search icons..."
            aria-autocomplete="list"
            autocomplete="off"
            role="combobox"
            spellcheck="false"
            type="text"
            value=""
            aria-controls="icon-search"
        >

        <button
            id="icon-search-input-reset"
            class="hidden icon-search-input-reset"
            type="reset"
        >
            <span class="sr-only">Reset search input</span>

            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
        </button>
    </form>

    <div class="@container min-h-[400px] md:min-h-[250px]">
        <ul
            id="icon-search-list"
            class="grid grid-cols-2 gap-4 @lg:grid-cols-3 @xl:grid-cols-4"
        >
            ${section.icons?.map(icon => `
              <li class="relative grid gap-4 rounded-2xl border border-transparent px-4 py-6 items icon-search-list__item bg-styleguide-bg-highlight transition hover:border-styleguide-border focus:border-styleguide-border">
                  <div class="relative flex w-full justify-center size-6 text-styleguide-highlight [&>svg]:h-full [&>svg]:w-auto [&>i]:size-[24px] [&>i]:text-[24px] [&>i]:leading-[1em]">
                      ${icon.svg}
  
                      <!-- Successfully copied icon -->
                      <svg class="pointer-events-none icon-search-list__item-copy-icon size-5 text-styleguide-highlight" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
                      </svg>
                  </div>
                  <p class="text-center font-mono text-sm font-semibold hyphens-auto break-all">${icon.name}</p>
                  <button
                    class="absolute inset-0 cursor-copy bg-transparent icon-search-list__item-copy"
                    type="button"
                    title="Copy svg content"
                  ></button>
              </li>
            `).join('\n')}
        </ul>
    </div>
  `
}

export function getNextPageControlsHtml(data: {
  before?: {
    label: string
    href: string
  }
  after?: {
    label: string
    href: string
  }
}) {
  return `
<nav class="flex w-full justify-between px-4 py-10 md:px-10">
    <div>    
        ${data.before
          ? `
          <a id="styleguide-previous" class="flex items-center gap-1 group" href="${data.before.href}">
            <svg class="h-5 w-5 transition group-hover:-translate-x-0.5 group-focus:-translate-x-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
            </svg>
    
            <span class="grid gap-1.5">
                <span class="text-sm font-light leading-none">Previous</span>
                <span class="font-semibold leading-none text-styleguide-highlight">${data.before.label}</span>
            </span>
        </a>
        `
          : ``}
    </div>
    
    <div>
        ${data.after
          ? `
                <a id="styleguide-next" class="flex items-center gap-1 group" href="${data.after.href}">
                    <span class="grid text-right gap-1.5">
                        <span class="text-sm font-light leading-none">Next</span>
                        <span class="font-semibold leading-none text-styleguide-highlight">${data.after.label}</span>
                    </span>
        
                    <svg class="h-5 w-5 transition group-hover:translate-x-0.5 group-focus:translate-x-0.5"
                         xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                    </svg>
                </a>
        `
          : ``}
    </div>
</nav>
`.trim()
}

export type MenuSearchKeywords = {
  id?: string
  keywords: string[]
}[]

export function getSearchHtml(sections: {
  title: string
  items: {
    label: string
    href: string
    searchKeywords: MenuSearchKeywords
  }[]
}[]) {
  return `
<dialog
    id="search-dialog"
    class="fixed inset-0 top-8 z-30 backdrop:hidden -mb-px size-full max-sm:max-h-none md:h-auto overflow-y-hidden max-w-none rounded-t-2xl border bg-styleguide-bg border-styleguide-border text-styleguide md:max-w-[720px] md:top-12 md:max-h-[calc(100%-5rem)] md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:rounded-2xl mx-0 lg:top-24 lg:max-h-[calc(100%-8rem)]"
>
    <h2 class="sr-only">Search</h2>
    <div class="flex items-center h-[53px] border-b px-4 py-3 border-styleguide-border">
        <label for="search-input" class="sr-only">Search styleguide</label>
        <input
            id="search-input"
            class="grow bg-transparent text-[18px] h-[28px] focus:outline-hidden"
            placeholder="Search..."
            aria-autocomplete="list"
            aria-controls="search-list"
            autocomplete="off"
            role="combobox"
            spellcheck="false"
            type="text"
            value=""
            aria-expanded="false"
        >
        <button id="search-dialog-close" class="md:hidden -mr-1 p-1 rounded-md text-styleguide hover:bg-styleguide-bg-highlight transition" type="button" aria-label="Close search">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
        </button>
    </div>

    <div role="tablist" aria-label="Filter by category" class="relative flex gap-1 px-4 py-2 border-b border-styleguide-border overflow-x-auto">
        <div class="search-tab-background absolute inset-y-2 left-0 bg-[rgb(242,242,242)] dark:bg-[rgb(26,26,26)] rounded-md"></div>
        <button role="tab" data-search-tab="all" aria-selected="true" class="search-tab relative text-sm px-3 py-1.5 rounded-md whitespace-nowrap cursor-pointer font-medium text-styleguide-highlight">All</button>
        ${sections.map((section, i) => `
            <button role="tab" data-search-tab="${i}" aria-selected="false" class="search-tab relative text-sm px-3 py-1.5 rounded-md whitespace-nowrap cursor-pointer">${section.title}</button>
        `).join('\n')}
    </div>

    <div
      id="search-list"
      role="listbox"
      class="grid gap-4 px-4 py-3 text-sm overflow-y-auto max-h-[calc(100%-2rem-53px-45px)] md:max-h-[calc(85dvh-53px-45px)]"
    >
        ${sections.map((section, categoryIdx) => `
            <div class="search-category" id="search-category-${categoryIdx}" data-category-index="${categoryIdx}">
                <h3 class="mb-2">${section.title}</h3>
                <ul>
                    ${section.items.map((item, itemIdx) => `
                        <li
                            id="search-item-${categoryIdx}-${itemIdx}"
                            role="option"
                            aria-selected="false"
                            class="search-category__item search-category__item--active"
                            data-search-keywords="${encodeURIComponent(JSON.stringify(item.searchKeywords))}"
                          >
                            <a
                                class="flex items-center gap-4 px-1.5 py-2.5 group rounded-md hover:bg-[rgb(242,242,242)] focus:bg-[rgb(242,242,242)] dark:hover:bg-[rgb(26,26,26)] dark:focus:bg-[rgb(26,26,26)] transition"
                                href="${item.href}"
                                tabindex="-1"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="transition-all size-5 group-hover:translate-x-0.5 group-focus:translate-x-0.5">
                                    <path fill-rule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clip-rule="evenodd" />
                                </svg>
                                <span class="text-styleguide-highlight">${item.label}</span>
                                <span data-type="search-hint" class="text-styleguide-highlight"></span>
                            </a>
                        </li>
                    `).join('\n')}
                </ul>
            </div>
        `).join('\n')}
    </div>

    <p id="search-no-results" class="hidden px-6 py-8 text-center text-sm">
        No results found
    </p>
</dialog>

<div class="dialog-backdrop"></div>
`.trim()
}

export async function generatePreviewFile(data: {
  filePath: string
  page: {
    title: string
    description?: string
    lang: string
  }
  css: StyleguideConfiguration['html']['assets']['css']
  js: StyleguideConfiguration['html']['assets']['js']
  html: {
    header: string
    sidebarMenu: string
    mainContent: string
    nextPageControls: string
    search: string
    codeAuditDialog: string
    alerts: string
    preloadIframes: string[]
  }
  theme: StyleguideConfiguration['theme']
  deactivateDarkMode?: boolean
  ogImageUrl?: string
}) {
  const computedScriptTags = data.js
    .filter(entry => entry.type === 'overwriteStyleguide')
    .map((js) => {
      const additionalAttributes = js.additionalAttributes ? objectEntries(js.additionalAttributes).map(([key, value]) => `${key}="${value}"`).join(' ') : ''
      return `<script src="${js.src}" ${additionalAttributes}></script>`
    })
    .join('\n')

  const computedStyleTags = data.css
    .filter(entry => entry.type === 'overwriteStyleguide')
    .map((css) => {
      return `<link rel="stylesheet" type="text/css" href="${css.src}">`
    })
    .join('\n')

  const shouldRenderMetaDescription = data.page.description
    && data.page.description.length > 0
    && !(data.page.description.includes('<') && data.page.description.includes('>'))

  const content = `
<!DOCTYPE html>
<html lang="${data.page.lang}" class="scroll-smooth">
<head>
    <title>${sanitizeSpecialCharacters(data.page.title)}</title>
    ${data.page.description && shouldRenderMetaDescription ? `<meta name="description" content="${data.page.description.replaceAll(`'`, '').replaceAll(`"`, '')}">` : ''}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="styleguide">
    ${typeof data.theme === 'object' && 'dark' in data.theme && 'light' in data.theme
      ? `
          <meta name="theme-color" media="(prefers-color-scheme: light)" content="${data.theme.light}">
          <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${data.theme.dark}">
          <link rel="icon" type="image/svg+xml" href="/styleguide-assets/favicon/preview.svg">
      `
      : `
        <meta name="theme-color" content="${data.theme}">
        <link rel="icon" type="image/svg+xml" href="/styleguide-assets/favicon/preview-light.svg">
      `}
    <link rel="stylesheet" type="text/css" href="/styleguide-assets/__STYLEGUIDE_CSS__">
    __STYLEGUIDE_PREVIEW_INLINE__
    <script type="module" src="/styleguide-assets/__STYLEGUIDE_PREVIEW_JS__"></script>
    <link rel="preload" href="/styleguide-assets/fonts/geist-mono-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous">
    <link rel="preload" href="/styleguide-assets/fonts/geist-mono-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous">
    <link rel="preload" href="/styleguide-assets/fonts/geist-mono-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous">
    <link rel="preload" href="/styleguide-assets/fonts/geist-mono-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous">
    <link rel="preload" href="/styleguide-assets/fonts/geist-mono-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous">
    ${data.ogImageUrl ? `<meta property="og:image" content="${data.ogImageUrl}">` : ''}
    ${computedStyleTags}
    <style>
        :root {
            --styleguide-color-theme-highlight: ${typeof data.theme === 'string' ? data.theme : `light-dark(${data.theme.light}, ${data.theme.dark})`};
        }
    </style>
</head>
<body class="relative min-h-screen antialiased text-styleguide${data.deactivateDarkMode ? ' theme-light' : ''}">
    ${data.html.header}
  
    <main class="relative flex h-full min-h-screen min-[1222px]:border-x min-[1220px]:mx-auto max-w-[1600px] border-styleguide-border">
      <aside
          class="sticky order-1 hidden flex-col overflow-y-auto border-r z-100 w-[260px] border-styleguide-border shrink-0 md:flex"
          style="top: var(--header-height); max-height: calc(100vh - var(--header-height))"
      >
        <nav>
            ${data.html.sidebarMenu}
        </nav>
      </aside>
      
      <div class="order-2 w-full md:w-[calc(100%-260px)]">
        ${data.html.mainContent}
        ${data.html.nextPageControls}
      </div>
    </main>
   
    ${data.html.alerts}
    ${data.html.search}
    ${data.html.codeAuditDialog}
    
    <script type="speculationrules">
    {
      "prerender": [{
        "where": {
          "href_matches": "/*"
        },
        "eagerness": "moderate"
      }]
    }
    </script>
    
    ${computedScriptTags}
</body>
</html>
`.trim()

  await logicalWriteFile(data.filePath, content)
}
