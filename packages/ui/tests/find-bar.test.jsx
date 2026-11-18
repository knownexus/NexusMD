import React from 'react'
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useFind, FindBar, useFindShortcut } from '../src/index.js'

afterEach(cleanup)

const mkFind = (over = {}) => ({
  open: true, setOpen: vi.fn(), close: vi.fn(), query: '', setQuery: vi.fn(),
  matchCase: false, setMatchCase: vi.fn(), index: 0, count: 0, report: vi.fn(), next: vi.fn(), prev: vi.fn(), ...over,
})

describe('useFind', () => {
  it('resets the index when the query changes', () => {
    const { result } = renderHook(() => useFind())
    act(() => result.current.report(5))
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.index).toBe(2)
    act(() => result.current.setQuery('x'))
    expect(result.current.index).toBe(0)
  })
  it('clamps the index when the count shrinks', () => {
    const { result } = renderHook(() => useFind())
    act(() => result.current.report(8))
    for (let i = 0; i < 5; i++) act(() => result.current.next())
    expect(result.current.index).toBe(5)
    act(() => result.current.report(2))
    expect(result.current.index).toBe(1)
  })
  it('wraps with next and prev', () => {
    const { result } = renderHook(() => useFind())
    act(() => result.current.report(3))
    act(() => result.current.prev())
    expect(result.current.index).toBe(2)
    act(() => result.current.next())
    expect(result.current.index).toBe(0)
  })
  it('goTo moves to a given match, and report clamps it', () => {
    const { result } = renderHook(() => useFind())
    act(() => result.current.report(5))
    act(() => result.current.goTo(3))
    expect(result.current.index).toBe(3)
    act(() => result.current.report(2))
    expect(result.current.index).toBe(1)
  })
  it('keeps the query when closed and reopened', () => {
    const { result } = renderHook(() => useFind())
    act(() => { result.current.setOpen(true); result.current.setQuery('abc') })
    act(() => result.current.close())
    expect(result.current.open).toBe(false)
    expect(result.current.query).toBe('abc')
  })
})

describe('FindBar', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<FindBar find={mkFind({ open: false })} />)
    expect(container.innerHTML).toBe('')
  })
  it('shows the position among the matches', () => {
    render(<FindBar find={mkFind({ query: 'a', index: 1, count: 5 })} />)
    expect(screen.getByText('2 of 5')).toBeTruthy()
  })
  it('shows 5000+ at the cap and No matches for nothing', () => {
    const { unmount } = render(<FindBar find={mkFind({ query: 'a', count: 5000 })} />)
    expect(screen.getByText(/5000\+/)).toBeTruthy()
    unmount()
    render(<FindBar find={mkFind({ query: 'x', count: 0 })} />)
    expect(screen.getByText('No matches')).toBeTruthy()
  })
  it('Enter, Shift+Enter and Escape drive next, prev and close', () => {
    const find = mkFind({ query: 'a', count: 2 })
    render(<FindBar find={find} />)
    const input = screen.getByLabelText('Find in file')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(find.next).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(find.prev).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(find.close).toHaveBeenCalledTimes(1)
  })
  it('has previous, next, close buttons and a match-case toggle', () => {
    const find = mkFind({ query: 'a', count: 2 })
    render(<FindBar find={find} />)
    fireEvent.click(screen.getByLabelText('Next match'))
    fireEvent.click(screen.getByLabelText('Previous match'))
    fireEvent.click(screen.getByLabelText('Close find'))
    expect(find.next).toHaveBeenCalled(); expect(find.prev).toHaveBeenCalled(); expect(find.close).toHaveBeenCalled()
    const cs = screen.getByLabelText('Match case')
    expect(cs.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(cs)
    expect(find.setMatchCase).toHaveBeenCalledWith(true)
  })
  it('typing sets the query and focuses the input on open', () => {
    const find = mkFind()
    render(<FindBar find={find} />)
    const input = screen.getByLabelText('Find in file')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'hey' } })
    expect(find.setQuery).toHaveBeenCalledWith('hey')
  })
})

describe('useFindShortcut', () => {
  function Host({ find, hidden = false }) {
    const ref = React.useRef(null)
    useFindShortcut(ref, find)
    return <div ref={ref} style={hidden ? { display: 'none' } : undefined}>file</div>
  }
  const press = () => {
    const e = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(e)
    return e
  }
  it('opens find on Ctrl+F while the view is showing', () => {
    const find = mkFind({ open: false })
    render(<Host find={find} />)
    const e = press()
    expect(find.setOpen).toHaveBeenCalledWith(true)
    expect(e.defaultPrevented).toBe(true)
  })
  it('ignores Ctrl+F while the view is hidden', () => {
    const find = mkFind({ open: false })
    render(<Host find={find} hidden />)
    const e = press()
    expect(find.setOpen).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  })
  it('stops listening after unmount', () => {
    const find = mkFind({ open: false })
    const { unmount } = render(<Host find={find} />)
    unmount()
    press()
    expect(find.setOpen).not.toHaveBeenCalled()
  })})

describe('FindBar when opened again', () => {
  it('moves focus back to the query box when asked to open while already open', () => {
    let api
    function Host() { api = useFind(); return <><button data-testid="other">x</button><FindBar find={api} /></> }
    render(<Host />)
    act(() => api.setOpen(true))
    const input = screen.getByLabelText('Find in file')
    expect(document.activeElement).toBe(input)
    screen.getByTestId('other').focus()
    expect(document.activeElement).not.toBe(input)
    act(() => api.setOpen(true))
    expect(document.activeElement).toBe(input)
  })
})
