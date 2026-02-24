const LOCAL_STORAGE_KEY = 'in2theme'

const THEME_CLASSES = {
  normal: 'theme-normal',
  light: 'theme-light',
  dark: 'theme-dark',
} as const

export function handleThemeSelect(themeSelectForm: HTMLFormElement) {
  // Media query for system dark mode preference
  const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)')

  function getThemeFromLocalStorage(): keyof typeof THEME_CLASSES {
    const theme = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!theme) {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'normal')
    }

    return theme as keyof typeof THEME_CLASSES
  }

  function handleThemeSwitch() {
    const currentTheme = getThemeFromLocalStorage()
    let themeClass = THEME_CLASSES[currentTheme]

    // If normal theme is selected, check system preference
    if (currentTheme === 'normal' && systemDarkMode.matches) {
      themeClass = THEME_CLASSES.dark
    }

    const removeClasses = <T extends HTMLElement>(element: T) => {
      Object.values(THEME_CLASSES).forEach(theme => element.classList.remove(theme))
    }

    const addClasses = <T extends HTMLElement>(element: T) => {
      element.classList.add(themeClass)
    }

    // Update form classes
    removeClasses(themeSelectForm!)
    addClasses(themeSelectForm!)

    // Update iframes
    const iframes = document.querySelectorAll('iframe')
    if (iframes) {
      iframes.forEach((iframe) => {
        removeClasses(iframe)
        addClasses(iframe)
      })
    }

    // Update body classes
    removeClasses(document.body)
    addClasses(document.body)

    // reload figma iframes, because they don't autodetect theme changes
    Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'))
      .filter(iframe => iframe.src.includes('embed.figma.com'))
      .forEach((iframe) => {
        const url = new URL(iframe.src)

        if (currentTheme === 'normal') {
          url.searchParams.set('theme', 'system')
        }
        else {
          url.searchParams.set('theme', currentTheme)
        }

        iframe.src = url.href
      })

    setTimeout(() => {
      document.body.classList.add('allow-transitions')
    }, 500)
  }

  // Handle system theme changes when normal theme is selected
  systemDarkMode.addEventListener('change', () => {
    const currentTheme = getThemeFromLocalStorage()
    if (currentTheme === 'normal') {
      handleThemeSwitch()
    }
  })

  handleThemeSwitch()

  themeSelectForm.addEventListener('change', () => {
    const selectedThemeInput = themeSelectForm.querySelector<HTMLInputElement>('input[name="theme"]:checked')
    if (!selectedThemeInput)
      throw new Error('No selected theme found')

    const theme = selectedThemeInput.value
    localStorage.setItem(LOCAL_STORAGE_KEY, theme)

    handleThemeSwitch()
  })

  // pre active checkbox with correct theme
  const currentTheme = getThemeFromLocalStorage()
  const currentThemeInput = themeSelectForm.querySelector<HTMLInputElement>(`input[value="${currentTheme}"]`)
  if (!currentThemeInput)
    throw new Error('No current theme input found')

  currentThemeInput.checked = true
}
