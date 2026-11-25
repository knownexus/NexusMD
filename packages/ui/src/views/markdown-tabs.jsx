// markdown-tabs.jsx — one tab per Markdown file the app was opened with (see modules/documents opened.js): its name, a dot
// while it has unsaved edits, and a close button. Shown only while a file is open.
import React from 'react'

export function MarkdownTabs({ tabs, activePath, onActivate, onClose }) {
  if (!tabs?.length) return null
  return (
    <div role="tablist" aria-label="Open files" style={{
      display: 'flex', alignItems: 'stretch', gap: 2, padding: '4px 8px 0', overflowX: 'auto', flexShrink: 0,
      background: 'var(--surface)', borderBottom: '1px solid var(--border)', scrollbarWidth: 'thin',
    }}>
      {tabs.map(t => {
        const active = t.path === activePath
        return (
          <div key={t.path} style={{
            display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: '6px 6px 0 0',
            background: active ? 'var(--bg)' : 'transparent', border: '1px solid', borderBottom: 'none',
            borderColor: active ? 'var(--border)' : 'transparent',
          }}>
            <button
              role="tab" aria-selected={active} title={t.path}
              onClick={() => onActivate(t.path)}
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onClose(t.path) } }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 4px 6px 12px', border: 'none', background: 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t.name}
              {t.dirty && <span aria-hidden="true" title="Unsaved changes" style={{ color: 'var(--accent)', fontSize: 10 }}>●</span>}
            </button>
            <button
              aria-label={`Close ${t.name}`}
              onClick={() => onClose(t.path)}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px', fontSize: 13, lineHeight: 1 }}
            >×</button>
          </div>
        )
      })}
    </div>
  )
}
