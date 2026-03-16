import { animate } from 'motion'
import { highlightCode } from './code-highlight'
import { useDialog } from './hooks/use-dialog.ts'
import { useElementHorizontalOverflow } from './hooks/use-overflow.ts'
import initTabs from './lib/tabs.ts'
import { queryRequired } from './utils.ts'
import './keyboard-shortcuts.ts'
import './style.css'
import './lib/menu.ts'
import './lib/search.ts'

const styleguideSections = document.querySelectorAll<HTMLElement>('.styleguide-section')
styleguideSections.forEach((section) => {
  new ResizeObserver(() => {
    const isLargeSection = section.scrollHeight > 600
    section.classList.toggle('styleguide-section--large', isLargeSection)
  }).observe(section)
})

const tabs = document.querySelectorAll<HTMLElement>('.tabs')
if (tabs.length > 0) {
  initTabs(tabs)
}

const codeDetails = document.querySelectorAll<HTMLDetailsElement>('details:has(.code-highlight)')
if (codeDetails.length > 0) {
  codeDetails.forEach((detail) => {
    const codeElement = queryRequired<HTMLElement>('.code-highlight', detail)
    highlightCode(codeElement).catch(console.error)
  })
}

const codeAuditButtons = document.querySelectorAll<HTMLButtonElement>('[data-code-audit-iframe]')
const codeAuditDialog = document.querySelector<HTMLDialogElement>('#code-audit-dialog')
const dialogBackdrop = document.querySelector<HTMLElement>('.dialog-backdrop')
if (codeAuditButtons.length > 0 && codeAuditDialog && dialogBackdrop) {
  (async () => {
    const { auditCode } = await import('./lib/html-validator.ts')
    const { show: showDialog, close: closeDialog } = useDialog(codeAuditDialog, dialogBackdrop)

    codeAuditButtons.forEach(button => button.addEventListener('click', async () => {
      codeAuditButtons.forEach(button => button.setAttribute('aria-expanded', 'false'))

      button.setAttribute('disabled', '')
      await auditCode(button, codeAuditDialog, closeDialog)
      button.removeAttribute('disabled')

      button.setAttribute('aria-expanded', 'true')
      await showDialog(
        undefined,
        () => {
          codeAuditButtons.forEach((button) => {
            button.setAttribute('aria-expanded', 'false')
          })
        },
      )
    }))
  })()
}

const iconFilterInput = document.querySelector<HTMLInputElement>('#icon-search-input')
const iconFilterReset = document.querySelector<HTMLButtonElement>('#icon-search-input-reset')
const iconList = document.querySelector<HTMLUListElement>('#icon-search-list')

if (iconFilterInput && iconList && iconFilterReset) {
  import('./lib/icons.ts')
    .then(({ default: init }) => init(iconFilterInput, iconList, iconFilterReset))
    .catch(console.error)
}

const copyAttribute = 'data-clipboard-value'
const copyButtons = document.querySelectorAll<HTMLButtonElement>(`button[${copyAttribute}]`)
if (copyButtons.length > 0) {
  import('./lib/clipboard.ts')
    .then(({ default: init }) => init(copyButtons, copyAttribute))
    .catch(console.error)
}

const markdownFolded = document.querySelectorAll<HTMLElement>('.markdown-container-folded')
if (markdownFolded.length > 0) {
  markdownFolded.forEach((container) => {
    const markdownContainer = queryRequired<HTMLElement>('.markdown-container', container)
    const showMoreContainer = queryRequired<HTMLElement>('.markdown-show-more-container', container)
    const showMoreButton = queryRequired<HTMLButtonElement>('.markdown-show-more', container)

    const { $isOverflowingVertically } = useElementHorizontalOverflow(container)
    const handleOverflow = () => {
      // detect if content inside markdownContainer is larger than maxWidth
      const newIsOverflowing = markdownContainer.scrollHeight > markdownContainer.clientHeight
      showMoreContainer.classList.toggle('hidden', !newIsOverflowing)
    }

    handleOverflow()
    const cleanup = $isOverflowingVertically.effect(handleOverflow)

    // <details> toggle doesn't trigger ResizeObserver when container has constrained height
    markdownContainer.querySelectorAll('details').forEach((details) => {
      details.addEventListener('toggle', handleOverflow)
    })

    showMoreButton.addEventListener('click', async () => {
      cleanup()

      const markdownContainerHeight = markdownContainer.scrollHeight
      animate(markdownContainer, {
        maxHeight: `${markdownContainerHeight}px`,
      }, { duration: 0.5 })
        .then(() => {
          markdownContainer.classList.remove('max-h-[400px]')
          markdownContainer.style.maxHeight = ''
        })

      animate(showMoreContainer, {
        opacity: 0,
      }, { duration: 0.5 })
        .then(() => showMoreContainer.classList.add('hidden'))
    })
  })
}

let isScrollingTimeout: Timer | undefined
window.addEventListener('scroll', () => {
  if (isScrollingTimeout) {
    clearTimeout(isScrollingTimeout)
    isScrollingTimeout = undefined
  }

  if (!document.body.classList.contains('is-scrolling'))
    document.body.classList.add('is-scrolling')

  isScrollingTimeout = setTimeout(() => {
    document.body.classList.remove('is-scrolling')
  }, 250)
})

const editorSelectForm = document.querySelector<HTMLFormElement>('.editor-select')
if (editorSelectForm) {
  import('./lib/editor-select.ts')
    .then(({ default: init }) => init(editorSelectForm))
    .catch(console.error)
}
