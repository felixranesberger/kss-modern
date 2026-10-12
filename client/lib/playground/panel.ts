/**
 * The playground's props panel: controls generated from a mixin's JSON Schema, inline validation
 * issues and the matching Pug call. Mounted in a shadow root by both hosts, the mixin explorer
 * (`./explorer.ts`) and the standalone page (`../../playground.ts`).
 */
import type { Field, FieldValues, ValueRules } from './fields.ts'
import type { PropIssue } from './runtime.ts'
import { getEmptyValue } from './fields.ts'
import panelStyles from './panel.css?inline'

export interface PropsPanelOptions {
  host: HTMLElement
  name: string
  fields: Field[]
  values: FieldValues
  /** Applies the standalone look and the host-level isolation of the standalone page. */
  isStandalone?: boolean
  onChange: (values: FieldValues) => void
  onReset: () => void
}

export interface PropsPanel {
  shadowRoot: ShadowRoot
  /** The panel's header row; a host appends its own buttons. */
  header: HTMLElement
  /** Rebuild the controls, e.g. after a rebuild changed the schema. */
  setFields: (fields: Field[], values: FieldValues) => void
  /** Show validation issues next to their controls; an empty list clears them. */
  setIssues: (issues: PropIssue[]) => void
  /** A message above the controls, for errors no single prop owns. `null` hides it. */
  setMessage: (message: string | null) => void
  setPugCall: (pugCall: string) => void
  destroy: () => void
}

interface FieldElements {
  /** Every control of the field; for an array one per entry. */
  controls: () => HTMLElement[]
  error: HTMLElement
}

/** Create an element with attributes and children, never parsing markup. */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | boolean | undefined> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false)
      continue
    element.setAttribute(name, value === true ? '' : value)
  }
  element.append(...children)
  return element
}

function toAttribute(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value)
}

/** Label of the empty choice that leaves an optional prop out. */
const UNSET_LABEL = '—'

/** A select over fixed values; with `isOptional` an empty first choice stands for "not passed". */
function createSelect(
  options: (string | number | boolean | null)[],
  value: unknown,
  isOptional: boolean,
  attributes: Record<string, string | boolean | undefined>,
  onValue: (value: unknown) => void,
  signal: AbortSignal,
): HTMLSelectElement {
  const control = createElement('select', { ...attributes, class: 'c-control c-control--select' })
  if (isOptional)
    control.append(createElement('option', { value: '' }, [UNSET_LABEL]))
  for (const option of options)
    control.append(createElement('option', { value: JSON.stringify(option) }, [String(option)]))
  control.value = value === undefined ? (isOptional ? '' : JSON.stringify(options[0])) : JSON.stringify(value)
  control.addEventListener('change', () => onValue(control.value === '' ? undefined : JSON.parse(control.value) as unknown), { signal })
  return control
}

/**
 * One control for one value: a prop, or an entry of an array prop. The schema's constraints become
 * the control's native limits where the platform has them; `./validate.ts` checks all of them.
 * For an optional prop an empty control means "not passed": an empty text or number field, or the
 * empty choice of a select. An optional boolean is a select too, a checkbox has no third state.
 */
function createValueControl(
  rules: ValueRules,
  value: unknown,
  isOptional: boolean,
  attributes: Record<string, string | boolean | undefined>,
  onValue: (value: unknown) => void,
  signal: AbortSignal,
): HTMLInputElement | HTMLSelectElement {
  switch (rules.kind) {
    case 'boolean': {
      if (isOptional)
        return createSelect([true, false], value, true, attributes, onValue, signal)
      const control = createElement('input', { ...attributes, class: 'c-checkbox', type: 'checkbox' })
      control.checked = value === true
      control.addEventListener('change', () => onValue(control.checked), { signal })
      return control
    }
    case 'enum':
      return createSelect(rules.options ?? [], value, isOptional, attributes, onValue, signal)
    case 'number':
    case 'integer': {
      const step = rules.multipleOf ?? (rules.kind === 'integer' ? 1 : undefined)
      const control = createElement('input', {
        ...attributes,
        class: 'c-control',
        type: 'number',
        inputmode: rules.kind === 'integer' ? 'numeric' : 'decimal',
        step: step === undefined ? 'any' : String(step),
        min: toAttribute(rules.minimum ?? rules.exclusiveMinimum),
        max: toAttribute(rules.maximum ?? rules.exclusiveMaximum),
      })
      control.value = typeof value === 'number' ? String(value) : ''
      control.addEventListener('input', () => onValue(Number.isNaN(control.valueAsNumber) ? undefined : control.valueAsNumber), { signal })
      return control
    }
    case 'string': {
      const control = createElement('input', {
        ...attributes,
        class: 'c-control',
        type: 'text',
        inputmode: rules.format === 'email' ? 'email' : rules.format === 'uri' ? 'url' : undefined,
        autocomplete: 'off',
        spellcheck: 'false',
        minlength: toAttribute(rules.minLength),
        maxlength: toAttribute(rules.maxLength),
      })
      control.value = typeof value === 'string' ? value : ''
      control.addEventListener('input', () => onValue(isOptional && control.value === '' ? undefined : control.value), { signal })
      return control
    }
  }
}

export function createPropsPanel(options: PropsPanelOptions): PropsPanel {
  const { host, name, isStandalone = false } = options
  const abortController = new AbortController()
  const { signal } = abortController

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  shadowRoot.replaceChildren()
  if (isStandalone)
    host.setAttribute('data-standalone', '')

  const style = createElement('style', {}, [panelStyles])
  const title = createElement('h2', { class: 'c-panel__title' }, [`Props `, createElement('span', { class: 'c-field__type' }, [`+${name}`])])
  const header = createElement('div', { class: 'c-panel__header' }, [title])
  const message = createElement('p', { class: 'c-panel__message', role: 'alert', hidden: true })
  const form = createElement('form', { 'class': 'c-panel__body', 'novalidate': true, 'aria-label': `Props of ${name}` })
  const pugCall = createElement('code', { class: 'c-panel__call', title: 'Pug call' })
  const resetButton = createElement('button', { class: 'c-button', type: 'button' }, ['Reset'])
  const footer = createElement('div', { class: 'c-panel__footer' }, [pugCall, resetButton])
  const panel = createElement('section', { 'class': 'c-panel', 'aria-label': `Props of ${name}` }, [header, message, form, footer])

  shadowRoot.append(style, panel)

  let fields = options.fields
  let values: FieldValues = structuredClone(options.values)
  let fieldElements = new Map<string, FieldElements>()

  const emitChange = () => options.onChange(structuredClone(values))

  const setValue = (key: string, value: unknown) => {
    values[key] = value
    emitChange()
  }

  const setFieldError = (key: string, text: string | undefined) => {
    const elements = fieldElements.get(key)
    if (!elements)
      return
    elements.error.textContent = text ?? ''
    elements.error.hidden = !text
    elements.controls().forEach(control => control.setAttribute('aria-invalid', String(Boolean(text))))
  }

  /** The list editor of an array prop: one control per entry, add, remove and reorder. */
  const renderList = (field: Field, labelId: string, describedBy: string) => {
    const list = createElement('ol', { class: 'c-list' })
    const addButton = createElement('button', { class: 'c-button', type: 'button' }, ['Add entry'])
    const group = createElement('div', { 'class': 'c-list-editor', 'role': 'group', 'aria-labelledby': labelId, 'aria-describedby': describedBy }, [list, addButton])
    let entryControls: HTMLElement[] = []
    let listController = new AbortController()

    const getEntries = () => (Array.isArray(values[field.key]) ? values[field.key] as unknown[] : [])

    // an optional list left empty is not passed at all
    const setEntries = (entries: unknown[]) => setValue(field.key, field.isOptional && entries.length === 0 ? undefined : entries)

    const renderEntries = (focusIndex?: number) => {
      const replaceEntries = (entries: unknown[], nextFocusIndex?: number) => {
        setEntries(entries)
        renderEntries(nextFocusIndex)
      }

      listController.abort()
      listController = new AbortController()
      const entries = getEntries()

      entryControls = []
      list.replaceChildren(...entries.map((entry, index) => {
        const control = createValueControl(
          field.items!,
          entry,
          false,
          { 'aria-label': `${field.key} entry ${index + 1}` },
          (value) => {
            const next = [...getEntries()]
            next[index] = value
            setEntries(next)
          },
          listController.signal,
        )
        entryControls.push(control)

        const move = (offset: number) => {
          const next = [...getEntries()]
          const [moved] = next.splice(index, 1)
          next.splice(index + offset, 0, moved)
          replaceEntries(next, index + offset)
        }
        const upButton = createElement('button', { 'class': 'c-button c-button--icon', 'type': 'button', 'aria-label': `Move entry ${index + 1} up`, 'disabled': index === 0 }, ['↑'])
        const downButton = createElement('button', { 'class': 'c-button c-button--icon', 'type': 'button', 'aria-label': `Move entry ${index + 1} down`, 'disabled': index === entries.length - 1 }, ['↓'])
        const removeButton = createElement('button', { 'class': 'c-button c-button--icon', 'type': 'button', 'aria-label': `Remove entry ${index + 1}` }, ['✕'])
        upButton.addEventListener('click', () => move(-1), { signal: listController.signal })
        downButton.addEventListener('click', () => move(1), { signal: listController.signal })
        removeButton.addEventListener('click', () => {
          const next = getEntries().filter((_, entryIndex) => entryIndex !== index)
          replaceEntries(next, Math.min(index, next.length - 1))
        }, { signal: listController.signal })

        const controlCell = field.items!.kind === 'boolean' ? createElement('span', { class: 'c-checkbox-row' }, [control]) : control
        return createElement('li', { class: 'c-list__item' }, [controlCell, upButton, downButton, removeButton])
      }))

      addButton.disabled = field.maxItems !== undefined && entries.length >= field.maxItems
      if (focusIndex !== undefined)
        (entryControls[focusIndex] ?? addButton).focus()
    }

    addButton.addEventListener('click', () => {
      const entries = getEntries()
      setEntries([...entries, getEmptyValue(field.items!)])
      renderEntries(entries.length)
    }, { signal })

    renderEntries()
    return { group, controls: () => [...entryControls, addButton] }
  }

  const renderField = (field: Field, index: number): HTMLElement => {
    const id = `field-${index}`
    const labelId = `${id}-label`
    const helpId = `${id}-help`
    const errorId = `${id}-error`
    const describedBy = [field.description ? helpId : '', errorId].filter(Boolean).join(' ')

    let controlRow: HTMLElement
    let controls: () => HTMLElement[]
    if (field.kind === 'array') {
      const listEditor = renderList(field, labelId, describedBy)
      controlRow = listEditor.group
      controls = listEditor.controls
    }
    else {
      const control = createValueControl(
        field as ValueRules,
        values[field.key],
        field.isOptional,
        { id, 'aria-describedby': describedBy, 'aria-required': String(!field.isOptional) },
        value => setValue(field.key, value),
        signal,
      )
      controlRow = control instanceof HTMLInputElement && control.type === 'checkbox'
        ? createElement('span', { class: 'c-checkbox-row' }, [control])
        : control
      controls = () => [control]
    }

    const label = field.kind === 'array'
      ? createElement('span', { class: 'c-field__label', id: labelId }, [field.key])
      : createElement('label', { class: 'c-field__label', id: labelId, for: id }, [field.key])
    const help = createElement('p', { class: 'c-field__help', id: helpId, hidden: !field.description }, [field.description ?? ''])
    const error = createElement('p', { class: 'c-field__error', id: errorId, hidden: true })
    fieldElements.set(field.key, { controls, error })

    return createElement('div', { 'class': 'c-field', 'data-field': field.key }, [
      label,
      controlRow,
      help,
      error,
    ])
  }

  const renderFields = () => {
    fieldElements = new Map()
    form.replaceChildren(...fields.map(renderField))
  }

  renderFields()

  form.addEventListener('submit', event => event.preventDefault(), { signal })
  resetButton.addEventListener('click', () => options.onReset(), { signal })

  return {
    shadowRoot,
    header,
    setFields: (nextFields, nextValues) => {
      fields = nextFields
      values = structuredClone(nextValues)
      renderFields()
    },
    setIssues: (issues) => {
      const byKey = new Map<string, string[]>()
      const general: string[] = []

      for (const issue of issues) {
        if (!fieldElements.has(issue.key)) {
          general.push(issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message)
          continue
        }
        const nestedPath = issue.path.slice(1)
        const text = nestedPath.length > 0 ? `Entry ${Number(nestedPath[0]) + 1}: ${issue.message}` : issue.message
        byKey.set(issue.key, [...byKey.get(issue.key) ?? [], text])
      }

      for (const key of fieldElements.keys())
        setFieldError(key, byKey.get(key)?.join('\n'))

      message.textContent = general.join('\n')
      message.hidden = general.length === 0
    },
    setMessage: (text) => {
      message.textContent = text ?? ''
      message.hidden = !text
    },
    setPugCall: (text) => {
      pugCall.textContent = text
    },
    destroy: () => {
      abortController.abort()
      shadowRoot.replaceChildren()
    },
  }
}
