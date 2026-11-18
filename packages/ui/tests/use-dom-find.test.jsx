import React from 'react'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useFind, useDomFind } from '../src/index.js'

afterEach(cleanup)

let api
// Content is put in with innerHTML, the way MarkdownPreview fills its element, so React never owns the text nodes.
function Host({ html, contentKey = html }) {
  const find = useFind()
  api = find
  const ref = React.useRef(null)
  React.useLayoutEffect(() => { ref.current.innerHTML = html }, [html])
  useDomFind(ref, find, contentKey)
  return (
    <div>
      <div ref={ref} data-testid="root" />
      <span data-testid="state">{`${find.count}/${find.index}`}</span>
    </div>
  )
}
const marks = () => [...screen.getByTestId('root').querySelectorAll('mark[data-find]')]
const state = () => screen.getByTestId('state').textContent

describe('useDomFind', () => {
  it('marks every match, reports the count and emphasises the current one', () => {
    render(<Host html="<p>Foo foo</p>" />)
    act(() => { api.setOpen(true); api.setQuery('foo') })
    expect(marks()).toHaveLength(2)
    expect(state()).toBe('2/0')
    expect(marks()[0].hasAttribute('data-find-current')).toBe(true)
    act(() => api.next())
    expect(marks()[1].hasAttribute('data-find-current')).toBe(true)
    expect(marks()[0].hasAttribute('data-find-current')).toBe(false)
  })
  it('skips script and style text', () => {
    render(<Host html="<p>foo</p><script>foo</script><style>foo{}</style>" />)
    act(() => { api.setOpen(true); api.setQuery('foo') })
    expect(marks()).toHaveLength(1)
  })
  it('takes the query literally', () => {
    render(<Host html="<p>a (b) c</p>" />)
    expect(() => act(() => { api.setOpen(true); api.setQuery('(') })).not.toThrow()
    expect(marks()).toHaveLength(1)
  })
  it('leaves the DOM exactly as it was when closed', () => {
    const html = '<p>Foo <b>foo</b> bar foo</p>'
    render(<Host html={html} />)
    const root = screen.getByTestId('root')
    const before = root.innerHTML
    act(() => { api.setOpen(true); api.setQuery('foo') })
    expect(marks()).toHaveLength(3)
    act(() => api.close())
    expect(marks()).toHaveLength(0)
    expect(root.innerHTML).toBe(before)
    expect(state()).toBe('0/0')
  })
  it('highlights new content when the content key changes', () => {
    const { rerender } = render(<Host html="<p>foo</p>" />)
    act(() => { api.setOpen(true); api.setQuery('foo') })
    expect(marks()).toHaveLength(1)
    rerender(<Host html="<p>foo foo foo</p>" />)
    expect(marks()).toHaveLength(3)
    expect(state()).toBe('3/0')
  })
  it('caps the highlights', () => {
    render(<Host html={`<p>${'a'.repeat(6000)}</p>`} />)
    act(() => { api.setOpen(true); api.setQuery('a') })
    expect(state().startsWith('5000/')).toBe(true)
  })
  it('puts the highlights back when the content is re-rendered under it', async () => {
    render(<Host html="<p>foo</p>" />)
    act(() => { api.setOpen(true); api.setQuery('foo') })
    expect(marks()).toHaveLength(1)
    // What MarkdownPreview does when highlight.js finishes loading: it rewrites its element, text unchanged.
    act(() => { screen.getByTestId('root').innerHTML = '<p>foo foo foo</p>' })
    await waitFor(() => expect(marks()).toHaveLength(3))
    expect(state().startsWith('3/')).toBe(true)
  })
  it('with the highlight API, puts the highlights back when the content is re-rendered under it', async () => {
    const highlights = new Map()
    vi.stubGlobal('CSS', { highlights })
    vi.stubGlobal('Highlight', class extends Set { constructor(...r) { super(r) } })
    render(<Host html="<p>foo</p>" />)
    act(() => { api.setOpen(true); api.setQuery('foo') })
    expect(highlights.get('nx-find-hit').size).toBe(1)
    // The live range collapses onto the root when its text is replaced; the root itself stays in the page.
    act(() => { screen.getByTestId('root').innerHTML = '<p>foo foo foo</p>' })
    await waitFor(() => expect(highlights.get('nx-find-hit').size).toBe(3))
    expect(state().startsWith('3/')).toBe(true)
  })
})
