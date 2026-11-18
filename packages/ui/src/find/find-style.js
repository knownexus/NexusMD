// How a find match looks: <mark data-find> (current: data-find-current) where matches are wrapped, and the ::highlight()
// ranges used where the CSS Custom Highlight API exists. Added to the page once, the first time a find runs.
const CSS_TEXT = `
mark[data-find] { background: rgba(255, 200, 0, .45); color: inherit; border-radius: 2px; }
mark[data-find][data-find-current] { background: rgba(255, 140, 0, .8); outline: 1px solid rgba(255, 140, 0, 1); }
::highlight(nx-find-hit) { background-color: rgba(255, 200, 0, .45); color: inherit; }
::highlight(nx-find-current) { background-color: rgba(255, 140, 0, .8); color: inherit; }
`

export function ensureFindStyle() {
  if (typeof document === 'undefined' || document.getElementById('nx-find-style')) return
  const el = document.createElement('style')
  el.id = 'nx-find-style'
  el.textContent = CSS_TEXT
  document.head.appendChild(el)
}
