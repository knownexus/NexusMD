// use-textarea-find.js — find in a textarea: the current match is selected and scrolled into view. A textarea can
// show only one selection, so the other matches are not marked. Focus stays where it is (the find bar), so the
// Android keyboard is not raised by stepping.
import React from 'react'
import { findMatches } from '@nexusmd/core'

const MIRRORED = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'tabSize', 'textIndent', 'textTransform']

// The y offset of character `pos` in the textarea's content, measured on an offscreen copy that wraps the same way.
function offsetTopOf(el, pos) {
  const cs = getComputedStyle(el)
  const mirror = document.createElement('div')
  MIRRORED.forEach(p => { mirror.style[p] = cs[p] })
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', height: 'auto' })
  mirror.appendChild(document.createTextNode(el.value.slice(0, pos)))
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(pos) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const top = marker.offsetTop
  document.body.removeChild(mirror)
  return top
}

function scrollToPos(el, pos) {
  if (!el.clientHeight) return
  const top = offsetTopOf(el, pos)
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20
  if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - line) el.scrollTop = Math.max(0, top - el.clientHeight / 2)
}

export function useTextareaFind(taRef, text, find) {
  const { open, query, matchCase, index, report } = find
  const matches = React.useRef([])

  React.useEffect(() => {
    matches.current = open && query ? findMatches(text, query, { matchCase }) : []
    report(matches.current.length)
  }, [open, query, matchCase, text, report])

  // Not on `text`: typing in the textarea while the bar is open must not pull the selection away.
  React.useEffect(() => {
    const el = taRef.current
    const m = matches.current[index]
    if (!open || !el || !m) return
    el.setSelectionRange(m.start, m.end)
    scrollToPos(el, m.start)
  }, [open, query, matchCase, index, taRef])
}
