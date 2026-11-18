// find-bar.jsx — the find-in-file row shared by every viewer: query, "n of N", previous/next, match case, close.
import React from 'react'
import { FIND_LIMIT } from '@nexusmd/core'

const btn = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 6, minWidth: 28, height: 28, cursor: 'pointer', fontSize: 13, lineHeight: 1 }

export function FindBar({ find, className = '', style }) {
  const input = React.useRef(null)
  React.useEffect(() => { if (find.open) { input.current?.focus(); input.current?.select() } }, [find.open])
  if (!find.open) return null
  const { query, count, index, matchCase } = find
  const status = !query ? '' : count === 0 ? 'No matches' : count >= FIND_LIMIT ? `${index + 1} of ${FIND_LIMIT}+` : `${index + 1} of ${count}`
  const onKeyDown = e => {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? find.prev() : find.next() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); find.close() }
  }
  return (
    <div role="search" className={`find-bar${className ? ` ${className}` : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--surface-2, var(--surface))', borderBottom: '1px solid var(--border)', ...style }}>
      <input ref={input} type="text" aria-label="Find in file" placeholder="Find in file" value={query} spellCheck={false}
        autoCapitalize="off" autoCorrect="off" enterKeyHint="search"
        onChange={e => find.setQuery(e.target.value)} onKeyDown={onKeyDown}
        style={{ flex: 1, minWidth: 0, height: 28, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg, var(--surface))', color: 'var(--text)', fontSize: 14 }} />
      <span aria-live="polite" style={{ minWidth: 64, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{status}</span>
      <button type="button" aria-label="Match case" title="Match case" aria-pressed={matchCase}
        onClick={() => find.setMatchCase(!matchCase)}
        style={{ ...btn, ...(matchCase ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : null) }}>Aa</button>
      <button type="button" aria-label="Previous match" title="Previous match (Shift+Enter)" onClick={find.prev} style={btn}>↑</button>
      <button type="button" aria-label="Next match" title="Next match (Enter)" onClick={find.next} style={btn}>↓</button>
      <button type="button" aria-label="Close find" title="Close (Esc)" onClick={find.close} style={btn}>✕</button>
    </div>
  )
}
