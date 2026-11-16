import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { moveWidget, moveWidgetBy } from '@nexusmd/core'
import { WidgetHost, WidgetSheet } from './home-widgets.jsx'

afterEach(cleanup)

const link = { id: 'k1', type: 'link', config: { target: 'git', kind: 'file', path: '/a.js', repo: { provider: 'github', name: 'nexus' } } }
const three = [{ id: 'a', type: 'notes', config: {} }, { id: 'b', type: 'time', config: {} }, { id: 'c', type: 'builds', config: { count: 1 } }]

describe('File-or-folder width', () => {
  it('keeps the chosen width when a shortcut is saved', () => {
    const onSave = vi.fn()
    render(<WidgetSheet open widget={link} onClose={() => {}} onSave={onSave} onRemove={() => {}}/>)
    fireEvent.change(screen.getByDisplayValue('Half width'), { target: { value: 'full' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0][0].config).toMatchObject({ target: 'git', width: 'full' })
  })

  it('lays a full-width shortcut across both columns', () => {
    render(<WidgetHost widgets={[{ ...link, config: { ...link.config, width: 'full' } }]} ctx={{}}/>)
    expect(screen.getByTestId('home-widget').style.gridColumn).toBe('span 2')
  })
})

describe('reordering', () => {
  it('moveWidget puts a widget where another one is', () => {
    expect(moveWidget(three, 'a', 'c').map(w => w.id)).toEqual(['b', 'c', 'a'])
    expect(moveWidget(three, 'c', 'a').map(w => w.id)).toEqual(['c', 'a', 'b'])
    expect(moveWidget(three, 'a', 'zz')).toBe(three)
  })

  it('moveWidgetBy steps over widgets Home leaves out, and stays put at the ends', () => {
    expect(moveWidgetBy(three, 'a', 1, w => w.id !== 'b').map(w => w.id)).toEqual(['b', 'c', 'a'])
    expect(moveWidgetBy(three, 'a', -1)).toBe(three)
  })

  it('shows drag handles only while arranging, and drops a widget onto another', () => {
    const onReorder = vi.fn()
    const { rerender } = render(<WidgetHost widgets={three} ctx={{}} onReorder={onReorder}/>)
    expect(screen.queryByLabelText(/^Move .* widget$/)).toBeNull()
    rerender(<WidgetHost widgets={three} ctx={{}} onReorder={onReorder} arranging/>)
    const handles = screen.getAllByLabelText(/^Move .* widget$/)
    expect(handles).toHaveLength(3)
    const target = screen.getAllByTestId('home-widget')[2]
    document.elementFromPoint = vi.fn(() => target)
    fireEvent.pointerDown(handles[0], { button: 0, pointerId: 1, clientX: 1, clientY: 1 })
    fireEvent.pointerMove(handles[0], { pointerId: 1, clientX: 5, clientY: 300 })
    fireEvent.pointerUp(handles[0], { pointerId: 1 })
    expect(onReorder.mock.calls[0][0].map(w => w.id)).toEqual(['b', 'c', 'a'])
  })

  it('offers Move earlier / later in the settings sheet when the host can move widgets', () => {
    const onMove = vi.fn()
    render(<WidgetSheet open widget={three[1]} onClose={() => {}} onSave={() => {}} onRemove={() => {}}
      onMove={onMove} canMove={(w, dir) => dir > 0}/>)
    expect(screen.getByRole('button', { name: 'Move earlier' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Move later' }))
    expect(onMove).toHaveBeenCalledWith(three[1], 1)
  })
})
