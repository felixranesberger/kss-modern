# Markup and templates

`Markup:` defines what a section's preview renders. kss-modern supports three sources and lets sections reuse each other's markup.

## Inline HTML

Write the HTML directly into the comment. It may span several lines, as long as it contains no blank line:

```css
/*
Toast

Markup: <div class="toast" role="status">
  <p class="toast__title">Changes saved</p>
</div>

Styleguide 3.8
*/
```

## Static HTML files

A bare path ending in `.html` is read from disk and inlined as it is. Paths are relative to `contentDir`:

```css
Markup: templates/source/02-elements/badges.html
```

## Pug templates

A bare path ending in `.pug` is compiled at build time:

```css
Markup: templates/source/03-components/card.pug
```

Templates can `include` mixins and partials and `extends` layouts with blocks, using paths relative to the template. kss-modern tracks those files, so the watcher rebuilds a section when one of its partials or layouts changes.

Compilation runs in a pool of worker threads. In `development` mode a compile error shows up as an overlay in the affected preview and every other section keeps rendering. In `production` mode a compile error fails the build.

### Template globals

Every template receives two locals.

**`modifierClass`** holds the `{{modifier_class}}` placeholder. Put it on the element that should carry the section's modifier:

```pug
button.btn(type="button" class=modifierClass) Save changes
```

kss-modern swaps the placeholder for each modifier's class. Every element with `class=modifierClass` receives the class, including elements that come from included mixins, so only place it where the modifier belongs.

**`useId(key?)`** returns an id that is unique per section and stable between builds. It is meant for labels, ARIA relations and anything else that needs matching ids:

```pug
- const id = useId('email')
label(for=id) Email
input(id=id type="email")
```

With a key, the id is `id-<section>-<key>`, so `useId('email')` in section `2.2` returns `id-2-2-email` every time you call it. Without a key, each call returns the next number in a sequence. Keys end up in the `id` attribute, so use letters, numbers and dashes.

## Reusing markup with `<insert-markup>`

`<insert-markup>` inlines the markup of another section. Use it to build whole screens from documented components, so the screen always matches the component pages:

```pug
extends ../../layouts/_app

block content
  <insert-markup>3.2</insert-markup>
  .app__columns
    <insert-markup>3.7</insert-markup>
    <insert-markup>3.3-0</insert-markup>
```

This is the dashboard from the [demo](https://felixranesberger.github.io/kss-modern/preview-4.3.html). The tag works in inline markup, `.html` files and `.pug` templates.

| Form | Result |
|---|---|
| `<insert-markup>3.7</insert-markup>` | the markup of section 3.7, with `{{modifier_class}}` left in place |
| `<insert-markup>3.7-</insert-markup>` | the same as above |
| `<insert-markup>3.3-0</insert-markup>` | the markup of section 3.3 with its first modifier applied (`-1` is the second, and so on) |

Included sections may include other sections in turn. A reference to a missing section, a modifier index that is out of range or a circular reference doesn't fail the build. The preview shows an error block in its place and the build logs a warning.

## Legacy `<insert-vite-pug>`

Styleguides that came from older generators often embed Pug with a tag. kss-modern still compiles it:

```html
<insert-vite-pug src="templates/source/02-elements/buttons.pug"></insert-vite-pug>
```

`modifierClass="…"` on the tag bakes a fixed class into the template at build time. For new sections, point `Markup:` at the `.pug` file and use the `modifierClass` global instead.

## What the preview document contains

Each preview is a standalone HTML page (`fullpage-<reference>.html`) that loads:

- your `html.assets` stylesheets and scripts without a `type`, in the order you list them
- the stylesheets of every configured preview theme, disabled until a theme is selected
- the `htmlclass`, `bodyclass` and `Wrapper` of the section

Scripts run once per preview, so an initializer that queries the document only finds the components of that one section. The demo's [`js/main.js`](../demo/content/js/main.js) shows the pattern.
