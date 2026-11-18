import React from 'react'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { TextPreview } from './file-preview.jsx'

afterEach(cleanup)

// jsdom has no layout; CodeMirror measures ranges when it scrolls a match into view.
beforeAll(() => {
  Range.prototype.getClientRects = () => []
  Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
})

const ctrlF = () => fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
const status = () => document.querySelector('[role="search"] [aria-live]').textContent

describe('TextPreview find', () => {
  it('Ctrl+F finds in the code view: counts matches and marks them in CodeMirror', async () => {
    const { container } = render(<TextPreview path="a.txt" loadKey="1" load={() => ({ text: 'foo bar\nFoo baz' })} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    ctrlF()
    fireEvent.change(screen.getByLabelText('Find in file'), { target: { value: 'foo' } })
    await waitFor(() => expect(container.querySelectorAll('.cm-find-hit')).toHaveLength(2))
    expect(status()).toBe('1 of 2')
    fireEvent.keyDown(screen.getByLabelText('Find in file'), { key: 'Enter' })
    await waitFor(() => expect(status()).toBe('2 of 2'))
    expect(container.querySelector('.cm-find-current').textContent).toBe('Foo')
  })
  it('Escape closes the bar and clears the marks', async () => {
    const { container } = render(<TextPreview path="a.txt" loadKey="1" load={() => ({ text: 'foo' })} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    ctrlF()
    fireEvent.change(screen.getByLabelText('Find in file'), { target: { value: 'foo' } })
    await waitFor(() => expect(container.querySelectorAll('.cm-find-hit')).toHaveLength(1))
    fireEvent.keyDown(screen.getByLabelText('Find in file'), { key: 'Escape' })
    await waitFor(() => expect(container.querySelectorAll('.cm-find-hit')).toHaveLength(0))
    expect(screen.queryByLabelText('Find in file')).toBeNull()
  })
  it('marks matches in a rendered-markdown view', async () => {
    const renderText = () => <div data-testid="md" dangerouslySetInnerHTML={{ __html: '<p>foo and foo</p>' }} />
    render(<TextPreview path="a.md" loadKey="1" load={() => ({ text: '# x' })} renderText={renderText} />)
    await screen.findByTestId('md')
    ctrlF()
    fireEvent.change(screen.getByLabelText('Find in file'), { target: { value: 'foo' } })
    await waitFor(() => expect(screen.getByTestId('md').querySelectorAll('mark[data-find]')).toHaveLength(2))
    expect(status()).toBe('1 of 2')
  })
  it('shows no bar for a file that is not shown as text', async () => {
    render(<TextPreview path="a.bin" loadKey="1" load={() => ({ text: null, note: 'Binary file' })} />)
    await screen.findByText(/Binary file/)
    ctrlF()
    expect(screen.queryByLabelText('Find in file')).toBeNull()
  })
  it('opens the find bar on a given term and jumps to a given line', async () => {
    const { container } = render(<TextPreview path="a.txt" loadKey="1" line={{ line: 3 }} findQuery="foo" load={() => ({ text: ['one', 'two', 'foo three', 'foo'].join('\n') })} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    expect(await screen.findByLabelText('Find in file')).toBeTruthy()
    expect(screen.getByLabelText('Find in file').value).toBe('foo')
    await waitFor(() => expect(container.querySelectorAll('.cm-find-hit')).toHaveLength(2))
  })
  it('makes the match on the clicked line the current one, not the first in the file', async () => {
    const text = ['foo one', 'two', 'three', 'foo four', 'foo five'].join(String.fromCharCode(10))
    const { container } = render(<TextPreview path="a.txt" loadKey="1" line={{ line: 4 }} findQuery="foo" load={() => ({ text })} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    await waitFor(() => expect(document.querySelector('[role="search"] [aria-live]').textContent).toBe('2 of 3'))
    expect(container.querySelector('.cm-find-current').textContent).toBe('foo')
  })
})
