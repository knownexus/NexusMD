import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { CodeEditor } from './code-editor.jsx'

afterEach(cleanup)

const hits = c => c.querySelectorAll('.cm-find-hit')
const current = c => c.querySelectorAll('.cm-find-current')

function mount(value = 'foo bar Foo\nbaz foo', extra = {}) {
  const apiRef = React.createRef()
  const view = render(<CodeEditor value={value} language="text" ariaLabel="x" readOnly apiRef={apiRef} {...extra} />)
  return { apiRef, ...view }
}

describe('CodeEditor find', () => {
  it('decorates every match and the current one, and returns the count', () => {
    const { apiRef, container } = mount()
    let n
    act(() => { n = apiRef.current.find('foo', { matchCase: false, index: 1 }) })
    expect(n).toBe(3)
    expect(hits(container)).toHaveLength(3)
    expect(current(container)).toHaveLength(1)
    expect(current(container)[0].textContent).toBe('Foo')
  })
  it('honours matchCase', () => {
    const { apiRef, container } = mount()
    let n
    act(() => { n = apiRef.current.find('foo', { matchCase: true, index: 0 }) })
    expect(n).toBe(2)
    expect(hits(container)).toHaveLength(2)
  })
  it('clears the decorations and returns 0 for an empty query', () => {
    const { apiRef, container } = mount()
    act(() => { apiRef.current.find('foo', { matchCase: false, index: 0 }) })
    act(() => apiRef.current.clearFind())
    expect(hits(container)).toHaveLength(0)
    let n
    act(() => { apiRef.current.find('foo', { matchCase: false, index: 0 }) })
    act(() => { n = apiRef.current.find('', { matchCase: false, index: 0 }) })
    expect(n).toBe(0)
    expect(hits(container)).toHaveLength(0)
  })
  it('takes the query literally', () => {
    const { apiRef } = mount('a (b) c')
    let n
    act(() => { n = apiRef.current.find('(', { matchCase: false, index: 0 }) })
    expect(n).toBe(1)
  })
  it('re-runs the active query when the text is replaced from outside', () => {
    const apiRef = React.createRef()
    const { container, rerender } = render(<CodeEditor value="foo" language="text" ariaLabel="x" readOnly apiRef={apiRef} />)
    act(() => { apiRef.current.find('foo', { matchCase: false, index: 0 }) })
    expect(hits(container)).toHaveLength(1)
    rerender(<CodeEditor value="foo foo foo" language="text" ariaLabel="x" readOnly apiRef={apiRef} />)
    expect(hits(container)).toHaveLength(3)
  })
  const ctrlF = container => {
    const e = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    container.querySelector('.cm-content').dispatchEvent(e)
    return e
  }
  it('Mod-f calls onFind and does not open the built-in search panel', () => {
    const onFind = vi.fn()
    const { container } = mount('foo', { onFind })
    ctrlF(container)
    expect(onFind).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.cm-search')).toBeNull()
  })
  it('without onFind, Mod-f still opens the built-in search panel', () => {
    const { container } = mount('foo')
    ctrlF(container)
    expect(container.querySelector('.cm-search')).toBeTruthy()
  })
})
