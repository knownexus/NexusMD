import React from 'react'
import { render, screen, cleanup, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { useFind, useTextareaFind } from '../src/index.js'

afterEach(cleanup)

let api
function Host({ text }) {
  const find = useFind()
  api = find
  const ref = React.useRef(null)
  useTextareaFind(ref, text, find)
  return (
    <div>
      <input data-testid="bar" />
      <textarea ref={ref} data-testid="ta" defaultValue={text} />
      <span data-testid="state">{`${find.count}/${find.index}`}</span>
    </div>
  )
}
const ta = () => screen.getByTestId('ta')
const state = () => screen.getByTestId('state').textContent

describe('useTextareaFind', () => {
  it('reports the number of matches and selects the current one', () => {
    render(<Host text="one two one" />)
    act(() => { api.setOpen(true); api.setQuery('one') })
    expect(state()).toBe('2/0')
    expect([ta().selectionStart, ta().selectionEnd]).toEqual([0, 3])
    act(() => api.next())
    expect([ta().selectionStart, ta().selectionEnd]).toEqual([8, 11])
  })
  it('does not take focus from the find input', () => {
    render(<Host text="one two one" />)
    screen.getByTestId('bar').focus()
    act(() => { api.setOpen(true); api.setQuery('one') })
    act(() => api.next())
    expect(document.activeElement).toBe(screen.getByTestId('bar'))
  })
  it('clamps the index when the text gets shorter', () => {
    const { rerender } = render(<Host text="a a a a a" />)
    act(() => { api.setOpen(true); api.setQuery('a') })
    for (let i = 0; i < 4; i++) act(() => api.next())
    expect(state()).toBe('5/4')
    rerender(<Host text="a a" />)
    expect(state()).toBe('2/1')
  })
  it('does not move the selection when only the text changes', () => {
    const { rerender } = render(<Host text="one two one" />)
    act(() => { api.setOpen(true); api.setQuery('one') })
    ta().setSelectionRange(4, 4)
    rerender(<Host text="one two one!" />)
    expect([ta().selectionStart, ta().selectionEnd]).toEqual([4, 4])
  })
  it('does nothing and reports 0 when closed', () => {
    render(<Host text="one" />)
    ta().setSelectionRange(1, 2)
    act(() => { api.setQuery('one') })
    expect(state()).toBe('0/0')
    expect([ta().selectionStart, ta().selectionEnd]).toEqual([1, 2])
  })
})
