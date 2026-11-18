import React from 'react'

// Whether the element is in the page and none of it (or its ancestors) is display:none.
function isShown(el) {
  if (!el || !el.isConnected) return false
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (getComputedStyle(n).display === 'none') return false
  }
  return true
}

/** Ctrl/Cmd+F opens `find` while the view in `containerRef` is showing; any other view leaves the key alone. */
export function useFindShortcut(containerRef, find) {
  const latest = React.useRef(find)
  latest.current = find
  React.useEffect(() => {
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return
      if (!isShown(containerRef.current)) return
      e.preventDefault()
      latest.current.setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [containerRef])
}
