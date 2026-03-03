import type { MenuSearchKeywords } from '../../lib/templates/preview.ts'
import { useDialog } from '../hooks/use-dialog.ts'
import { queryRequired } from '../utils.ts'

const dialog = queryRequired<HTMLDialogElement>('#search-dialog')
const dialogBackdrop = queryRequired<HTMLElement>('.dialog-backdrop')

const openSearchTriggers = document.querySelectorAll<HTMLButtonElement>('[data-open-search]')
if (openSearchTriggers.length === 0)
  throw new Error('No open search buttons found')

const searchInput = queryRequired<HTMLInputElement>('#search-input')
const searchList = queryRequired<HTMLElement>('#search-list')

const searchResults = document.querySelectorAll<HTMLElement>('.search-category__item--active')
if (!searchResults)
  throw new Error('No search results found')

const searchNoResults = queryRequired<HTMLElement>('#search-no-results')

const { show, close } = useDialog(dialog, dialogBackdrop)

async function showDialog() {
  await show(
    (isMobileScreen) => {
      if (isMobileScreen) {
        searchInput.setAttribute('inert', '') // avoid focusing search input directly
      }
    },
    (isMobileScreen) => {
      if (isMobileScreen) {
        searchInput.removeAttribute('inert')
      }

      openSearchTriggers.forEach(trigger => trigger.ariaExpanded = 'true')
      searchInput.ariaExpanded = 'true'

      handleSearchFilter()
    },
  )
}

function handleSearchFilter() {
  const searchValue = searchInput.value.toLowerCase().trim()
  let hasSearchResults = false

  searchResults.forEach((result) => {
    const link = queryRequired<HTMLLinkElement>('a', result, 'No link found inside search result item')

    let isValidResult = false

    const rawSearchKeywords = result.getAttribute('data-search-keywords')
    if (!rawSearchKeywords)
      throw new Error('No data-search-keywords attribute found on search result item')

    const searchKeywords: MenuSearchKeywords = JSON.parse(decodeURIComponent(rawSearchKeywords))
    if (searchKeywords.length > 0) {
      searchKeywords.forEach((x) => {
        if (isValidResult)
          return

        const hasValidKeyword = x.keywords.some(kw => kw.toLowerCase().includes(searchValue))
        if (hasValidKeyword) {
          isValidResult = true

          if (x.id) {
            const url = new URL(link.href, window.location.origin)
            url.hash = `#${x.id}`
            link.href = url.toString()
          }
        }
      })
    }
    else {
      const resultText = result.textContent?.toLowerCase() ?? ''
      isValidResult = resultText?.includes(searchValue)
    }

    result.classList.toggle('search-category__item--active', isValidResult)

    if (isValidResult)
      hasSearchResults = true
  })

  searchList.classList.toggle('hidden', !hasSearchResults)
  searchNoResults.classList.toggle('hidden', hasSearchResults)
}

searchInput.addEventListener('input', handleSearchFilter)
openSearchTriggers.forEach(button => button.addEventListener('click', showDialog))

// detect custom event to open search
window.addEventListener('styleguideOpenSearch', showDialog)

// close dialog when link click is on the same page
dialog.addEventListener('click', async (event) => {
  const isTargetLink = event.target && event.target instanceof HTMLElement && event.target.tagName === 'A'
  if (!isTargetLink)
    return

  const link = event.target as HTMLAnchorElement

  const currentUrl = new URL(window.location.href)
  const linkUrl = new URL(link.href)

  const isSamePage = currentUrl.pathname === linkUrl.pathname && currentUrl.search === linkUrl.search
  if (!isSamePage)
    return

  await close()
})
