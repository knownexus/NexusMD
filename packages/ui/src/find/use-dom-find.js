// use-dom-find.js — find in rendered content (the markdown preview, the Android file view): every match is
// highlighted and the current one scrolled into view. Matching is per text node, so a term that spans
// formatting (foo **bar**) is not found.
import React from 'react'
import { findMatches, FIND_LIMIT } from '@nexusmd/core'
import { ensureFindStyle } from './find-style.js'

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT'])

const useHighlightApi = () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined'

function textNodes(root) {
  const out = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue && !SKIP.has(n.parentElement?.tagName)) out.push(n)
  }
  return out
}

/** Highlights `query` under `root`; returns { count, marks: Array<Element | Range>, clear() }. */
function highlight(root, query, matchCase) {
  const api = useHighlightApi()
  const hits = [] // marks (Element) or ranges (Range), in document order
  for (const node of textNodes(root)) {
    if (hits.length >= FIND_LIMIT) break
    const ms = findMatches(node.nodeValue, query, { matchCase, limit: FIND_LIMIT - hits.length })
    if (!ms.length) continue
    if (api) {
      for (const m of ms) { const r = document.createRange(); r.setStart(node, m.start); r.setEnd(node, m.end); hits.push(r) }
    } else {
      const made = []
      for (let i = ms.length - 1; i >= 0; i--) { // from the end, so earlier offsets stay valid while the node is split
        const mid = node.splitText(ms[i].start)
        mid.splitText(ms[i].end - ms[i].start)
        const mark = document.createElement('mark')
        mark.setAttribute('data-find', '')
        mid.parentNode.replaceChild(mark, mid)
        mark.appendChild(mid)
        made.unshift(mark)
      }
      hits.push(...made)
    }
  }
  const clear = () => {
    if (api) { CSS.highlights.delete('nx-find-hit'); CSS.highlights.delete('nx-find-current'); return }
    for (const mark of hits) {
      const parent = mark.parentNode
      if (!parent) continue
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      parent.removeChild(mark)
    }
    root.normalize()
  }
  if (api) CSS.highlights.set('nx-find-hit', new Highlight(...hits))
  return { count: hits.length, hits, clear, api }
}

// A mark, or a highlight range, that is still in the page.
const alive = h => (h.isConnected !== undefined ? h.isConnected : !!h.startContainer?.isConnected)

function showCurrent(run, index) {
  if (!run) return
  const { hits, api } = run
  const cur = hits[index]
  if (api) {
    CSS.highlights.delete('nx-find-current')
    if (cur) {
      CSS.highlights.set('nx-find-current', new Highlight(cur))
      cur.startContainer.parentElement?.scrollIntoView?.({ block: 'center' })
    }
    return
  }
  hits.forEach((m, i) => (i === index ? m.setAttribute('data-find-current', '') : m.removeAttribute('data-find-current')))
  cur?.scrollIntoView?.({ block: 'center' })
}

/**
 * Finds `find.query` in what `rootRef` shows while the bar is open. `contentKey` changes when the content is
 * re-rendered (its text), so the highlights are put back on the new content.
 */
export function useDomFind(rootRef, find, contentKey) {
  const { open, query, matchCase, index, report } = find
  const run = React.useRef(null)
  const [rewrites, setRewrites] = React.useState(0)

  React.useEffect(() => {
    const root = rootRef.current
    if (!open || !query || !root) { report(0); return undefined }
    ensureFindStyle()
    const r = highlight(root, query, matchCase)
    run.current = r
    report(r.count)
    // The element is rewritten under the highlights (a preview rendering again): highlight what replaced them.
    const watcher = new MutationObserver(() => { if (!r.hits.every(alive)) setRewrites(n => n + 1) })
    watcher.observe(root, { childList: true, subtree: true })
    return () => { watcher.disconnect(); r.clear(); if (run.current === r) run.current = null }
  }, [open, query, matchCase, contentKey, rewrites, rootRef, report])

  // After the highlights above, whenever the current match or the matches change.
  React.useEffect(() => { showCurrent(run.current, index) }, [index, open, query, matchCase, contentKey, rewrites, find.count])
}
