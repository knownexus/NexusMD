import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { PageHead, InHeader, HeaderSlotContext } from './page-head.jsx'
import { DocumentsView } from './views/view-documents.jsx'

afterEach(() => { cleanup(); localStorage.clear() })

function Shell({ children }) {
  const [slot, setSlot] = React.useState(null)
  return (
    <>
      <header data-testid="header"><h1>Pull Requests</h1><div ref={setSlot} className="topbar-slot" /></header>
      <main><HeaderSlotContext.Provider value={slot}>{children}</HeaderSlotContext.Provider></main>
    </>
  )
}

describe('PageHead', () => {
  it('on its own is the page-head it always was: a title, a summary and the actions', () => {
    render(<PageHead title="Pull requests" sub="2 active" actions={<button>Refresh</button>} />)
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeTruthy()
    expect(screen.getByText('2 active').className).toBe('sub')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
  })

  it('in a shell header does not repeat the title, and puts the summary and actions in the header', () => {
    render(<Shell><PageHead title="Pull requests" sub="2 active" actions={<button>Refresh</button>} /></Shell>)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    const header = within(screen.getByTestId('header'))
    expect(header.getByText('2 active')).toBeTruthy()
    expect(header.getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(within(document.querySelector('main')).queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('omits an absent summary or actions', () => {
    render(<Shell><PageHead title="Lists" /></Shell>)
    expect(document.querySelector('.topbar-sub')).toBeNull()
    expect(document.querySelector('.page-head-actions')).toBeNull()
  })

  it('InHeader shows its fallback when there is no header', () => {
    render(<InHeader fallback={<p>inline</p>}><p>in header</p></InHeader>)
    expect(screen.getByText('inline')).toBeTruthy()
    expect(screen.queryByText('in header')).toBeNull()
  })
})

describe('Documents in a shell header', () => {
  it('puts the tool tabs (Markdown, JSON Editor, Regex Tester) in the header, not the page', () => {
    render(<Shell><DocumentsView /></Shell>)
    const header = within(screen.getByTestId('header'))
    expect(header.getByRole('tab', { name: 'Markdown' })).toBeTruthy()
    expect(header.getByRole('tab', { name: 'JSON Editor' })).toBeTruthy()
    expect(within(document.querySelector('main')).queryByRole('tab', { name: 'Markdown' })).toBeNull()
  })
})
