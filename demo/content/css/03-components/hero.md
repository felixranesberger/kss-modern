# Hero Component

The hero is the primary visual element at the top of a page. This section pairs
a live Pug preview with a Figma embed, so the styleguide renders **Preview** and
**Design** tabs.

## Variants

| Variant | Use case |
|---------|----------|
| Default | Standard content pages |
| Large   | Landing pages |

:::alert{type="warning" title="Contrast"}
Always check text contrast against the gradient. Add an overlay for busy
background images.
:::

:::accordion{title="CSS custom properties" open=true}
- `--color-primary-dark` / `--color-primary-light` — gradient stops
- Minimum height is `320px`
:::

## Code Example

```html
<section class="c-hero">
  <div class="c-hero__content">
    <h1 class="c-hero__title">Build with confidence</h1>
  </div>
</section>
```
