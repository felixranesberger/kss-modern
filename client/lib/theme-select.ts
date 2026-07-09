// NOTE: createFormSwitcher is inlined here (not imported from form-switcher.ts)
// because theme-select is used by preview-inline.ts, which gets inlined into HTML
// as a regular <script> tag. Importing a shared module would create a separate chunk
// that can't be loaded from an inlined script.

const THEME_CLASSES = {
  normal: 'theme-normal',
  light: 'theme-light',
  dark: 'theme-dark',
} as const

// The color scheme forced inside preview iframes per theme. `normal` follows the
// OS (light dark); the explicit themes pin the scheme so light-dark() resolves
// deterministically.
const COLOR_SCHEME_BY_THEME = {
  normal: 'light dark',
  light: 'only light',
  dark: 'only dark',
} as const

/**
 * Apply the theme's color scheme to a preview iframe's OWN document root.
 *
 * `color-scheme` set on the <iframe> element does not cascade into the embedded
 * document, so light-dark() inside a preview would otherwise ignore the
 * styleguide theme and always resolve to its light value. Cross-origin iframes
 * (e.g. Figma embeds) expose no contentDocument and are skipped.
 */
export function applyPreviewColorScheme(
  iframe: HTMLIFrameElement,
  theme: keyof typeof COLOR_SCHEME_BY_THEME,
) {
  const root = iframe.contentDocument?.documentElement
  if (root)
    root.style.colorScheme = COLOR_SCHEME_BY_THEME[theme]
}

export function handleThemeSelect(themeSelectForm: HTMLFormElement) {
  const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)')

  function getStoredTheme(): keyof typeof THEME_CLASSES {
    const stored = localStorage.getItem('in2theme')
    if (!stored) {
      localStorage.setItem('in2theme', 'normal')
      return 'normal'
    }
    return stored as keyof typeof THEME_CLASSES
  }

  function applyTheme() {
    const value = getStoredTheme()
    let effectiveClass: string = THEME_CLASSES[value] ?? THEME_CLASSES.normal
    if (value === 'normal' && systemDarkMode.matches) {
      effectiveClass = THEME_CLASSES.dark
    }

    const removeClasses = (element: HTMLElement) => {
      Object.values(THEME_CLASSES).forEach(cls => element.classList.remove(cls))
    }

    // Update form, body, and iframes
    removeClasses(themeSelectForm)
    themeSelectForm.classList.add(effectiveClass)
    removeClasses(document.body)
    document.body.classList.add(effectiveClass)

    document.querySelectorAll('iframe').forEach((iframe) => {
      removeClasses(iframe)
      iframe.classList.add(effectiveClass)
      applyPreviewColorScheme(iframe, value)
    })

    // Reload Figma iframes — they don't autodetect theme changes
    Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'))
      .filter(iframe => iframe.src.includes('embed.figma.com'))
      .forEach((iframe) => {
        const url = new URL(iframe.src)
        url.searchParams.set('theme', value === 'normal' ? 'system' : value)
        iframe.src = url.href
      })

    setTimeout(() => {
      document.body.classList.add('allow-transitions')
    }, 500)
  }

  // Initial apply
  applyTheme()

  // An iframe's embedded document is replaced when its src finishes loading,
  // which drops the inline color-scheme set above — reapply it on every (re)load.
  document.querySelectorAll('iframe').forEach((iframe) => {
    iframe.addEventListener('load', () => applyPreviewColorScheme(iframe, getStoredTheme()))
  })

  // Restore the form's checked state
  const currentInput = themeSelectForm.querySelector<HTMLInputElement>(`input[value="${getStoredTheme()}"]`)
  if (currentInput)
    currentInput.checked = true

  // Listen for form changes
  themeSelectForm.addEventListener('change', () => {
    const checkedInput = themeSelectForm.querySelector<HTMLInputElement>('input[name="theme"]:checked')
    if (!checkedInput)
      throw new Error('No selected theme found')

    localStorage.setItem('in2theme', checkedInput.value)
    applyTheme()
  })

  // Handle system theme changes when normal theme is selected
  systemDarkMode.addEventListener('change', () => {
    if (getStoredTheme() === 'normal') {
      applyTheme()
    }
  })
}
