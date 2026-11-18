import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import React from 'react'
import { NexusDataProvider, JsonEditorView } from '../src/index.js'

function memStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}
function renderEditor() {
  return render(
    <NexusDataProvider value={{ storage: memStorage(), getProfileKey: k => k, pushPref: () => {} }}>
      <JsonEditorView/>
    </NexusDataProvider>
  )
}
const ctrlF = () => fireEvent.keyDown(window, { key: 'f', ctrlKey: true })

afterEach(cleanup)

describe('JsonEditorView find', () => {
  it('Ctrl+F opens a find bar for the raw JSON and selects the match', () => {
    const { container } = renderEditor()
    ctrlF()
    fireEvent.change(screen.getByLabelText('Find in file'), { target: { value: 'Alice' } })
    expect(document.querySelector('[role="search"] [aria-live]').textContent).toMatch(/^1 of \d+$/)
    const ta = container.querySelector('textarea')
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe('Alice')
  })
  it('leaves the visual editor search box as it was', () => {
    renderEditor()
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
    ctrlF()
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
    expect(screen.getAllByRole('search')).toHaveLength(1)
  })
  it('does nothing while the raw JSON panel is hidden', () => {
    renderEditor()
    fireEvent.click(screen.getAllByTitle('Hide panel')[0])
    ctrlF()
    expect(screen.queryByLabelText('Find in file')).toBeNull()
  })
})
