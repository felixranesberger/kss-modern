import { createFormSwitcher } from './form-switcher.ts'

const EDITOR_CLASSES = {
  phpstorm: 'editor-phpstorm',
  vscode: 'editor-vscode',
} as const

export default (editorSelectForm: HTMLFormElement) => {
  createFormSwitcher({
    form: editorSelectForm,
    localStorageKey: 'in2editor',
    classMap: EDITOR_CLASSES,
    inputName: 'editor',
    defaultValue: 'phpstorm',
    applyValue: (_value, className, classMap) => {
      Object.values(classMap).forEach(cls => document.body.classList.remove(cls))
      document.body.classList.add(className)
    },
  })
}
