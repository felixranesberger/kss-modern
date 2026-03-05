interface FormSwitcherOptions<T extends Record<string, string>> {
  form: HTMLFormElement
  localStorageKey: string
  classMap: T
  inputName: string
  defaultValue: keyof T & string
  applyValue: (value: keyof T & string, className: string, classMap: T) => void
  onFormChange?: () => void
}

export function createFormSwitcher<T extends Record<string, string>>(options: FormSwitcherOptions<T>) {
  const { form, localStorageKey, classMap, inputName, defaultValue, applyValue, onFormChange } = options

  function getStoredValue(): keyof T & string {
    const stored = localStorage.getItem(localStorageKey)
    if (!stored) {
      localStorage.setItem(localStorageKey, defaultValue)
      return defaultValue
    }
    return stored as keyof T & string
  }

  function apply() {
    let current = getStoredValue()
    if (!classMap[current]) {
      current = defaultValue
      localStorage.setItem(localStorageKey, current)
    }
    applyValue(current, classMap[current], classMap)
  }

  // Initial apply
  apply()

  // Restore the form's checked state
  const currentInput = form.querySelector<HTMLInputElement>(`input[value="${getStoredValue()}"]`)
  if (currentInput)
    currentInput.checked = true

  // Listen for form changes
  form.addEventListener('change', () => {
    const checkedInput = form.querySelector<HTMLInputElement>(`input[name="${inputName}"]:checked`)
    if (!checkedInput)
      throw new Error(`No checked input found for "${inputName}"`)

    localStorage.setItem(localStorageKey, checkedInput.value)
    apply()
    onFormChange?.()
  })

  return { apply, getStoredValue }
}
