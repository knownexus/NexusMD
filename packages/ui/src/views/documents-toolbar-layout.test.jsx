// The Documents page's tools put their controls on the page's one top bar, and the Markdown formatting buttons
// sit in a Format dropdown that can be pinned as a bar.
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { DocumentsView } from './view-documents.jsx'
import { MarkdownViewer } from './MarkdownViewer.jsx'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

describe('Documents top bar', () => {
  it('holds the Markdown tool controls on the same row as the tool tabs', () => {
    const { container } = render(<DocumentsView />)
    const bar = container.querySelector('.nx-docs-bar')
    expect(within(bar).getByRole('button', { name: 'split' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: /Format/ })).toBeTruthy()
  })

  it('shows the JSON controls there instead when JSON is open', () => {
    localStorage.setItem('documents_active_tab', JSON.stringify('json'))
    const { container } = render(<DocumentsView />)
    const bar = container.querySelector('.nx-docs-bar')
    expect(within(bar).getByRole('button', { name: /Undo/ })).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: 'split' })).toBeNull()
  })
})

describe('Markdown formatting buttons', () => {
  it('start tucked in a Format dropdown, not a bar', () => {
    render(<MarkdownViewer />)
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy()
  })

  it('inserting from the dropdown closes it and edits the text', () => {
    render(<MarkdownViewer />)
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    fireEvent.click(screen.getByRole('button', { name: 'H1' }))
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull()
    expect(screen.getByPlaceholderText(/Start writing/).value).toMatch(/# Heading 1/)
  })

  it('Escape closes the dropdown', () => {
    render(<MarkdownViewer />)
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull()
  })

  it('Pin as bar turns them into a bar, and Unpin puts them back', () => {
    render(<MarkdownViewer />)
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin as bar' }))
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Format/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull()
    expect(screen.getByRole('button', { name: /Format/ })).toBeTruthy()
  })
})
