Every preview has a **Code Audit** button that runs axe-core and html-validate against
the rendered component. One alert modifier on the [Alert](preview-3.20.html) page is
inaccessible on purpose, so the audit has something to report.

The same audit runs from the browser console or from Playwright:

```js
const report = await window.kssAudit({ include: 'violations' })
```
