# Konzept: Paarweise Abdeckung mit superRefine als Orakel

Der Generator liegt in [c-generator/generate.mjs](c-generator/generate.mjs). Aufruf mit dem Pfad zu `build/frontend` von hss.de: `FRONTEND=… node generate.mjs`. Er läuft gegen die echten 133 Schemas und rendert jeden Fall im Speicher mit Pug. Sein Typ-Prototyp ist nicht übernommen, der geprüfte liegt in [../prototype/](../prototype/).

## 1. Die Idee

Der Generator liest aus dem Zod-Schema die Stellen, an denen sich das Markup verzweigen kann: Enums, Booleans, gesetzt oder nicht gesetzt bei optionalen Props, Slots. Statt alle Kombinationen auszumultiplizieren, erzeugt er so wenige Fälle, dass jedes Wertepaar zweier Props mindestens einmal vorkommt. `schema.safeParse()` mit allen `superRefine`-Regeln entscheidet, ob ein Fall gültig ist. Paare, die nie gültig werden, meldet der Generator als Liste, und diese Liste ist eine lesbare Fassung der `superRefine`-Regeln. Fake-Texte kommen aus Faker über Namens- und Typregeln in kss-modern, `examples` braucht einen Eintrag nur dort, wo ein fester Wert gewünscht ist oder die Regel falsch rät.

Gemessen an allen 133 Komponenten: 1.424 Fälle, rund 1 MB Props plus Markup, 3,6 Sekunden für Generierung und Pug-Render, 0 Renderfehler.

## 2. So schreibt man eine Komponente

### Die Card

Das Schema bleibt unverändert. Es ändert sich nur `examples`. Ein fester Wert gilt für alle generierten Fälle. Eine Funktion zieht pro Fall einen neuen Fake. Bei Objekten geht beides auch feldweise.

```ts
// molecules/card/card.schema.ts
export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({ /* wie heute */ }).superRefine(/* wie heute */),
  examples: {
    variant: 'tile',
    title: f => f.lorem.sentence({ min: 2, max: 7 }),
    text: f => f.html(),
    cta: { text: 'Read article', href: f => f.internet.url() },
    image: { src: f => f.image('university') },
  },
})
```

`f` ist ohne Import typisiert. Die `.schema.ts` lädt also kein Faker in das Browser-Bundle. `f` ist Faker (Locale `de`) plus Projekt-Helfer wie `f.image()` und `f.icon()`. Der Explorer startet wie heute mit `examples` und wertet Funktionen mit Seed 1 aus. Ein neuer Knopf im Explorer würfelt mit dem nächsten Seed.

Für `roofline`, `href` und `additionalAttributes` steht kein Eintrag da. `href` füllt die Namensregel mit einer URL, `roofline` die Typregel mit Wörtern, `additionalAttributes` der Fake am Fragment.

### Feste Fälle, wenn nötig

Fälle mit konkretem Inhalt (Escaping, Slot-HTML, ein Titel mit `&`) stehen in einer optionalen Datei neben dem Schema. Sie ersetzen die JSON-Dateien in `Tests/Functional/Fixtures/ComponentCases`.

```ts
// molecules/card/card.cases.ts
export default defineCases(card, { full: ['variant', 'image'] }, {
  'teaser without title': {
    props: { variant: 'teaser', text: 'Nur <b>Text</b> & Bild', image: { src: f => f.image() } },
  },
  'title with ampersand': {
    props: { variant: 'news', title: 'Bildung & Forschung' },
  },
})
```

Das zweite Argument steuert die Generierung (Abschnitt 4). Das dritte sind feste Fälle. Dort sind Pflichtangaben Pflicht, jeder Wert darf aber eine Fake-Funktion sein.

### Abruf

```ts
import { fakeProps, testCases } from 'kss-modern/testing'

fakeProps(card)                                              // ein gültiger Fall, Seed 1
fakeProps(card, { seed: 7, with: { variant: 'large', reverse: true } })
testCases(card)                                              // generierte plus feste Fälle
// → [{ id: 'variant=tile border theme=red title titleTag=h6 roofline text image image.loading=eager additionalAttributes',
//      props: {…}, slots: {}, content: undefined, files: ['/image/src'] }, …]
```

`fakeProps` taugt auch für den visuellen Regressionstest oder eine Demo-Seite. `testCases` ist die Quelle für den Markup-Vergleich.

Auf der Kommandozeile:

```bash
make test-components                          # alles, Stärke 2
make test-components C=molecules/Card          # eine Komponente
make test-components C=molecules/Card REPORT=1 # plus Liste der unerreichbaren Paare
```

### Die 134. Komponente

Man schreibt `foo.pug` und `foo.schema.ts` mit dem Zod-Schema. `examples` darf leer bleiben. `make test-components` erzeugt sofort Fälle, rendert sie mit Pug und meldet, dass die Fluid-Komponente fehlt. Eine Fixture-Datei schreibt niemand. Man ergänzt `examples` erst, wenn ein Fake im Explorer unpassend aussieht oder beim Render scheitert. Die Fehlermeldung nennt dann Komponente, Fall-ID, Prop-Pfad und die Regel, aus der der Wert kam, zum Beispiel `organisms/Foo [meta] meta.0.icon aus Regel "string": atoms/Icon: Invalid option`. Eine `.cases.ts` legt man nur an, wenn ein konkreter Inhalt geprüft werden soll.

### Wo welche Information lebt

| Information | Ort | Begründung |
|---|---|---|
| Typen, Pflicht, Abhängigkeiten | Zod-Schema mit `superRefine` | Steht schon da, der Generator nutzt es als Orakel |
| Typischer Wert einer Prop, fest oder Fake | `examples` | Pro Komponente, sichtbar im Explorer |
| Fake eines wiederverwendeten Teils (`image()`, `link`, `additionalAttributes`) | `schema-fragments.ts` über `.register(fakes, …)` | Einmal statt in jeder Komponente |
| Allgemeine Regeln (`href` → URL, FileReference → Bild, `icon*` → Icon-Name, `id` → Slug, Text mit "HTML" in der Beschreibung → Text mit `<b>` und `&`) | kss-modern, erweiterbar in `toolchain.ts` | Gilt für alle Komponenten, deckt die 306 Props ohne Eintrag ab |
| Feste Fälle, Slot-Inhalte, Stärke | `<name>.cases.ts` | Nur Testwissen, gehört nicht ins Explorer-Schema |
| Pug-Markup, Fluid-Markup | nirgends eingecheckt | Wird bei jedem Lauf erzeugt |

Die Fragment-Fakes nutzen das Zod-4-Registry. `z.$input` setzt den Rückgabetyp der Fake-Funktion auf den Eingabetyp des Schemas:

```ts
export const fakes = z.registry<{ fake: (f: Fake) => z.$input }>()

export const link = z.strictObject({ text: z.string().min(1), href: z.string().min(1) })
  .register(fakes, { fake: f => ({ text: f.lorem.words(2), href: f.internet.url() }) })
```

Das ist der einzige Fake am Schema selbst, und er steht in der Fragment-Datei. Die Komponentenschemas bleiben frei davon.

## 3. Die Typen

Kern (`types/component-schema.ts`):

```ts
type Gen<T> = (f: Fake) => T

export type Example<T> = Gen<T> | ExampleShape<T>
type ExampleShape<T> =
  T extends Leaf ? T
    : T extends readonly (infer Item)[] ? readonly Example<Item>[]
      : T extends object ? { [K in keyof T]?: Example<Exclude<T[K], undefined>> }
        : T
export type Examples<Input> = { [K in keyof Input]?: Example<Exclude<Input[K], undefined>> }

export type CaseValue<T> = Gen<T> | CaseShape<T>   // wie oben, aber ohne ? an den Feldern
export type CaseProps<Input> = { [K in keyof Input]: CaseValue<Input[K]> }

export function defineComponent<const Name extends string, Schema extends z.ZodType>(
  definition: { name: Name, schema: Schema, examples?: Examples<z.input<Schema>> },
)

export function defineCases<C extends ComponentDefinition>(
  component: C,
  options: { strength?: 2 | 3, full?: readonly Paths<Input<C>>[], skip?: (props: Input<C>) => boolean },
  cases?: Record<string, { props: CaseProps<Input<C>>, content?: string, slots?: Record<string, string> }>,
)

export interface Fake extends Faker { html(): string }   // Projekte erweitern per declaration merging
```

Es gibt keine generische Hülle um einzelne Werte. Das Schema wird aus `schema` erschlossen, bei `defineCases` aus dem ersten Argument. Alle Callbacks stehen danach im Objektliteral und bekommen ihren Typ aus dem Kontext. Deshalb wird `f` nie `any`. Der Test `f.image('cats')` beweist das, er schlägt nur fehl, weil `f` den Projekt-Helfer kennt.

tsc meldet (alle als `@ts-expect-error` in `types/*.ts`, tsc läuft ohne Fehler durch, und ohne die Marker erscheint jeweils genau der erwartete Fehler):

| Fehler | Ort |
|---|---|
| `titel` statt `title` in examples | `card.schema.ts` |
| `variant: 'kachel'` | `card.schema.ts` |
| `variant: f => f.lorem.word()`, also beliebiger String für ein Enum | `card.schema.ts` |
| `title: f => f.number.int()` | `card.schema.ts` |
| `cta: { txt: 'Read' }`, unbekanntes Feld verschachtelt | `card.schema.ts` |
| `f.lorem.sentance()`, Faker-Methode gibt es nicht | `card.schema.ts` |
| `f.image('cats')`, Thema gibt es nicht | `card.schema.ts` |
| Fall ohne Pflicht-Prop `variant` | `card.cases.ts` |
| Fall mit `cta: { text }` ohne Pflichtfeld `href` | `card.cases.ts` |
| `theme: 'blue'`, `subtitle: 'y'` im Fall | `card.cases.ts` |
| Fake-Funktion mit falschem Rückgabetyp im Fall | `card.cases.ts` |
| `full: ['cta.varaint']`, Pfad gibt es nicht | `card.cases.ts` |
| `skip: p => p.varaint …` | `card.cases.ts` |
| Fragment-Fake mit `tetx` oder ohne Pflichtfeld | `schema-fragments.ts` |
| `fakeProps(card, { with: { variant: 'huge' } })`, Zugriff auf `c.props.subtitle` | `usage.ts` |

In `examples` fehlende Pflichtangaben sind kein Fehler. Das ist Absicht, `examples` ist eine Teilmenge. In festen Fällen sind sie ein Fehler.

Was tsc nicht fängt: ein zusätzliches Feld im Objekt, das eine Fake-Funktion zurückgibt (`cta: f => ({ text, href, extra: 1 })`). TypeScript prüft überzählige Felder im Rückgabewert einer Funktion nicht, auch nicht ohne Union. `strictObject` fängt es zur Laufzeit beim ersten `safeParse` mit Pfad. Feldweise Schreibweise (`cta: { href: f => … }`) wird dagegen voll geprüft und ist deshalb die empfohlene Form.

## 4. Kombinationen

### Dimensionen

Aus dem Schema, ohne Angaben des Entwicklers:

| Schema | Werte |
|---|---|
| `z.enum([...])` mit Default | jeder Enum-Wert |
| `z.enum([...]).optional()` | nicht gesetzt plus jeder Enum-Wert |
| `z.boolean().default(…)` | `true`, `false` |
| `z.boolean().optional()` | nicht gesetzt, `true`, `false` |
| optionaler String, Zahl, Array, Record | nicht gesetzt, gesetzt |
| optionales Objekt | nicht gesetzt, gesetzt, die Felder darin werden eigene Dimensionen, die nur zählen, wenn das Objekt gesetzt ist |
| benannter Slot im Mixin, Default-Slot (`block`) | nicht gesetzt, gesetzt |

Pflicht-Strings und -Zahlen sind keine Dimension. Sie bekommen einen Fake. Freitext erzeugt also keine Fälle, das löst das Problem mit `id`, `name`, `target` aus den gemessenen Fakten. Sie werden nur gesetzt und nicht gesetzt.

### Paarweise statt kartesisch

Jedes Wertepaar zweier Dimensionen kommt in mindestens einem gültigen Fall vor. Fehler im Template hängen fast immer an einer Prop oder am Zusammenspiel von zweien (`variant=large` mit `reverse`, `image` mit `theme`). Das kartesische Produkt prüft zusätzlich Tripel und mehr, die selten etwas Neues zeigen und die Menge sprengen. Wer für eine Komponente mehr will, setzt `strength: 3` oder nennt in `full` Props, die voll ausmultipliziert werden. `full` fasst diese Props zu einer zusammengesetzten Dimension zusammen, die dann paarweise mit allen anderen kombiniert wird.

### Algorithmus

Gierig, wie AETG mit einer Reparaturstufe:

1. Nimm ein noch nicht abgedecktes Paar. Starte beim minimalen Fall (alles optionale weg, Defaults) und setze das Paar.
2. Reparieren: einzelne Werte anderer Dimensionen tauschen, solange die Zahl der Zod-Issues aus `safeParse` sinkt. Die Issue-Zahl dient als Kostenfunktion, `superRefine` liefert damit einen Gradienten.
3. Abdecken: für jede freie Dimension den Wert wählen, der die meisten neuen Paare abdeckt, aber nur, wenn der Fall gültig bleibt.
4. Nach sechs Versuchen ohne gültigen Fall gilt das Paar als unerreichbar.

Die Fake-Werte sind pro Komponente, Prop-Pfad und Fallnummer geseedet. Eine neue Prop ändert also nicht die Texte aller anderen. Die Fallauswahl selbst ist pro Komponente deterministisch. Sie ändert sich nur, wenn sich das Schema ändert.

### Gemessen (Prototyp gegen die echten Schemas)

| | Stärke 2 | Stärke 3 |
|---|---|---|
| Fälle gesamt | 1.424 | 3.372 |
| Median pro Komponente | 6 | 8 |
| Größte Komponente | `layouts/Frame` 110, `molecules/Card` 82 | `molecules/Card` 481 |
| Props plus Pug-Markup | rund 1 MB | rund 2,7 MB |
| Laufzeit Generierung plus Pug | 3,6 s | 64 s (Suche nicht optimiert) |
| Renderfehler | 0 | 0 |

Ausgewählte Komponenten bei Stärke 2:

| Komponente | kartesisch | Fälle | unerreichbare Paare |
|---|---|---|---|
| `atoms/form/Input` | 4,2·10⁷ | 44 | 0 |
| `atoms/Button` | 1,1·10⁷ | 49 | 55 |
| `molecules/Card` | 4,7·10⁶ | 82 | 39 |
| `molecules/Contact` | 4,7·10⁶ | 34 | 6 |
| `organisms/Intro` | 2,0·10⁶ | 52 | 28 |
| `atoms/media/Image` | 9,2·10³ | 37 | 48 |

`atoms/Button` und `atoms/media/Image` bekommen gültige Fälle, weil der Generator nie alle Optionalen gleichzeitig setzt. Die 264 unerreichbaren Paare habe ich für Button, Image, Intro, Contact, Cards und Card durchgesehen. Alle folgen aus `superRefine`, zum Beispiel `type=submit href`, `download` ohne `href`, `reverse` ohne `variant=large`, `image` mit `variant=event`. Ein erster Prototyp ohne Startpunkt beim minimalen Fall meldete bei Button noch falsche Paare wie `variant=secondary href`. Die Reihenfolge Reparieren vor Abdecken hat das behoben.

### Menge im Griff

- Der Standard ist Stärke 2. Die Fallzahl wächst etwa mit dem Produkt der zwei größten Dimensionen, nicht mit der Zahl der Props. `layouts/Frame` hat zwei Enums mit 10 und 11 Werten und landet deshalb bei 110.
- `full` und `strength: 3` gelten pro Komponente. Ab 200 Fällen warnt der Generator mit der Ursache, etwa `full: variant×image ergibt 22 Werte`.
- Ein Nachtlauf kann mit wechselndem Seed laufen. Andere Fake-Texte finden Escaping-Fehler, die der feste Seed nicht trifft.

## 5. Pug gegen Fluid

1. `render-prototype-markup.mjs` (Node-Container) ruft `testCases()` für jede Komponente auf, rendert jeden Fall mit dem einmal kompilierten Mixin und schreibt `Fixtures/Generated/<component>.json`, gitignored. Inhalt pro Fall: `id`, `props`, `content`, `slots`, `files`, `html`. Gesamt rund 1 MB bei Stärke 2. Die bisherigen `ComponentCases`- und `PrototypeMarkup`-Ordner entfallen.
2. PHPUnit lädt die Datei mit einem DataProvider pro Komponente, nicht pro Fall. Ein Test rendert alle Fälle seiner Komponente in einer Schleife. Das kostet 133 × 50 ms Setup plus 1.424 × 1,3 ms, zusammen unter 10 Sekunden.
3. Der Test sammelt alle Abweichungen und schlägt am Ende einmal fehl. Die Meldung zeigt die Zahl der Abweichungen und die ersten drei mit Fall-ID, Props und Diff. Die Normalisierung bleibt wie heute in PHP, damit es sie nur einmal gibt.

Fehlermeldung, Beispiel:

```
molecules/Card: 3 von 84 Fällen weichen ab
#17 variant=large reverse theme=green cta cta.variant=primary image
props: {"variant":"large","reverse":true,…}
- <div class="c-card__cta">
+ <div class="c-card__cta c-card__cta--primary">
Erneut: make test-components C=molecules/Card CASE=17
```

Die Datei mit dem Markup ist ein Zwischenergebnis wie ein Build-Artefakt. Niemand liest oder pflegt sie.

## 6. Bilder, superRefine, Slots

**Bilder.** Erkannt wird ein Bildfeld nach derselben Regel wie im `ComponentDataGenerator`: "FileReference" in der Beschreibung oder `src` eines `image`-Objekts. Der Fake ist `f.image()` und liefert einen placeholder2-Key wie `university/2`. Jeder Fall trägt in `files` die JSON-Pointer dieser Felder, etwa `/image/src`. PHP ersetzt vor dem Render jeden dieser Werte durch `EXT:hss_components/Tests/Functional/Fixtures/cover.jpg`. Die Normalisierung ersetzt URLs in `src`, `srcset` und `data-srcset` durch `IMAGE` und behält die `w`-Deskriptoren. Damit vergleicht der Test Breiten, Ratio-Klassen, `alt`, `loading` und `fetchpriority`. Er vergleicht keine Bild-URLs.

**superRefine.** Es muss nicht in JSON Schema übergehen. Der Generator arbeitet in Node mit dem Zod-Schema und benutzt `safeParse` als Orakel. Zusätzlich prüft er zwei Dinge, die heute niemand merkt: Eine Komponente ohne einen einzigen gültigen Fall ist ein Fehler mit der Zod-Meldung. Ein Enum-Wert, der in keinem gültigen Fall vorkommt, ist ein Fehler, weil er tot ist.

**Weitergereichte Werte, die enger sind.** `organisms/Intro`, `atoms/Button`, `organisms/MainMenuItem` und `organisms/SidebarSection` reichen einen `z.string()` an `atoms/Icon` weiter. Ohne Namensregel bricht der Prototyp bei Button, MainMenuItem und SidebarSection mit 17 Renderfehlern ab. Intro läuft durch, weil `meta` in `examples` echte Icon-Namen hat. Mit der Regel `icon*` → `f.icon()` laufen alle durch. Die saubere Lösung ist im Schema: den Icon-Enum als Fragment exportieren und dort verwenden. Dann braucht es keine Regel, und tsc meldet falsche Icons auch im Prototyp-Code. Der Generator findet solche Stellen von selbst, weil der verschachtelte `defineComponent`-Aufruf im Pug parst.

**Slots.** Sie stehen nicht im Schema, und das bleibt so. Der Generator liest sie aus dem Mixin: `$fragments.collect(block)` plus `slots.<name>` ergibt benannte Slots, `block` den Default-Slot. Der Prototyp findet 3 Komponenten mit benannten Slots und 65 mit Default-Slot. Jeder Slot wird eine Dimension gesetzt oder nicht gesetzt mit dem Inhalt `<p data-slot="name">name</p>`. So prüft der Test auch die `f:if`-Zweige um leere Slots. Echte Slot-Inhalte stehen in `.cases.ts`. Ein Slot-Name dort, den das Mixin nicht kennt, ist ein Laufzeitfehler.

## 7. Schwächen

- Paarweise ist nicht "alle Kombinationen". Ein Fehler, der nur bei drei bestimmten Werten zusammen auftritt, rutscht durch, solange niemand `strength: 3` oder `full` setzt. Das ist der Preis für 1.424 statt Millionen Fälle.
- Unerreichbar heißt "in sechs Versuchen nicht gefunden". Für die durchgesehenen Komponenten stimmt die Liste. Bei verschachtelten Regeln kann die lokale Suche ein mögliches Paar übersehen. Der Report macht das sichtbar, prüft es aber nicht.
- Die Fallauswahl ist bei jedem Schema-Umbau eine andere. Fall #17 von gestern ist heute ein anderer Fall. Für die Fehlersuche reicht die ID aus den Werten, als stabile Referenz taugt die Nummer nicht.
- Arrays bekommen zwei Elemente, eines mit allen optionalen Feldern, eines nur mit Pflichtfeldern. Kombinationen innerhalb von Array-Elementen deckt das nicht ab.
- Freie Strings werden nicht variiert. Leer gegen gefüllt bei `alt` oder sehr lange Titel prüft nur, wer das in `.cases.ts` schreibt.
- Namensregeln raten. `icon*` → Icon-Name ist bequem, verdeckt aber das eigentliche Problem im Schema. Ich würde jede Regel, die eine Typlücke überbrückt, nach dem Schema-Fix wieder entfernen.
- `f` hat zwei Quellen: Faker und Projekt-Helfer per declaration merging. Laufzeit-Registrierung und Typ müssen zusammenpassen. Ein `defineFakeHelpers()`, dessen Rückgabetyp die Erweiterung speist, hält das an einer Stelle.
- Zusätzliche Felder im Rückgabewert einer Fake-Funktion sind kein Typfehler (Abschnitt 3).
- Stärke 3 ist mit dem Prototyp-Algorithmus zu langsam für jeden Lauf (64 s, Button allein 23 s). Für den Nachtlauf reicht das, für `make test-components` nicht.
- Der Explorer startet mit allen Einträgen aus `examples`. Wer dort viele Fakes einträgt, bekommt einen vollen Startzustand. Deshalb sollen die allgemeinen Regeln das meiste tragen und `examples` klein bleiben.
- Die Testdaten des Prototyps kommen aus einem Mini-Faker mit festen Wortlisten. Echte Laufzeiten mit `@faker-js/faker` habe ich nicht gemessen.

## Änderungen in kss-modern

- `lib/component-schema.ts`: `Fake`, `Example`, `Examples`, `defineCases`, Registry `fakes`. Faker wird optionale Peer-Abhängigkeit, die `.schema.ts` importiert ihn nie.
- Neues Modul `kss-modern/testing` (nur Node): Dimensionen lesen, paarweise Abdeckung, Fake-Regeln, `fakeProps`, `testCases`, Slot-Erkennung aus dem Pug-Mixin.
- `lib/mixins/schema.ts`: Funktionen in `examples` vor dem JSON-Schema-Export mit Seed 1 auswerten.
- Explorer: Knopf zum Neu-Würfeln und eine Auswahl der generierten Fälle. Dann sind die Testfälle im Styleguide auch als Matrix ansehbar.
