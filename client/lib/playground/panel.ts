/**
 * The playground's props panel: controls generated from a mixin's JSON Schema, inline validation
 * issues and the matching Pug call. Mounted in a shadow root by both hosts, the mixin explorer
 * (`./explorer.ts`) and the standalone page (`../../playground.ts`).
 */
import type { EntryRules, Field, FieldValues, RecordRules, ValueRules } from './fields.ts'
import type { PropIssue } from './runtime.ts'
import { getEmptyItem } from './fields.ts'
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

/** A checkbox sits in a row of its own, every other control stands alone. */
function wrapControl(control: HTMLElement): HTMLElement {
  return control instanceof HTMLInputElement && control.type === 'checkbox'
    ? createElement('span', { class: 'c-checkbox-row' }, [control])
    : control
}

/**
 * The fields of one entry of an array of objects, a labelled control per field. An optional field
 * left empty is dropped from the entry, like an optional prop.
 */
function createEntryControls(
  rules: EntryRules,
  entry: unknown,
  idPrefix: string,
  entryLabel: string,
  onEntry: (entry: Record<string, unknown>) => void,
  signal: AbortSignal,
): { element: HTMLElement, controls: HTMLElement[] } {
  let current = typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? { ...entry as Record<string, unknown> } : {}
  const controls: HTMLElement[] = []

  const rows = rules.fields.map((field) => {
    const id = `${idPrefix}-${field.key}`
    const control = createValueControl(
      field as ValueRules,
      current[field.key],
      field.isOptional,
      { id, 'aria-required': String(!field.isOptional) },
      (value) => {
        const next = { ...current }
        if (value === undefined)
          delete next[field.key]
        else
          next[field.key] = value
        current = next
        onEntry(next)
      },
      signal,
    )
    controls.push(control)
    return createElement('div', { class: 'c-entry__field' }, [
      createElement('label', { class: 'c-entry__label', for: id }, [field.key]),
      wrapControl(control),
    ])
  })

  return {
    element: createElement('div', { 'class': 'c-entry', 'role': 'group', 'aria-label': entryLabel }, rows),
    controls,
  }
}

/**
 * The value control of a record entry. With one allowed type it is that type's control; with
 * several (`z.union([z.string(), z.boolean()])`) a select picks `true`, `false` or a typed value,
 * whose text or number field follows it.
 */
function createRecordValueControl(
  rules: RecordRules,
  value: unknown,
  label: string,
  onValue: (value: unknown) => void,
  signal: AbortSignal,
): { element: HTMLElement, controls: HTMLElement[] } {
  if (rules.values.length === 1) {
    const control = createValueControl(rules.values[0], value, false, { 'aria-label': label }, onValue, signal)
    return { element: wrapControl(control), controls: [control] }
  }

  const typed = rules.values.filter(valueRules => valueRules.kind !== 'boolean')
  const hasBoolean = typed.length < rules.values.length
  const choices = [...hasBoolean ? ['true', 'false'] : [], ...typed.map(valueRules => valueRules.kind)]
  const valueType = typeof value
  const currentChoice = valueType === 'boolean'
    ? String(value)
    : (typed.find(valueRules => (valueRules.kind === 'string' ? valueType === 'string' : valueType === 'number'))?.kind ?? choices[0])

  const select = createElement('select', { 'class': 'c-control c-control--select', 'aria-label': `${label} type` })
  for (const choice of choices)
    select.append(createElement('option', { value: choice }, [choice]))
  select.value = currentChoice

  const inputs = new Map(typed.map(valueRules => [valueRules.kind, createValueControl(
    valueRules,
    currentChoice === valueRules.kind ? value : undefined,
    false,
    { 'aria-label': label },
    onValue,
    signal,
  )]))
  const showInput = () => inputs.forEach((input, kind) => input.hidden = select.value !== kind)
  showInput()

  select.addEventListener('change', () => {
    showInput()
    const input = inputs.get(select.value as ValueRules['kind'])
    if (input)
      input.dispatchEvent(new Event('input'))
    else
      onValue(select.value === 'true')
  }, { signal })

  return { element: createElement('span', { class: 'c-record-value' }, [select, ...inputs.values()]), controls: [select, ...inputs.values()] }
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

  /** The list editor of an array prop: one control (or one group of fields) per entry, add, remove and reorder. */
  const renderList = (field: Field, id: string, labelId: string, describedBy: string) => {
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
      const firstControls: HTMLElement[] = []
      list.replaceChildren(...entries.map((entry, index) => {
        const items = field.items!
        const entryLabel = `${field.key} entry ${index + 1}`
        const setEntry = (value: unknown) => {
          const next = [...getEntries()]
          next[index] = value
          setEntries(next)
        }

        let entryCell: HTMLElement
        if (items.kind === 'object') {
          const entryControlSet = createEntryControls(items, entry, `${id}-${index}`, entryLabel, setEntry, listController.signal)
          entryCell = entryControlSet.element
          entryControls.push(...entryControlSet.controls)
          firstControls.push(entryControlSet.controls[0] ?? entryCell)
        }
        else {
          const control = createValueControl(items, entry, false, { 'aria-label': entryLabel }, setEntry, listController.signal)
          entryCell = wrapControl(control)
          entryControls.push(control)
          firstControls.push(control)
        }

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

        return createElement('li', { class: items.kind === 'object' ? 'c-list__item c-list__item--entry' : 'c-list__item' }, [entryCell, upButton, downButton, removeButton])
      }))

      addButton.disabled = field.maxItems !== undefined && entries.length >= field.maxItems
      if (focusIndex !== undefined)
        (firstControls[focusIndex] ?? addButton).focus()
    }

    addButton.addEventListener('click', () => {
      const entries = getEntries()
      setEntries([...entries, getEmptyItem(field.items!)])
      renderEntries(entries.length)
    }, { signal })

    renderEntries()
    return { group, controls: () => [...entryControls, addButton] }
  }

  /**
   * The key-value editor of a record prop. Rows keep their own state, so a key can be empty or
   * repeated while it is typed; the prop holds every row with a key, the last one winning.
   */
  const renderRecord = (field: Field, labelId: string, describedBy: string) => {
    const rules = field.record!
    const list = createElement('ol', { class: 'c-list' })
    const addButton = createElement('button', { class: 'c-button', type: 'button' }, ['Add entry'])
    const group = createElement('div', { 'class': 'c-list-editor', 'role': 'group', 'aria-labelledby': labelId, 'aria-describedby': describedBy }, [list, addButton])
    const current = values[field.key]
    let rows = Object.entries(typeof current === 'object' && current !== null ? current as Record<string, unknown> : {}).map(([key, value]) => ({ key, value }))
    let rowControls: HTMLElement[] = []
    let rowController = new AbortController()

    const emit = () => {
      const map = Object.fromEntries(rows.filter(row => row.key !== '').map(row => [row.key, row.value]))
      setValue(field.key, field.isOptional && Object.keys(map).length === 0 ? undefined : map)
    }

    const renderRows = (focusIndex?: number) => {
      rowController.abort()
      rowController = new AbortController()
      rowControls = []
      const firstControls: HTMLElement[] = []

      list.replaceChildren(...rows.map((row, index) => {
        const keyInput = createElement('input', { 'class': 'c-control', 'type': 'text', 'autocomplete': 'off', 'spellcheck': 'false', 'aria-label': `${field.key} key ${index + 1}`, 'pattern': rules.keyPattern })
        keyInput.value = row.key
        keyInput.addEventListener('input', () => {
          rows[index] = { ...rows[index], key: keyInput.value }
          emit()
        }, { signal: rowController.signal })

        const valueControl = createRecordValueControl(rules, row.value, `${field.key} value ${index + 1}`, (value) => {
          rows[index] = { ...rows[index], value }
          emit()
        }, rowController.signal)

        const removeButton = createElement('button', { 'class': 'c-button c-button--icon', 'type': 'button', 'aria-label': `Remove entry ${index + 1}` }, ['✕'])
        removeButton.addEventListener('click', () => {
          rows = rows.filter((_, rowIndex) => rowIndex !== index)
          emit()
          renderRows(Math.min(index, rows.length - 1))
        }, { signal: rowController.signal })

        rowControls.push(keyInput, ...valueControl.controls)
        firstControls.push(keyInput)
        return createElement('li', { class: 'c-list__item c-list__item--record' }, [keyInput, valueControl.element, removeButton])
      }))

      if (focusIndex !== undefined)
        (firstControls[focusIndex] ?? addButton).focus()
    }

    addButton.addEventListener('click', () => {
      // a map that allows booleans, like HTML attributes, mostly holds flags
      const isFlagMap = rules.values.some(valueRules => valueRules.kind === 'boolean')
      rows = [...rows, { key: '', value: isFlagMap ? true : getEmptyItem(rules.values[0]) }]
      renderRows(rows.length - 1)
    }, { signal })

    renderRows()
    return { group, controls: () => [...rowControls, addButton] }
  }

  const renderField = (field: Field, index: number): HTMLElement => {
    const id = `field-${index}`
    const labelId = `${id}-label`
    const helpId = `${id}-help`
    const errorId = `${id}-error`
    const describedBy = [field.description ? helpId : '', errorId].filter(Boolean).join(' ')

    let controlRow: HTMLElement
    let controls: () => HTMLElement[]
    if (field.kind === 'record') {
      const recordEditor = renderRecord(field, labelId, describedBy)
      controlRow = recordEditor.group
      controls = recordEditor.controls
    }
    else if (field.kind === 'array') {
      const listEditor = renderList(field, id, labelId, describedBy)
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
      controlRow = wrapControl(control)
      controls = () => [control]
    }

    const label = field.kind === 'array' || field.kind === 'record'
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
        const [index, entryKey] = issue.path.slice(1)
        const entryPrefix = index === undefined ? '' : `Entry ${Number(index) + 1}: ${entryKey === undefined ? '' : `${String(entryKey)}: `}`
        const text = `${entryPrefix}${issue.message}`
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
