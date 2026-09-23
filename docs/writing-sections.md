# Writing sections

A section is one KSS comment block. It has a title, an optional description, optional properties and a `Styleguide` reference that places it in the navigation.

```css
/*
Alert

Inline feedback that stays until the problem is solved.

Status: Complete

.alert--success - Success, the action worked
.alert--danger - Danger, something failed

Markup: <div class="alert {{modifier_class}}" role="status">Your export is ready</div>

Styleguide 3.3
*/
```

## How a comment is read

kss-modern splits every comment into paragraphs at blank lines. This is the one rule to keep in mind:

- The **first paragraph** is the title.
- A paragraph that starts with a **property name and a colon** (`Markup:`, `Status:`, …) is that property. A property can span several lines, but it ends at the next blank line. Property names are case-insensitive.
- The paragraph that starts with **`Styleguide`** is the reference.
- If the **last remaining paragraph** consists of `.class - Description` lines, those are the modifiers.
- Everything else is the description.

Block comments (`/* */` and `/** */`) and runs of `//` line comments both work. Leading `*` characters on each line are stripped.

kss-modern scans all `.css` and `.scss` files below `contentDir`. Comments without a `Styleguide` reference are ignored, so regular code comments stay out of the styleguide.

## References and hierarchy

The reference is a dotted number. Its depth decides where the section appears.

| Reference | Level | Appears as |
|---|---|---|
| `Styleguide 3` | first | a category in the sidebar |
| `Styleguide 3.1` | second | a page in that category |
| `Styleguide 3.1.2` | third | a subsection on that page |
| `Styleguide 3.1.2.1` | deeper | a smaller subsection on the same page |

`Styleguide: 3.1` and `Style guide 3.1` are accepted as well. Every section needs its parent to exist, so declare the categories once, for example in your main stylesheet.

Sections are ordered numerically on every level, so `3.2` comes before `3.10`. Use `Weight:` to change the order among siblings. Lower weights come first:

```css
/*
Typography

Weight: 10

Styleguide 1.2
*/
```

Two sections with the same reference overwrite each other. The build reports the affected ids in `errors.overwrittenSectionsIds`.

## Descriptions and Markdown

A plain description is rendered as a paragraph. Start it with `Markdown:` to write Markdown instead:

```css
/*
Card

Markdown: A flexible card for one project.

## Anatomy
- **Media** with an optional badge
- **Body** with title and text

Styleguide 3.1
*/
```

Longer documentation reads better in its own file. When the text after `Markdown:` is a path ending in `.md`, kss-modern loads that file, relative to `contentDir`:

```css
/*
Buttons

Markdown: css/02-elements/buttons.md

Styleguide 2.1
*/
```

Headings are shifted so they sit below the section title. Long Markdown descriptions are folded behind a **Show more** button.

### Code blocks

Fenced code blocks are highlighted for `html`, `css`, `scss`, `js`, `ts`, `bash` and `markdown`. Other languages are shown as plain text.

### Alerts and accordions

Two block components are available inside Markdown:

```markdown
:::alert{type="warning" title="Breaking change"}
The `size` prop was renamed to `scale` in 2.0.
:::

:::accordion{title="Implementation notes" open=true}
The component uses CSS grid for its layout.
:::
```

Alerts accept `type="info"`, `"warning"` and `"error"`, with `info` as the default. The title is optional. Accordions are closed unless you pass `open=true`.

## Properties

### Markup

`Markup:` gives the section a live preview. It accepts inline HTML, a path to a `.html` file or a path to a `.pug` template. [Markup and templates](markup.md) covers all three, plus composition with `<insert-markup>`.

### Modifiers

List the variants of a component in their own paragraph after the description, one per line. Properties can come before or after it:

```css
.btn--secondary - Secondary, for the second most important action
.btn--ghost - Ghost, for toolbars and dense layouts
.btn--sm - Small size
```

Put `{{modifier_class}}` into the markup where the class belongs. kss-modern renders the base preview without a class and one extra preview per modifier. Visitors can copy each class with one click.

A section with modifiers but without `Markup:` shows no previews.

### Status

`Status:` adds a colored dot next to the page in the sidebar:

| Value | Meaning |
|---|---|
| `Complete` | ready to use |
| `In Progress` or `Progress` | being built |
| `Awaits Feedback` or `Feedback` | waiting for review |
| `Pending` | not started |

### Colors

`Colors:` renders a palette of swatches. Clicking a swatch copies its value.

```css
/*
Brand

Colors:
brand-50: #ecfdf3
brand-600: #039855
accent: hsl(28deg 90% 55%) - Highlights and badges

Styleguide 1.1.1
*/
```

Each line is `name: value` with an optional ` - description`. Values can be hex colors, `rgb()`, `rgba()`, `hsl()`, `hsla()`, named colors or `var(--token)`.

The swatches are drawn in the styleguide UI, where your preview CSS is not loaded. A `var(--token)` swatch only shows a color if the property is defined there too, for example through a stylesheet with `type: 'overwriteStyleguide'` (see [Configuration](configuration.md#html)). Literal values always work.

### Icons

`Icons:` renders a searchable icon gallery. Clicking an icon copies its markup.

```css
/*
Icons

Icons:
search: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
close: <i class="icon icon--close"></i>

Styleguide 1.5
*/
```

Each line is `name: <svg>…</svg>` or `name: <i …></i>`.

### Themes

`Themes:` adds a **Theme** dropdown above the section's previews. Each line is a class or class list and a label, in the same format as modifiers:

```css
/*
Project Card

Themes:
.theme-dusk - Dusk
.theme-ocean - Ocean

Markup: templates/source/03-components/card.pug

Styleguide 3.1
*/
```

Selecting a theme adds its classes to the `<html>` element of every preview in the section, so token overrides such as `html.theme-dusk { --surface: #11201b; }` take effect without a rebuild. A chained class like `.theme-dusk.compact` adds both classes. **Default** returns to the global theme from the header.

If a theme is also configured in `previewThemes` with its own stylesheet, the section picks that stylesheet up as well. [The styleguide UI](styleguide-ui.md#themes) explains how section and global themes interact.

### Figma

`Figma:` embeds a Figma frame. Use the embed URL from Figma's share dialog:

```css
Figma: https://embed.figma.com/design/FILE_ID?node-id=123-456
```

A section with both `Figma:` and `Markup:` shows **Preview** and **Design** tabs. The embed follows the styleguide's light and dark mode.

### Wrapper

`Wrapper:` puts the markup into a container for the preview, without making the container part of the copied code. Mark the slot with `{{wrapper-content}}` or `<wrapper-content/>`:

```css
Wrapper: <div class="card-row">{{wrapper-content}}</div>
```

### htmlclass and bodyclass

`htmlclass:` and `bodyclass:` add classes to the `<html>` and `<body>` element of the section's previews. Use them for a background, a canvas padding or a context class the component expects:

```css
bodyclass: is-centered
htmlclass: theme-cards
```

A theme selected in the Theme dropdown is added on top of `htmlclass`. When both set the same custom properties, the later rule in your CSS wins, so give theme hooks a higher specificity (`html.theme-dusk`) than context classes.

## A complete example

```css
/*
Project Card

Markdown: css/03-components/card.md

Status: Complete

bodyclass: is-centered

Themes:
.theme-dusk - Dusk
.theme-ocean - Ocean

.card--interactive - Lifts on hover, for cards that are one big link

Wrapper: <div class="card-row">{{wrapper-content}}</div>

Markup: templates/source/03-components/card.pug

Styleguide 3.1
*/
```

This is the card from the [live demo](https://felixranesberger.github.io/kss-modern/preview-3.1.html). Its full source is in [`demo/content/css/03-components/card.css`](../demo/content/css/03-components/card.css).
