// Counts playground renders, so the e2e tests can see that project JS ran after the component.
let renders = 0
document.documentElement.dataset.projectReady = String(document.querySelector('.btn') !== null)
document.addEventListener('kss-modern:playground-render', () => {
  renders++
  document.documentElement.dataset.renders = String(renders)
})
