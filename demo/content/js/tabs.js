// Roving-tabindex tablist: click or arrow keys select a tab and show its panel.
export function initTabs() {
  document.querySelectorAll('.tabs').forEach((tabs) => {
    const tabEls = Array.from(tabs.querySelectorAll('[role="tab"]'))

    const select = (tab) => {
      tabEls.forEach((el) => {
        const isSelected = el === tab
        el.setAttribute('aria-selected', String(isSelected))
        el.tabIndex = isSelected ? 0 : -1
        const panel = document.getElementById(el.getAttribute('aria-controls'))
        if (panel)
          panel.hidden = !isSelected
      })
      tab.focus()
    }

    tabEls.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab))
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight')
          select(tabEls[(index + 1) % tabEls.length])
        else if (event.key === 'ArrowLeft')
          select(tabEls[(index - 1 + tabEls.length) % tabEls.length])
      })
    })
  })
}
