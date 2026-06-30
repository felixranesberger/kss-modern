Interactive button component with multiple style variants. Buttons are rendered
from a Pug template that `include`s a shared `+button` mixin, which in turn
`include`s the `+icon` mixin — exercising transitive Pug include tracking.

## Guidelines

- Use **primary** for the main call-to-action on a page
- Use **outline** for secondary actions
- Use **danger** sparingly — only for destructive actions like delete

:::alert{type="info" title="Accessibility"}
Always provide a visible text label. Icon-only buttons require an `aria-label`.
:::

## Keyboard Interaction

| Key | Action |
|-----|--------|
| `Enter` | Activates the button |
| `Space` | Activates the button |

:::accordion{title="Implementation notes" open=true}
The markup uses the legacy `<insert-vite-pug>` tag with
`modifierClass="{{modifier_class}}"` so each modifier variant gets its own
compiled preview.
:::
