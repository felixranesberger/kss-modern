# Hero Component

The hero component serves as the primary visual element at the top of a page.

## Variants

| Variant | Use Case |
|---------|----------|
| Default | Standard content pages |
| Large   | Landing pages |

## Integration Notes

:::alert{type="info" title="Responsive Images"}
The hero automatically adjusts image sizing based on viewport width.
Use `srcset` for optimal loading performance.
:::

:::accordion{title="Configuration Options"}
- `--hero-min-height`: Minimum height (default: `400px`)
- `--hero-overlay-opacity`: Overlay darkness (default: `0.4`)
:::

## Code Example

```html
<section class="c-hero">
  <img src="hero.jpg" alt="Hero image">
  <div class="c-hero__content">
    <h1>Page Title</h1>
  </div>
</section>
```
