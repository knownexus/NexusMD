// documents-bar.jsx — the Documents page's one top bar: the tool tabs on the left, the open document's save
// state on the right. A tool tells the bar how its document is saving with useDocumentsBarSave.
import React from 'react'
import { createPortal } from 'react-dom'
import { Segmented } from '../segmented.jsx'
import { relativeTime } from './document-store.js'
import { HeaderSlotContext } from '../page-head.jsx'

export const DocumentsBarContext = React.createContext({ setSave: () => {}, slot: null })

/**
 * A tool's own controls (view switcher, Save, Open…). Inside the Documents page they join the one top bar, on the
 * same row as the tool tabs; on their own (no bar around them) they render in a row of their own, styled by `style`.
 */
export function ToolBarRow({ children, style }) {
  const { slot } = React.useContext(DocumentsBarContext)
  if (slot) return createPortal(children, slot)
  return <div style={style}>{children}</div>
}

/**
 * Reports a tool's save status ('' | 'saving' | 'saved' | 'unsaved', as useDocumentAutosave gives it) to the
 * bar for as long as the tool is shown. The bar remembers when the last save happened.
 */
export function useDocumentsBarSave(status) {
  const { setSave } = React.useContext(DocumentsBarContext)
  React.useEffect(() => {
    setSave(prev => (status === 'saved' ? { status, savedAt: Date.now() } : { status, savedAt: prev?.savedAt ?? null }))
  }, [status, setSave])
  React.useEffect(() => () => setSave(null), [setSave])
}

// "● Saving…" (a warning dot), "● Saved just now" (a success dot), or nothing before the first save.
function SaveState({ save }) {
  if (!save) return null
  const busy = save.status === 'saving' || save.status === 'unsaved'
  if (!busy && !save.savedAt) return null
  return (
    <span className="nx-docs-save" role="status">
      <span className="nx-gw-dot" data-tone={busy ? 'warn' : 'ok'} />
      <span>{busy ? 'Saving…' : `Saved ${relativeTime(save.savedAt)}`}</span>
    </span>
  )
}

export function DocumentsBar({ tabs, tab, onTab, save, slotRef }) {
  // Which tool is open is the page's own state, so where the shell has a header it goes there (next to the page's name).
  const headerSlot = React.useContext(HeaderSlotContext)
  const toolTabs = <Segmented ariaLabel="Documents tool" value={tab} onChange={onTab} options={tabs} />
  return (
    <div className="nx-docs-bar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 14, height: 48, padding: '0 16px', boxSizing: 'border-box', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {headerSlot ? createPortal(toolTabs, headerSlot) : toolTabs}
      <style>{'.nx-docs-slot > * { flex-shrink: 0 } .nx-docs-slot { scrollbar-width: thin }'}</style>
      <div ref={slotRef} className="nx-docs-slot" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto' }} />
      <SaveState save={save} />
    </div>
  )
}
