// Prototyp: paarweise Abdeckung aus den echten Zod-Schemas von hss.de, superRefine als Orakel.
// Liest nur. Rendert jeden Fall im Speicher mit Pug und misst Anzahl, Groesse, Fehler.
// node generate.mjs [--strength 3] [--only molecules/Card] [--verbose]
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

// Path to build/frontend of hss.de, the generator reads its schemas and pug mixins
const FRONTEND = process.env.FRONTEND
if (!FRONTEND) {
  throw new Error('Set FRONTEND to build/frontend of hss.de')
}
const MIXINS = join(FRONTEND, 'src/templates/mixins')
const pug = createRequire(join(FRONTEND, 'package.json'))('pug')
const args = process.argv.slice(2)
const STRENGTH = args.includes('--strength') ? Number(args[args.indexOf('--strength') + 1]) : 2
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const VERBOSE = args.includes('--verbose')
const NO_RENDER = args.includes('--no-render')

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) }
    catch (error) {
      if (!specifier.startsWith('.')) throw error
      return next(`${specifier}.ts`, context)
    }
  },
})

// ---------- Zufall mit Seed ----------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(text) {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

// ---------- Mini-Faker (Ersatz fuer @faker-js/faker im Prototyp) ----------
const WORDS = 'Bildung Forschung Stipendium Gemeinderat Demokratie Zukunft Bayern Europa Dialog Werte Engagement Förderung Seminar Gesellschaft Freiheit Verantwortung'.split(' ')
function fakeFor(seed) {
  const r = rng(seed)
  const pick = list => list[Math.floor(r() * list.length)]
  const words = n => Array.from({ length: n }, () => pick(WORDS)).join(' ')
  return {
    words,
    sentence: () => `${words(3 + Math.floor(r() * 5))}.`,
    html: () => `${words(2)} <b>${pick(WORDS)}</b> & ${words(2)}`,
    int: (min = 1, max = 1000) => min + Math.floor(r() * (max - min + 1)),
    pick,
  }
}

// ---------- Schemas laden ----------
const files = readdirSync(MIXINS, { recursive: true }).map(f => join(MIXINS, f))
const components = new Map()
for (const file of files.filter(f => f.endsWith('.schema.ts'))) {
  const module = await import(pathToFileURL(file).href)
  for (const d of Object.values(module)) {
    if (d?.name && d?.schema) components.set(d.name, d)
  }
}
const ICONS = components.get('atoms/Icon').schema._zod.def.shape.icon._zod.def.entries
const iconNames = Object.values(ICONS)

// ---------- Schema lesen ----------
const def = s => s._zod.def
function describe(s) {
  for (let cur = s; cur; cur = def(cur).innerType) {
    if (cur.description) return cur.description
  }
  return ''
}
function unwrap(s) {
  let optional = false
  let defaultValue
  let cur = s
  for (;;) {
    const d = def(cur)
    if (d.type === 'optional') { optional = true; cur = d.innerType }
    else if (d.type === 'default') { optional = true; defaultValue = d.defaultValue; cur = d.innerType }
    else if (d.type === 'nullable') cur = d.innerType
    else break
  }
  return { inner: cur, optional, defaultValue, hasDefault: defaultValue !== undefined }
}
function checkValue(s, name) {
  for (const c of def(s).checks ?? []) {
    const d = c._zod.def
    if (d.check === name) return d
  }
  return null
}

const ABSENT = '–'
const PRESENT = '+'

// Dimensionen: Enums, Booleans, gesetzt/nicht gesetzt bei Optionalen, Slots.
function collectDims(schema, path = [], parent = -1, dims = []) {
  for (const [key, prop] of Object.entries(def(schema).shape)) {
    const p = [...path, key]
    const { inner, optional, hasDefault, defaultValue } = unwrap(prop)
    const type = def(inner).type
    if (type === 'enum') {
      const values = Object.values(def(inner).entries)
      dims.push({ path: p, parent, values: optional && !hasDefault ? [ABSENT, ...values] : values, defaultValue })
    }
    else if (type === 'boolean') {
      dims.push({ path: p, parent, values: optional && !hasDefault ? [ABSENT, true, false] : [true, false], defaultValue })
    }
    else if (type === 'object') {
      let own = parent
      if (optional) { dims.push({ path: p, parent, values: [ABSENT, PRESENT] }); own = dims.length - 1 }
      collectDims(inner, p, own, dims)
    }
    else if (optional) {
      dims.push({ path: p, parent, values: [ABSENT, PRESENT] })
    }
  }
  return dims
}

// ---------- Fuellwerte ----------
function fill(schema, path, fake, examples, files) {
  const example = path.reduce((o, k) => (o == null ? undefined : o[k]), examples)
  const { inner } = unwrap(schema)
  const d = def(inner)
  const key = path.at(-1)
  const text = describe(schema)
  if (example !== undefined && d.type !== 'object') return typeof example === 'function' ? example(fake) : example
  switch (d.type) {
    case 'string': {
      if (/FileReference/.test(text) || (key === 'src' && path.at(-2) === 'image') || key === 'image') {
        files.push(`/${path.join('/')}`)
        return 'university/2'
      }
      if (!process.env.NO_ICON && /^icon/i.test(key)) return fake.pick(iconNames)
      if (/href|url/i.test(key)) return `https://example.org/${fake.words(1).toLowerCase()}`
      if (/^(id|commandfor|form|name)$/.test(key)) return `id-${fake.int(1, 99)}`
      if (/HTML/.test(text)) return fake.html()
      const min = checkValue(inner, 'min_length')?.minimum ?? 0
      let s = fake.words(2)
      while (s.length < min) s += ` ${fake.words(1)}`
      return s
    }
    case 'number': {
      const gt = checkValue(inner, 'greater_than')
      const lt = checkValue(inner, 'less_than')
      const min = gt ? gt.value + (gt.inclusive ? 0 : 1) : 1
      const max = lt ? lt.value - (lt.inclusive ? 0 : 1) : Math.max(min, 800)
      return fake.int(min, Math.min(max, min + 800))
    }
    case 'boolean': return true
    case 'enum': return Object.values(d.entries)[0]
    case 'literal': return d.values[0]
    case 'array': {
      const min = checkValue(inner, 'min_length')?.minimum ?? 1
      return Array.from({ length: Math.max(2, min) }, (_, i) => fillItem(d.element, [...path, i], fake, examples, files, i))
    }
    case 'record': return { 'data-test': 'value', 'hidden': true }
    case 'union': return fill(d.options[0], path, fake, examples, files)
    case 'object': {
      const out = {}
      for (const [k, s] of Object.entries(d.shape)) {
        if (unwrap(s).optional) continue
        out[k] = fill(s, [...path, k], fake, examples, files)
      }
      return out
    }
    default: throw new Error(`unknown zod type ${d.type} at ${path.join('.')}`)
  }
}
// Array-Elemente: Element 0 mit allen optionalen Feldern, Element 1 nur Pflicht.
function fillItem(schema, path, fake, examples, files, index) {
  const { inner } = unwrap(schema)
  if (def(inner).type !== 'object') return fill(schema, path, fake, examples, files)
  const out = {}
  for (const [k, s] of Object.entries(def(inner).shape)) {
    const u = unwrap(s)
    if (u.optional && (index > 0 || u.hasDefault)) continue
    out[k] = fill(s, [...path, k], fake, examples, files)
  }
  return out
}

function build(component, dims, assignment, caseSeed) {
  const files = []
  const props = {}
  const active = dims.map(() => true)
  dims.forEach((dim, i) => { if (dim.parent >= 0 && (!active[dim.parent] || assignment[dim.parent] === ABSENT)) active[i] = false })
  const byPath = new Map(dims.map((d, i) => [d.path.join('.'), i]))
  const walk = (schema, path, target) => {
    for (const [key, prop] of Object.entries(def(schema).shape)) {
      const p = [...path, key]
      const i = byPath.get(p.join('.'))
      const { inner, optional } = unwrap(prop)
      const fake = fakeFor(hash(`${component.name}|${p.join('.')}|${caseSeed}`))
      if (i !== undefined) {
        const v = assignment[i]
        if (v === ABSENT) continue
        if (v === PRESENT) {
          target[key] = def(inner).type === 'object' ? {} : fill(prop, p, fake, component.examples ?? {}, files)
          if (def(inner).type === 'object') walk(inner, p, target[key])
          continue
        }
        if (v === dims[i].defaultValue) continue
        target[key] = v
        continue
      }
      if (def(inner).type === 'object' && !optional) { target[key] = {}; walk(inner, p, target[key]); continue }
      if (!optional) target[key] = fill(prop, p, fake, component.examples ?? {}, files)
    }
  }
  walk(component.schema, [], props)
  return { props, files, active }
}

// ---------- Abdeckung ----------
function* tuples(n, t, start = 0, prefix = []) {
  if (prefix.length === t) { yield prefix; return }
  for (let i = start; i < n; i++) yield* tuples(n, t, i + 1, [...prefix, i])
}
function ancestors(dims, i) {
  const out = []
  for (let p = dims[i].parent; p >= 0; p = dims[p].parent) out.push(p)
  return out
}

function cover(component, dims, strength) {
  const n = dims.length
  const t = Math.min(strength, n)
  const anc = dims.map((_, i) => ancestors(dims, i))
  const key = (idx, vals) => idx.map((d, k) => `${dims[d].path.join(".")}=${String(vals[k])}`).join(" ")
  const uncovered = new Map()
  for (const idx of tuples(n, t)) {
    const combos = idx.reduce((acc, d) => acc.flatMap(c => dims[d].values.map(v => [...c, v])), [[]])
    for (const vals of combos) {
      // Kind-Werte nur mit gesetztem Elternteil
      const ok = idx.every((d, k) => anc[d].every(a => {
        const pos = idx.indexOf(a)
        return pos < 0 || vals[pos] === PRESENT
      }))
      if (ok) uncovered.set(key(idx, vals), { idx, vals })
    }
  }
  const total = uncovered.size
  const r = rng(hash(component.name))
  const shuffle = list => list.map(v => [r(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1])
  const activeOf = a => {
    const active = dims.map(() => true)
    dims.forEach((d, i) => { if (d.parent >= 0 && (!active[d.parent] || a[d.parent] === ABSENT)) active[i] = false })
    return active
  }
  const newly = (a) => {
    const active = activeOf(a)
    let count = 0
    for (const idx of tuples(n, t)) {
      if (!idx.every(d => active[d])) continue
      if (uncovered.has(key(idx, idx.map(d => a[d])))) count++
    }
    return count
  }
  let parses = 0
  const cost = (a) => {
    parses++
    const { props } = build(component, dims, a, 0)
    const result = component.schema.safeParse(props)
    return result.success ? 0 : result.error.issues.length
  }
  const cases = []
  const unreachable = []
  while (uncovered.size > 0) {
    const [firstKey, target] = uncovered.entries().next().value
    let best = null
    const minimal = dims.map(d => (d.defaultValue !== undefined ? d.defaultValue : d.values.includes(false) && !d.values.includes(ABSENT) ? false : d.values[0]))
    for (let attempt = 0; attempt < 6; attempt++) {
      // Versuch 0 startet beim minimalen Fall, die weiteren zufaellig
      const a = attempt === 0 ? [...minimal] : dims.map(d => d.values[Math.floor(r() * d.values.length)])
      target.idx.forEach((d, k) => { a[d] = target.vals[k] })
      for (const d of target.idx) for (const p of anc[d]) a[p] = PRESENT
      const fixed = new Set([...target.idx, ...target.idx.flatMap(d => anc[d])])
      const free = shuffle([...Array(n).keys()].filter(i => !fixed.has(i)))
      // 1. reparieren: so lange einzelne Werte tauschen, wie die Zahl der Zod-Issues sinkt
      let c = cost(a)
      for (let round = 0; c > 0 && round < 4; round++) {
        for (const d of free) {
          if (c === 0) break
          const keep = a[d]
          for (const v of dims[d].values) {
            if (v === keep) continue
            a[d] = v
            const c2 = cost(a)
            if (c2 < c) { c = c2; break }
            a[d] = keep
          }
        }
      }
      if (c > 0) continue
      // 2. gierig abdecken, aber nur Aenderungen, die den Fall gueltig lassen
      const gain = (d, v) => {
        const keep = a[d]
        a[d] = v
        const active = activeOf(a)
        let g = 0
        if (active[d]) {
          const others = [...Array(n).keys()].filter(i => i !== d && active[i])
          for (const o of tuples(others.length, t - 1)) {
            const idx = [...o.map(i => others[i]), d].sort((x, y) => x - y)
            if (uncovered.has(key(idx, idx.map(i => a[i])))) g++
          }
        }
        a[d] = keep
        return g
      }
      for (const d of free) {
        const current = gain(d, a[d])
        const options = dims[d].values.filter(v => v !== a[d]).map(v => [gain(d, v), v]).filter(([g]) => g > current).sort((x, y) => y[0] - x[0])
        for (const [, v] of options) {
          const keep = a[d]
          a[d] = v
          if (cost(a) === 0) break
          a[d] = keep
        }
      }
      const g = newly(a)
      if (!best || g > best.gain) best = { a: [...a], gain: g }
      if (attempt >= 1) break
    }
    if (!best) {
      unreachable.push(firstKey)
      uncovered.delete(firstKey)
      continue
    }
    const active = activeOf(best.a)
    for (const idx of tuples(n, t)) {
      if (idx.every(d => active[d])) uncovered.delete(key(idx, idx.map(d => best.a[d])))
    }
    cases.push(best.a)
  }
  return { cases, unreachable, total, parses }
}

// ---------- Pug ----------
function findMixin(name) {
  const pattern = new RegExp(`mixin (\\w+)\\(props\\)\\s*\\n\\s*- (?:const p = )?defineComponent\\('${name}'`)
  for (const file of files.filter(f => f.endsWith('.pug'))) {
    const source = readFileSync(file, 'utf8')
    const match = source.match(pattern)
    if (match) return { file, name: match[1], source }
  }
  return null
}
function slotsOf(mixin) {
  // Mixin-Quelltext ab "mixin <name>" bis zum naechsten Top-Level-Mixin
  const start = mixin.source.indexOf(`mixin ${mixin.name}(`)
  const rest = mixin.source.slice(start + 1)
  const end = rest.search(/\nmixin /)
  const body = end < 0 ? rest : rest.slice(0, end)
  if (body.includes('$fragments.collect(block)')) {
    return { named: [...new Set([...body.matchAll(/slots\.(\w+)/g)].map(m => m[1]))], block: false }
  }
  return { named: [], block: /^\s+block\b|block\(\)|\bblock &&|if block/m.test(body) }
}
const pugSchemas = new Map([...components].map(([k, v]) => [k, v.schema]))
function compile(mixin) {
  const source = `include fragment\ninclude ${relative(MIXINS, mixin.file)}\nif slots\n  +${mixin.name}(props)\n    each html, name in slots\n      +fragment(name)\n        | !{html}\nelse if content\n  +${mixin.name}(props)\n    | !{content}\nelse\n  +${mixin.name}(props)\n`
  return pug.compile(source, { filename: join(MIXINS, '__case.pug'), basedir: join(FRONTEND, 'src/templates'), doctype: 'html' })
}
const defineComponent = (name, props) => pugSchemas.get(name).parse(props ?? {})

// ---------- Lauf ----------
let sumCases = 0
let sumBytes = 0
let sumErrors = 0
let sumUnreachable = 0
const rows = []
const t0 = performance.now()
for (const [name, component] of [...components].sort()) {
  if (ONLY && name !== ONLY) continue
  const dims = collectDims(component.schema)
  const mixin = findMixin(name)
  const slots = mixin ? slotsOf(mixin) : { named: [], block: false }
  // Slots als eigene Dimension gesetzt/nicht gesetzt
  const slotDims = [...slots.named.map(s => `slot:${s}`), ...(slots.block ? ['slot:default'] : [])]
  for (const s of slotDims) dims.push({ path: [s], parent: -1, values: [ABSENT, PRESENT], slot: true })
  const start = performance.now()
  const { cases, unreachable, total, parses } = cover(component, dims, STRENGTH)
  const ms = performance.now() - start
  let bytes = 0
  let errors = 0
  const firstErrors = []
  const fn = mixin && !NO_RENDER ? compile(mixin) : null
  cases.forEach((a, index) => {
    const { props, active } = build(component, dims, a, index)
    const named = {}
    let content
    dims.forEach((d, i) => {
      if (!d.slot || a[i] !== PRESENT) return
      if (d.path[0] === 'slot:default') content = '<p>Inhalt</p>'
      else named[d.path[0].slice(5)] = `<p>${d.path[0].slice(5)}</p>`
    })
    if (args.includes('--dump') && index < 4) {
      const id = dims.map((d, i) => (!active[i] || a[i] === ABSENT || a[i] === d.defaultValue ? null : a[i] === PRESENT ? d.path.join('.') : a[i] === true ? d.path.join('.') : `${d.path.join('.')}=${a[i]}`)).filter(Boolean).join(' ')
      console.log(`#${index} ${id}\n   ${JSON.stringify(props)}`)
    }
    if (!fn) return
    try {
      const html = fn({ props, content, slots: Object.keys(named).length ? named : undefined, defineComponent })
      bytes += html.length + JSON.stringify(props).length
    }
    catch (error) {
      errors++
      if (firstErrors.length < 1) firstErrors.push(error.message.replace(/\s+/g, ' ').slice(0, 260))
    }
    void active
  })
  sumCases += cases.length
  sumBytes += bytes
  sumErrors += errors
  sumUnreachable += unreachable.length
  const cartesian = dims.reduce((p, d) => p * d.values.length, 1)
  rows.push({ name, dims: dims.length, cartesian, cases: cases.length, unreachable: unreachable.length, total, errors, kb: Math.round(bytes / 1024), ms: Math.round(ms), parses, firstErrors, unreachableList: unreachable })
}
const elapsed = Math.round(performance.now() - t0)
rows.sort((a, b) => b.cases - a.cases)
console.log(`Staerke ${STRENGTH}: ${rows.length} Komponenten, ${sumCases} Faelle, ${Math.round(sumBytes / 1024)} KB Props+Markup, ${sumErrors} Renderfehler, ${sumUnreachable} unerreichbare Tupel, ${elapsed} ms`)
const counts = rows.map(r => r.cases).sort((a, b) => a - b)
console.log(`Median ${counts[Math.floor(counts.length / 2)]} Faelle, Max ${counts.at(-1)}`)
console.log('name | dims | kartesisch | Faelle | Tupel | unerreichbar | Renderfehler | KB | ms')
for (const r of rows.slice(0, VERBOSE ? rows.length : 15)) {
  console.log(`${r.name} | ${r.dims} | ${r.cartesian.toExponential(1)} | ${r.cases} | ${r.total} | ${r.unreachable} | ${r.errors} | ${r.kb} | ${r.ms}`)
}
const failing = rows.filter(r => r.errors > 0)
if (failing.length) {
  console.log('\nRenderfehler:')
  for (const r of failing) console.log(`- ${r.name}: ${r.errors}x ${r.firstErrors[0]}`)
}
if (ONLY) {
  const r = rows[0]
  console.log('\nUnerreichbar (erste 25):', r.unreachableList.join('; '))
}
