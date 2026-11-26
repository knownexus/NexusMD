// page-head.jsx — a page's title block and actions. Where the shell has a header with the page's name in it (the
// desktop app), the title is not repeated: the page's one-line summary and its actions join that header instead, via
// HeaderSlotContext. Anywhere else (web, mobile, a view shown on its own) it is the page-head it always was.
import React from 'react'
import { createPortal } from 'react-dom'

/** The header's spare room (a DOM element), for the view showing; null for everything else. */
export const HeaderSlotContext = React.createContext(null)

/** Children that belong in the shell header when there is one; `fallback` (default: the children) where there is not. */
export function InHeader({ children, fallback = children }) {
  const slot = React.useContext(HeaderSlotContext)
  return slot ? createPortal(children, slot) : fallback
}

/** `sub`: the summary line under the title. `actions`: the buttons on the right. */
export function PageHead({ title, sub = null, actions = null, actionsStyle }) {
  const slot = React.useContext(HeaderSlotContext)
  if (slot) {
    return createPortal(
      <>
        {sub != null && sub !== false && <span className="topbar-sub">{sub}</span>}
        {actions != null && actions !== false && <div className="page-head-actions" style={actionsStyle}>{actions}</div>}
      </>,
      slot,
    )
  }
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub != null && sub !== false && <div className="sub">{sub}</div>}
      </div>
      {actions != null && actions !== false && <div className="page-head-actions" style={actionsStyle}>{actions}</div>}
    </div>
  )
}
