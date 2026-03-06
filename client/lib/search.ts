import type { MenuSearchKeywords } from '../../lib/templates/preview.ts'
import { animate, spring } from 'motion'
import { useDialog } from '../hooks/use-dialog.ts'
import { signal } from '../lib/signal.ts'
import { queryRequired } from '../utils.ts'

const dialog = queryRequired<HTMLDialogElement>('#search-dialog')
const dialogBackdrop = queryRequired<HTMLElement>('.dialog-backdrop')

const openSearchTriggers = document.querySelectorAll<HTMLButtonElement>('[data-open-search]')
if (openSearchTriggers.length === 0)
  throw new Error('No open search buttons found')

const searchInput = queryRequired<HTMLInputElement>('#search-input')
const searchList = queryRequired<HTMLElement>('#search-list')

const allItems = document.querySelectorAll<HTMLElement>('.search-category__item')
if (!allItems.length)
  throw new Error('No search results found')

const searchNoResults = queryRequired<HTMLElement>('#search-no-results')
const categories = document.querySelectorAll<HTMLElement>('.search-category')
const tabs = document.querySelectorAll<HTMLButtonElement>('[data-search-tab]')
const searchTabBackground = queryRequired<HTMLElement>('.search-tab-background')

function calculateSearchTabBackground(activeTab: HTMLButtonElement, shouldAnimate: boolean) {
  const width = activeTab.offsetWidth
  const offset = activeTab.offsetLeft

  if (shouldAnimate) {
    animate(searchTabBackground, {
      width,
      x: `${offset}px`,
    }, {
      duration: 0.3,
      easing: 'ease-out',
      type: spring,
      bounce: 0.1,
    })
  }
  else {
    searchTabBackground.style.width = `${width}px`
    searchTabBackground.style.transform = `translateX(${offset}px)`
  }
}

const { show, close } = useDialog(dialog, dialogBackdrop)

const closeButton = queryRequired<HTMLButtonElement>('#search-dialog-close', dialog)
closeButton.addEventListener('click', () => close())

const activeTab = signal<string>('all')
const activeIndex = signal(-1)

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

      // Position background on active tab now that dialog is visible
      const currentTab = dialog.querySelector<HTMLButtonElement>('[data-search-tab][aria-selected="true"]')
      if (currentTab)
        calculateSearchTabBackground(currentTab, false)

      handleSearchFilter()
    },
  )
}

function getVisibleItems(): HTMLElement[] {
  const items: HTMLElement[] = []
  for (const item of allItems) {
    if (!item.classList.contains('search-category__item--active'))
      continue
    const category = item.closest<HTMLElement>('.search-category')
    if (category && category.classList.contains('search-category--hidden'))
      continue
    items.push(item)
  }
  return items
}

function handleSearchFilter() {
  const searchValue = searchInput.value.toLowerCase().trim()
  let hasSearchResults = false

  allItems.forEach((result) => {
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

  // Apply tab filtering
  const tab = activeTab.value
  categories.forEach((category) => {
    if (tab === 'all') {
      category.classList.remove('search-category--hidden')
    }
    else {
      const isMatch = category.getAttribute('data-category-index') === tab
      category.classList.toggle('search-category--hidden', !isMatch)
    }
  })

  // Recheck if any results are visible after tab filtering
  if (tab !== 'all') {
    hasSearchResults = getVisibleItems().length > 0
  }

  searchList.classList.toggle('hidden', !hasSearchResults)
  searchNoResults.classList.toggle('hidden', hasSearchResults)
}

// Tab click handlers
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab.value = tab.getAttribute('data-search-tab') ?? 'all'
  })
})

// Update tab visual state and re-filter when active tab changes
activeTab.effect(() => {
  tabs.forEach((tab) => {
    const isActive = tab.getAttribute('data-search-tab') === activeTab.value
    tab.setAttribute('aria-selected', String(isActive))
    tab.classList.toggle('font-medium', isActive)
    tab.classList.toggle('text-styleguide-highlight', isActive)
    if (isActive)
      calculateSearchTabBackground(tab, true)
  })
  activeIndex.value = -1
  handleSearchFilter()
})

// Update focused item visual state when active index changes
activeIndex.effect(() => {
  const visibleItems = getVisibleItems()
  visibleItems.forEach((item, i) => {
    const isFocused = i === activeIndex.value
    item.classList.toggle('search-category__item--focused', isFocused)
    item.setAttribute('aria-selected', String(isFocused))
  })

  if (activeIndex.value >= 0 && activeIndex.value < visibleItems.length) {
    const activeItem = visibleItems[activeIndex.value]
    searchInput.setAttribute('aria-activedescendant', activeItem.id)
    activeItem.scrollIntoView({ block: 'nearest' })
  }
  else {
    searchInput.removeAttribute('aria-activedescendant')
  }
})

searchInput.addEventListener('input', () => {
  activeIndex.value = -1
  handleSearchFilter()
})

function handleListKeydown(event: KeyboardEvent) {
  const visibleItems = getVisibleItems()

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, visibleItems.length - 1)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
  else if (event.key === 'Enter') {
    if (activeIndex.value >= 0 && activeIndex.value < visibleItems.length) {
      event.preventDefault()
      const link = visibleItems[activeIndex.value].querySelector<HTMLAnchorElement>('a')
      link?.click()
    }
  }
}

searchInput.addEventListener('keydown', handleListKeydown)
tabs.forEach(tab => tab.addEventListener('keydown', handleListKeydown))

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
