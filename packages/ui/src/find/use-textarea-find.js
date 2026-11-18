// use-textarea-find.js — find in a textarea: the current match is selected and scrolled into view. A textarea can
// show only one selection, so the other matches are not marked. Focus stays where it is (the find bar), so the
// Android keyboard is not raised by stepping. A textarea that has no focus paints no selection, so the current match
// is also drawn on an overlay laid over it.
import React from 'react'
import { findMatches } from '@nexusmd/core'
import { ensureFindStyle } from './find-style.js'

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

// A transparent copy of the textarea's text laid over it, with the match highlighted. Returns a function that removes it.
function paintOverlay(el, text, m) {
  const host = el.offsetParent || el.parentNode
  if (!host) return () => {}
  const cs = getComputedStyle(el)
  const ov = document.createElement('div')
  ov.setAttribute('data-find-overlay', '')
  ov.setAttribute('aria-hidden', 'true')
  MIRRORED.forEach(p => { ov.style[p] = cs[p] })
  const bar = el.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)
  Object.assign(ov.style, {
    position: 'absolute', left: el.offsetLeft + 'px', top: el.offsetTop + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px',
    paddingRight: (parseFloat(cs.paddingRight) || 0) + Math.max(0, bar) + 'px',
    overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', color: 'transparent', pointerEvents: 'none', borderStyle: 'solid', borderColor: 'transparent',
  })
  const mark = document.createElement('mark')
  mark.setAttribute('data-find', ''); mark.setAttribute('data-find-current', '')
  mark.textContent = text.slice(m.start, m.end)
  ov.append(document.createTextNode(text.slice(0, m.start)), mark, document.createTextNode(text.slice(m.end)))
  host.appendChild(ov)
  ov.scrollTop = el.scrollTop
  const sync = () => { ov.scrollTop = el.scrollTop }
  el.addEventListener('scroll', sync)
  return () => { el.removeEventListener('scroll', sync); ov.remove() }
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

  // Not on `text`: typing in the textarea while the bar is open must not pull the selection away. And never while the
  // textarea has focus: stepping happens from the bar, so focus there means the person is editing (the index only
  // changes under them when typing shortens the text and the count shrinks).
  React.useEffect(() => {
    const el = taRef.current
    const m = matches.current[index]
    if (!open || !el || !m || document.activeElement === el) return
    el.setSelectionRange(m.start, m.end)
    scrollToPos(el, m.start)
  }, [open, query, matchCase, index, taRef])

  // The current match, drawn over the textarea; redrawn when the text changes under it.
  React.useEffect(() => {
    const el = taRef.current
    const m = matches.current[index]
    if (!open || !el || !m) return undefined
    ensureFindStyle()
    return paintOverlay(el, text, m)
  }, [open, query, matchCase, index, text, taRef])
}
