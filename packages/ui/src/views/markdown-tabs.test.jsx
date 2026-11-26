import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MarkdownTabs } from './markdown-tabs.jsx'

afterEach(cleanup)

const tabs = [
  { path: 'C:/work/a.md', name: 'a.md', dirty: false },
  { path: 'C:/work/b.md', name: 'b.md', dirty: true },
]

describe('MarkdownTabs', () => {
  it('shows nothing when no file is open', () => {
    const { container } = render(<MarkdownTabs tabs={[]} activePath={null} onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('has a tab per file, the open one selected, and a dot on one with unsaved edits', () => {
    render(<MarkdownTabs tabs={tabs} activePath="C:/work/b.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /a\.md/ }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: /b\.md/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /b\.md/ }).textContent).toMatch(/●/)
    expect(screen.getByRole('tab', { name: /a\.md/ }).textContent).not.toMatch(/●/)
  })

  it('clicking a tab activates it', () => {
    const onActivate = vi.fn()
    render(<MarkdownTabs tabs={tabs} activePath="C:/work/b.md" onActivate={onActivate} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: /a\.md/ }))
    expect(onActivate).toHaveBeenCalledWith('C:/work/a.md')
  })

  it('the × and a middle click close a tab without activating it', () => {
    const onClose = vi.fn(); const onActivate = vi.fn()
    render(<MarkdownTabs tabs={tabs} activePath="C:/work/b.md" onActivate={onActivate} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close a.md' }))
    expect(onClose).toHaveBeenLastCalledWith('C:/work/a.md')
    fireEvent(screen.getByRole('tab', { name: /b\.md/ }), new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(onClose).toHaveBeenLastCalledWith('C:/work/b.md')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('shows the full path as a tooltip', () => {
    render(<MarkdownTabs tabs={tabs} activePath={null} onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /a\.md/ }).getAttribute('title')).toBe('C:/work/a.md')
  })
})
