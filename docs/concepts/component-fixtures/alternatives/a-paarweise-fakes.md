# Konzept: Paarweise Testfälle aus Schema und examples

Der Prototyp dieses Entwurfs ist nicht ins Repository übernommen. Der geprüfte Typ-Prototyp liegt in [../prototype/](../prototype/).

## 1. Die Idee

`examples` wird vollständig und typgeprüft. Jede Prop, deren Wert sich nicht aus dem Typ ergibt, steht dort, als fester Wert oder als Fake (`fake.sentence()`, `fake.image()`). Enums, Booleans und gesetzt/nicht gesetzt leitet der Generator aus dem Zod-Schema ab und deckt sie paarweise ab. Das heißt, jede Kombination aus zwei Werten kommt in mindestens einem Fall vor. Ob ein Fall gültig ist, entscheidet `schema.safeParse` samt `superRefine`. Ungültige Kandidaten repariert der Generator anhand der Pfade in den Zod-Issues. So bleiben pro Komponente einige Dutzend Fälle übrig statt Millionen, und die Fixtures sind klein genug, um sie wie heute als Markup zu schreiben.

## 2. So schreibt ein Entwickler eine Komponente

Das Schema bleibt unverändert. Neu sind nur die Werte in `examples` und optional `slots`, `cases` und `strength`.

```ts
import { defineComponent } from 'kss-modern/schema';
import { fake } from 'kss-modern/fake';

export const card = defineComponent({
  name: 'molecules/Card',
  schema: z.strictObject({ /* unverändert, siehe card.schema.ts */ }).superRefine(/* unverändert */),
  examples: {
    variant: 'tile',                           // Enum, nur Startwert im Explorer
    title: 'Scholarship: Young Journalists',   // fester Wert, steht so in jedem Fall
    href: fake.url(),
    roofline: fake.words(2),
    text: fake.html(),                         // Inline-HTML mit Entity und Umlaut
    cta: { text: fake.words(2), href: fake.url() },
    image: { src: fake.image(), alt: fake.text() },
  },
  cases: {
    'teaser without title, image on the right': {
      props: { variant: 'teaser', title: undefined, image: { src: 'university/5' } },
    },
  },
});
```

Die Regel für `examples` ist einfach. Pflicht ist jede Prop mit freiem String, Zahl, Liste oder Objekt, egal ob sie im Schema optional ist. Enums, Booleans, Props mit Default und Records (`additionalAttributes`) dürfen fehlen. Bei Card fehlten bisher `href`, `roofline`, `cta` und `image`. Mit dem neuen Typ sind das Compilerfehler, und die 306 Lücken aus der Messung werden sichtbar.

Ein Fake ist ein Wert, der pro Testfall neu entsteht. Er ist deterministisch, der Seed ergibt sich aus Fall-Id und Prop-Pfad. Die Toolbox ist klein: `words`, `sentence`, `paragraph`, `html`, `text` (Zeichen, die escaped werden müssen), `name`, `url`, `email`, `date`, `id`, `int`, `image`, `oneOf([...])` und `with(faker => ...)` für alles andere. `fake.oneOf` ist auch die Antwort für Strings, die an ein Enum weitergehen, etwa Icon-Namen. Es gibt keine Operatoren und keine Sondersyntax. Ein Fake ist ein Funktionsaufruf, der einen getypten Wert liefert.

Beispiele anderer Komponenten lassen sich wiederverwenden, weil `examples` jetzt ein vollständiger Typ ist. `eventStatus: eventStatus.examples` in Intro wird typgeprüft.

### Abruf

```ts
import { fakeProps, testCases } from 'kss-modern/cases';

fakeProps(card);                                    // ein gültiger, voll befüllter Satz Props
fakeProps(card, { variant: 'large', reverse: true }); // Überschreibungen typgeprüft, auch als Fake
fakeProps(card, {}, { seed: 7 });                   // andere Texte

const cases = testCases(card);                      // 96 Fälle
cases.report;                                       // { dimensions, cases, impossible, unreachable }
testCases(card, { strength: 3 });                   // alle Tripel, z. B. nachts
```

Ein Testfall sieht so aus:

```ts
{
  id: 'f3231f34',                 // Hash der Dimensionen, stabil solange das Schema gleich bleibt
  name: 'variant=large reverse',  // nur was vom Minimalfall abweicht
  stage: 'single',                // minimal, single, pair, triple, fixed
  props: { variant: 'large', reverse: true, title: 'Scholarship: Young Journalists', … },
  slots: {},
  files: ['image.src'],           // Pfade, die aus fake.image() kommen
}
```

Der Name ist die Diagnose. Fällt `variant=large reverse` durch, liegt es an diesen zwei Werten. Weil die Einzelfälle vor den Paarfällen kommen, zeigt der erste rote Fall meist direkt auf die Ursache.

## 3. Die Typen

Kern ist `Examples<z.input<S>, z.output<S>>` in `kss/component.ts`. Aus dem Vergleich von Input und Output erkennt der Typ Defaults (im Input optional, im Output nicht). Daraus entstehen Pflicht- und optionale Schlüssel. Jeder Wert darf `T`, `Fake<T>` oder bei Objekten und Listen die Struktur mit Fakes darin sein. `Fake<out T>` ist kovariant. `Fake<'arrow'>` passt also auf `string`, `Fake<string>` aber nicht auf ein Enum. `defineComponent` setzt `NoInfer` auf `examples` und `cases`, damit das Schema allein den Typ bestimmt.

Geprüft mit tsc 6.0.3 gegen Zod 4.6 in `type-tests.ts`. Jede Zeile mit `@ts-expect-error` erzeugt den erwarteten Fehler, sonst würde tsc die Direktive als unbenutzt melden. Abgefangen werden:

| Fehler | Meldung von tsc |
|---|---|
| optionaler freier String fehlt in examples | `Property 'note' is missing` |
| Pflichtfeld im verschachtelten Objekt fehlt | `{ text: string }` nicht zuweisbar an `ExampleValue<{ text, href, … }>` |
| unbekannte Prop, auch verschachtelt | `Object literal may only specify known properties` |
| String statt Zahl | `'string' is not assignable to 'ExampleValue<number>'` |
| falscher Fake-Typ (`fake.words()` für eine Zahl) | `Fake<string>` nicht zuweisbar |
| freier Fake auf ein Enum | `Fake<string>` nicht zuweisbar an das Enum |
| `fake.oneOf` mit Wert außerhalb des Enums | `Fake<"arrow" \| "pin">` nicht zuweisbar |
| falscher Enum-Wert | `'"c"' is not assignable` |
| Listenelement ohne Pflichtfeld | `{ icon: string }` nicht zuweisbar |
| Slot, den die Komponente nicht deklariert | `'filter' does not exist in type { default?: string }` |
| falscher Wert in `cases` und in `fakeProps(…)` | wie oben |
| `fake.with` mit falschem Rückgabetyp | `Fake<number>` nicht zuweisbar an string |

Die Kontext-Falle aus dem Auftrag tritt nicht auf. `fake.with(f => …)` hat einen fest deklarierten Parametertyp, der nicht vom Schema abhängt. `f` ist immer `Faker`, `f.person.nickname()` ist ein Fehler. Alle übrigen Fakes sind Aufrufe ohne Callback. Der Abruf `testCases(card)` liefert `props` als `z.input` des Schemas und `slots` nur mit den deklarierten Namen.

## 4. Wie Kombinationen entstehen

Der Generator zerlegt das Schema in Dimensionen:

- Enum: alle Werte, bei optional ohne Default zusätzlich nicht gesetzt.
- Boolean: `false`, `true`, bei optional ohne Default zusätzlich nicht gesetzt.
- Optionale Prop mit Wert (String, Objekt, Liste, Record): gesetzt oder nicht gesetzt. Der Wert selbst ist keine Dimension. Er kommt aus examples.
- Verschachtelte Dimensionen wie `cta.variant` zählen nur, wenn `cta` gesetzt ist.
- Bei Listen von Objekten variieren die Enums und Optionen der Einträge gemeinsam (`meta[].icon`).
- Jeder deklarierte Slot: gefüllt oder leer.

Die Abdeckung läuft in drei Stufen. Zuerst ein Minimalfall mit allen Defaults und ohne optionale Props. Dann jeder Wert einzeln gegen den Minimalfall. Dann gierig so lange neue Fälle, bis jedes Paar aus zwei Dimensionswerten vorkommt. Jeder Kandidat geht durch `safeParse`. Ist er ungültig, ändert ein Bergsteiger-Verfahren schrittweise einzelne Dimensionen, bevorzugt die, die in den Zod-Issues stehen. Die Dimensionen, um die es gerade geht, bleiben dabei gesperrt.

Gemessen mit dem Prototyp (`node run.ts`):

| Komponente | volles Produkt (Messung) | Einzelwerte | Paare | Tripel |
|---|---|---|---|---|
| molecules/Card | 1,2 Mio. (298.000 gültig) | 35 | 96 | nicht gemessen |
| atoms/Button | 10,6 Mio. | 28 | 57 | nicht gemessen |
| atoms/media/Image | kein gültiger Fall ohne Kombination | 16 | 40 | nicht gemessen |
| atoms/form/Input | 41,8 Mio. | 38 | 64 | 267 |

Button und Image haben gültige Fälle für beide Zweige (`image` und `srcset`, Link und Button), weil die Reparatur die Gegenseite mitzieht. Bei Card erkennt der Generator 39 unmögliche Paare, etwa `variant=tile & reverse` oder `variant=large & -title`. Das sind genau die Regeln aus `superRefine`. Sie stehen im Report. Ein Wert, der in keinem gültigen Fall vorkommen kann, steht unter `unreachable` und ist ein Fehler. Das fängt Widersprüche zwischen Schema und superRefine und Beispiele, die superRefine verletzen.

Die Menge bleibt über `strength` steuerbar. Standard ist 2. Komponenten mit wenigen Dimensionen können 3 bekommen, ein nächtlicher Lauf kann alles mit 3 prüfen. Bei 133 Komponenten mit Median 8 Kombinationen schätze ich insgesamt 3.000 bis 5.000 Fälle bei Paaren. Das ist eine Schätzung, gemessen habe ich nur die vier Komponenten oben.

## 5. Pug und Fluid vergleichen

Bei einigen tausend Fällen lohnt kein Trick. Der bestehende Ablauf bleibt, nur die Quelle und das Format ändern sich.

1. `render-prototype-markup.mjs` lädt jede `.schema.ts`, ruft `testCases(definition)` auf und rendert jeden Fall mit dem einmal kompilierten Mixin (ca. 0,02 ms pro Fall). Die handgeschriebenen JSON-Dateien laufen in der Übergangszeit weiter mit. Später wandern sie nach `cases` in die Schema-Datei.
2. Es schreibt pro Komponente eine Zeile pro Fall nach `Fixtures/PrototypeMarkup/<component>.ndjson`: `{id, name, stage, props, slots, files, html}`. Die Props stehen mit drin, damit PHP nichts selbst generieren muss. Bei geschätzt 4.000 Fällen mit je 1 bis 3 KB sind das 5 bis 10 MB, gitignored.
3. PHPUnit bekommt einen Test pro Komponente statt einen pro Fall. Der DataProvider liefert die 133 Komponenten. Im Test laufen alle Fälle in einer Schleife durch `ComponentView`. Das kostet 133 × 50 ms Setup plus 4.000 × 1,3 ms Rendern, zusammen etwa 12 Sekunden. Ein Test pro Fall läge bei über 200 Sekunden.
4. Der Test sammelt alle Abweichungen einer Komponente und meldet sie zusammen, sortiert nach Stufe. Die Meldung nennt Fall-Name und Id und zeigt den Diff der ersten drei Fälle. Die Normalisierung bleibt in PHP und gilt für beide Seiten wie heute.
5. Für die Fehlersuche gibt es `npm run component-case -- molecules/Card f3231f34`. Das gibt Props und Pug-Markup eines Falls aus, und den Fall kann man direkt im Explorer öffnen.

Wer mehr Fälle will, etwa nachts mit `strength: 3`, kann statt `html` einen Hash des normalisierten Markups schreiben. Dann muss die Normalisierung aber in JS und PHP gleich sein. Das lässt sich mit einer gemeinsamen Regel-Datei (`normalize-rules.json`, Muster und Ersetzung) lösen. Für den Standardlauf braucht es das nicht.

## 6. Bilder, superRefine, Slots

**Bilder.** `fake.image()` liefert im Prototyp einen placeholder2-Key. Der Generator merkt sich, an welchen Pfaden ein Bild-Fake steht (`files: ['image.src']`). PHP ersetzt genau diese Werte vor dem Rendern durch `EXT:hss_components/Tests/Functional/Fixtures/cover.jpg`. Die Data-Klassen nehmen dort schon einen Pfad an. Damit braucht es keine Erkennung über die Beschreibung "FileReference" mehr. Die Normalisierung maskiert die Werte von `src`, `srcset` und `data-srcset` an `img` und `source` auf beiden Seiten. Verglichen werden weiter Tags, Klassen, `width`, `height`, `sizes`, `loading` und `alt`. Die URLs selbst prüft der Test nicht mehr. Das ist heute auch so, nur dass Bild-Fälle bisher ganz fehlen.

**superRefine.** Es wird nicht übersetzt und nicht nachgebaut. `safeParse` ist das Orakel, die Issue-Pfade sind die Hinweise für die Reparatur. Deshalb funktioniert es für alle 25 Schemas mit `superRefine` ohne Zusatzarbeit. Der Report macht die Regeln sichtbar (`impossible`) und meldet Widersprüche (`unreachable`). Fluid bekommt nur gültige Props. Negativtests für `ComponentDataException` sind nicht Teil dieses Konzepts.

**String an ein Enum (Intro → Icon).** `fake.oneOf(['calendar-days', 'map-pin'])` in examples löst den konkreten Fall. Sauberer ist es, im Schema von Intro den Enum von Icon zu übernehmen (`icon: iconName.optional()`). Dann prüft tsc auch den Wert in examples. Rendert Pug einen Fall nicht, nennt das Render-Skript Komponente, Fall-Id und Prop-Pfad.

**Slots.** `defineComponent` bekommt eine Liste `slots: ['default', 'filter']`. Das ist der einzige Ort, an dem Slots maschinenlesbar stehen. Jeder Slot ist eine Dimension (gefüllt oder leer), gefüllt mit `<p data-slot="filter">Slot filter</p>`. Das Render-Skript prüft, dass jeder deklarierte Slot im Mixin als `+fragment('filter')` vorkommt. PHP prüft dasselbe für die `fc:param type="Slot"`. Slot-Inhalt, auf den das Markup reagiert (Cards erwartet `article.c-card`), gehört in einen festen Fall unter `cases`.

**Explorer.** Weil examples jetzt Fakes enthält, löst der JSON-Schema-Export in `lib/mixins/schema.ts` sie mit Seed 0 auf. Der Explorer startet besser mit dem Minimalfall. Ein Auswahlfeld "Testfälle" lädt jeden generierten Fall. Damit sieht man im Styleguide genau, was getestet wird.

## 7. Schwächen

- Paarweise Abdeckung findet keinen Fehler, der erst bei drei bestimmten Werten zusammen auftritt. Ein Beispiel wäre `variant=large & reverse & image`. Der Einzelfall `variant=large reverse` hat kein Bild, und ob ein Paarfall alle drei trifft, ist Zufall. Abhilfe ist `strength: 3` pro Komponente oder ein fester Fall.
- examples wird deutlich länger. Bei Button stehen jetzt `id`, `name`, `form`, `target` und weitere drin. Die 306 fehlenden Einträge müssen einmal nachgetragen werden. Das ist Handarbeit.
- Freie Werte sind keine Dimension. Ein Mixin, das bei `target: '_blank'` anders rendert als bei `'_self'`, wird nur mit dem einen Wert aus examples getestet. `fake.oneOf` würfelt pro Fall, deckt aber nicht systematisch ab.
- Der Generator ist im Prototyp langsam. Button braucht für die Paare 11 Sekunden, weil jedes unmögliche Paar mit sechs Neustarts gesucht wird. Für 133 Komponenten muss das schneller werden, etwa durch Cache über einen Hash von Schema und examples und einen besseren Paar-Index. Die Ergebnisse sind deterministisch, ein Cache ist also unproblematisch.
- Ändert sich das Schema (ein Enum-Wert mehr), verteilt die gierige Suche die Paarfälle neu. Ids einzelner Zeilen bleiben stabil, die Menge der Fälle nicht. Das stört nur, wer sich Ids notiert hat.
- Der Generator liest Zod-Interna (`_zod.def`). Die sind in Zod 4 für Bibliotheken gedacht, aber kein stabiles API wie `z.toJSONSchema`. `z.union` und `z.discriminatedUnion` behandelt der Prototyp nicht, dafür bräuchte es eine Dimension pro Zweig.
- Records bekommen ihren Wert nur aus `.meta({ examples })` am Fragment. Das ist der einzige Fake-nahe Wert, der am Schema steht. Ohne meta-Beispiel bleibt ein Record immer leer.
- Listen variieren nur gesetzt oder nicht gesetzt. Länge 1 gegen Länge 5 testet der Generator nicht.
- Ein Test pro Komponente macht die ganze Komponente rot, wenn ein Fall abweicht. Die Meldung listet alle Fälle, PHPUnit zählt aber nur einen Fehler.
- Das Maskieren der Bild-URLs heißt, dass Unterschiede bei Crop und Breiten der Kandidaten unentdeckt bleiben.

## Dateien im Prototyp

| Datei | Inhalt |
|---|---|
| `kss/component.ts` | `defineComponent`, `Examples`-Typ, `PropsOverride`, `FixedCase` |
| `kss/fake.ts` | `Fake<T>`, Toolbox `fake`, Faker-Ersatz mit gleicher Form |
| `kss/cases.ts` | Schema-Zerlegung, Reparatur, Abdeckung, `testCases`, `fakeProps` |
| `components/*.schema.ts` | Card, Button, Image, Input mit neuen examples |
| `type-tests.ts` | 18 erwartete Typfehler und vier gültige Aufrufe |
| `run.ts` | Fallzahlen, Laufzeit, Beispielausgabe (`node run.ts --verbose`) |

Prüfen: `cd` in den Ordner, `./node_modules/.bin/tsc -p .` und `node run.ts --verbose`. `node_modules` ist ein Symlink auf styleguide-rewrite.
