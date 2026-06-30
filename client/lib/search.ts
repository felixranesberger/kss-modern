import type { MenuSearchKeywords } from '../../lib/templates/preview.ts'
import UFuzzy from '@leeoniya/ufuzzy'
import { animate, spring } from 'motion'
import { sanitizeSpecialCharacters } from '../../lib/shared.ts'
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

// Persist the query for the tab session (same pattern as menu.ts's scroll position) so a search
// survives the full-page navigation to a result, scoped by project slug (`data-project` on the
// dialog) so styleguides sharing an origin don't share a query. Restored into the input here; the
// dialog's afterAnimation re-renders the matches and pre-selects the text on the next open.
const SEARCH_QUERY_KEY = `kss-modern-search-query-${dialog.dataset.project ?? ''}`
searchInput.value = sessionStorage.getItem(SEARCH_QUERY_KEY) ?? ''

const allItems = document.querySelectorAll<HTMLElement>('.search-category__item')
if (!allItems.length)
  throw new Error('No search results found')

const searchNoResults = queryRequired<HTMLElement>('#search-no-results')
const categories = document.querySelectorAll<HTMLElement>('.search-category')
const tabs = document.querySelectorAll<HTMLButtonElement>('[data-search-tab]')
const searchTabBackground = queryRequired<HTMLElement>('.search-tab-background')

type SearchField = 'label' | 'description' | 'subsection' | 'subsection-description'

interface HaystackEntry {
  itemIndex: number
  text: string
  id?: string
  field: SearchField
}

interface ItemRef {
  item: HTMLElement
  link: HTMLAnchorElement
  labelSpan: HTMLElement
  hintSpan: HTMLElement
  label: string
  baseHref: string
}

// Build the search index once from the data baked into the DOM, instead of
// re-parsing every item's keywords on each keystroke. The haystack is a flat
// list of searchable strings; `haystackMeta` maps each one back to its item,
// the field it came from, and the subsection id to scroll to (if any).
const haystack: string[] = []
const haystackMeta: HaystackEntry[] = []

const itemRefs: ItemRef[] = Array.from(allItems).map((item, itemIndex) => {
  const link = queryRequired<HTMLAnchorElement>('a', item, 'No link found inside search result item')
  const labelSpan = queryRequired<HTMLElement>('[data-search-label]', item, 'No label found inside search result item')
  const hintSpan = queryRequired<HTMLElement>('[data-type="search-hint"]', item, 'No hint found inside search result item')

  const rawSearchKeywords = item.getAttribute('data-search-keywords')
  if (!rawSearchKeywords)
    throw new Error('No data-search-keywords attribute found on search result item')

  const keywordGroups: MenuSearchKeywords = JSON.parse(decodeURIComponent(rawSearchKeywords))
  keywordGroups.forEach((group) => {
    group.keywords.forEach((keyword, keywordIndex) => {
      // group without id = the page itself ([header, description]);
      // group with id = a subsection ([header, description]).
      const field: SearchField = group.id
        ? (keywordIndex === 0 ? 'subsection' : 'subsection-description')
        : (keywordIndex === 0 ? 'label' : 'description')

      haystack.push(keyword)
      haystackMeta.push({ itemIndex, text: keyword, id: group.id, field })
    })
  })

  return {
    item,
    link,
    labelSpan,
    hintSpan,
    label: labelSpan.textContent ?? '',
    baseHref: link.getAttribute('href') ?? '',
  }
})

// SingleError mode gives one substitution/transposition/insertion/deletion of
// typo tolerance per term, so "buton" still finds "button".
const uf = new UFuzzy({
  intraMode: 1,
  intraIns: 1,
  intraSub: 1,
  intraTrn: 1,
  intraDel: 1,
})

const HINT_MAX_LENGTH = 90

// Wrap uFuzzy's matched ranges ([start0, end0, start1, end1, ...]) in <mark>,
// escaping everything else so authored content can't inject markup.
function highlightToHtml(text: string, ranges: number[]): string {
  let html = ''
  let cursor = 0

  for (let i = 0; i < ranges.length; i += 2) {
    const start = ranges[i]
    const end = ranges[i + 1]
    if (start > cursor)
      html += sanitizeSpecialCharacters(text.slice(cursor, start))
    html += `<mark class="search-mark">${sanitizeSpecialCharacters(text.slice(start, end))}</mark>`
    cursor = end
  }

  if (cursor < text.length)
    html += sanitizeSpecialCharacters(text.slice(cursor))

  return html
}

// Clip match ranges to [from, to) and rebase them onto a slice that starts at `from`.
function shiftRanges(ranges: number[], from: number, to: number): number[] {
  const result: number[] = []
  for (let i = 0; i < ranges.length; i += 2) {
    const start = ranges[i]
    const end = ranges[i + 1]
    if (end <= from || start >= to)
      continue
    result.push(Math.max(start, from) - from, Math.min(end, to) - from)
  }
  return result
}

// Excerpts can contain documented HTML tags (e.g. "<nav>") that survive as literal text in the
// search index. Render those as code chips so they read as markup, while still highlighting the
// matched ranges; a match that lands inside a tag tints the whole chip rather than splitting it.
function renderExcerpt(text: string, ranges: number[]): string {
  const isMatched = (from: number, to: number) => {
    for (let i = 0; i < ranges.length; i += 2) {
      if (ranges[i] < to && ranges[i + 1] > from)
        return true
    }
    return false
  }

  let html = ''
  let cursor = 0

  for (const tag of text.matchAll(/<[^<>]+>/g)) {
    const start = tag.index
    const end = start + tag[0].length
    if (start > cursor)
      html += highlightToHtml(text.slice(cursor, start), shiftRanges(ranges, cursor, start))
    const codeClass = isMatched(start, end) ? 'search-code search-mark' : 'search-code'
    html += `<code class="${codeClass}">${sanitizeSpecialCharacters(text.slice(start, end))}</code>`
    cursor = end
  }

  if (cursor < text.length)
    html += highlightToHtml(text.slice(cursor), shiftRanges(ranges, cursor, text.length))

  return html
}

// Long descriptions get clipped to a window around the first match (with
// ellipses) so the matched part stays visible. Ranges are shifted to match.
function windowAroundMatch(text: string, ranges: number[]): { text: string, ranges: number[] } {
  if (text.length <= HINT_MAX_LENGTH || ranges.length === 0)
    return { text, ranges }

  const firstStart = ranges[0]
  const lastEnd = ranges[ranges.length - 1]
  const padding = Math.max(0, Math.floor((HINT_MAX_LENGTH - (lastEnd - firstStart)) / 2))

  let start = Math.max(0, firstStart - padding)
  const end = Math.min(text.length, start + HINT_MAX_LENGTH)
  start = Math.max(0, end - HINT_MAX_LENGTH)

  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const windowed = prefix + text.slice(start, end) + suffix

  // Clip the ranges to the window, then push them past the leading ellipsis.
  const shiftedRanges = shiftRanges(ranges, start, end).map(r => r + prefix.length)

  return { text: windowed, ranges: shiftedRanges }
}

function resetItem(ref: ItemRef) {
  ref.labelSpan.textContent = ref.label
  ref.hintSpan.textContent = ''
  ref.link.setAttribute('href', ref.baseHref)
}

function applyMatch(ref: ItemRef, entry: HaystackEntry, ranges: number[]) {
  // Jump straight to the matched subsection; otherwise land on the page top.
  if (entry.id) {
    const url = new URL(ref.baseHref, window.location.origin)
    url.hash = `#${entry.id}`
    ref.link.setAttribute('href', url.toString())
  }
  else {
    ref.link.setAttribute('href', ref.baseHref)
  }

  // Match in the page title -> highlight the visible label and clear the hint.
  if (entry.field === 'label') {
    ref.labelSpan.innerHTML = highlightToHtml(entry.text, ranges)
    ref.hintSpan.textContent = ''
    return
  }

  // Match elsewhere -> keep the label plain and surface what matched (the
  // subsection name or a snippet of the description) in the hint.
  ref.labelSpan.textContent = ref.label
  const windowed = entry.field === 'subsection'
    ? { text: entry.text, ranges }
    : windowAroundMatch(entry.text, ranges)
  ref.hintSpan.innerHTML = renderExcerpt(windowed.text, windowed.ranges)
}

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
      else {
        // Pre-select any query left over from the previous open: a keystroke then replaces it
        // (type to start fresh), while → / End / a click keeps it for refining. The Spotlight /
        // address-bar pattern. Desktop only — mobile deliberately doesn't auto-focus the input.
        searchInput.focus()
        searchInput.select()
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
  const needle = searchInput.value.trim()
  let hasSearchResults = false

  // Pick the best-ranked matching field per item: iterating `order` (best
  // first) and keeping the first hit per item means an exact subsection match
  // wins over a fuzzy title match, etc.
  const bestMatchByItem = new Map<number, { entry: HaystackEntry, ranges: number[] }>()
  if (needle !== '') {
    const [idxs, info, order] = uf.search(haystack, needle)
    if (idxs && info && order) {
      for (const orderIndex of order) {
        const entry = haystackMeta[info.idx[orderIndex]]
        if (!bestMatchByItem.has(entry.itemIndex))
          bestMatchByItem.set(entry.itemIndex, { entry, ranges: info.ranges[orderIndex] })
      }
    }
    else if (idxs) {
      // Haystack exceeded the ranking threshold: match without highlighting.
      for (const haystackIndex of idxs) {
        const entry = haystackMeta[haystackIndex]
        if (!bestMatchByItem.has(entry.itemIndex))
          bestMatchByItem.set(entry.itemIndex, { entry, ranges: [] })
      }
    }
  }

  itemRefs.forEach((ref, itemIndex) => {
    let isValidResult: boolean

    if (needle === '') {
      isValidResult = true
      resetItem(ref)
    }
    else {
      const match = bestMatchByItem.get(itemIndex)
      isValidResult = match !== undefined
      if (match)
        applyMatch(ref, match.entry, match.ranges)
      else
        resetItem(ref)
    }

    ref.item.classList.toggle('search-category__item--active', isValidResult)

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
  sessionStorage.setItem(SEARCH_QUERY_KEY, searchInput.value)
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
