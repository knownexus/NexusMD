import React from 'react'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { RepoSearchPanel } from './repo-search-panel.jsx'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const repo = { name: 'Work', path: 'C:/work' }
const reply = {
  results: [
    { path: 'src/a.cs', matches: [{ line: 2, text: 'a foo b', start: 2, end: 5 }, { line: 9, text: 'foo again', start: 0, end: 3 }] },
    { path: 'docs/r.md', matches: [{ line: 1, text: 'Foo', start: 0, end: 3 }] },
  ],
  capped: false,
}
const mount = (grep = vi.fn(async () => reply), onOpen = vi.fn()) => {
  const adapter = { grep }
  const view = render(<RepoSearchPanel adapter={adapter} repo={repo} worktreePath="C:/work" registered={['C:/work']} onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: /search in files/i }))
  return { grep, onOpen, ...view }
}
const search = q => {
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: q } })
  fireEvent.keyDown(screen.getByLabelText('Search text'), { key: 'Enter' })
}

describe('RepoSearchPanel', () => {
  it('runs the search on Enter with the query, case option and scope', async () => {
    const { grep } = mount()
    search('foo')
    await screen.findByText('src/a.cs')
    expect(grep).toHaveBeenCalledWith(repo, 'C:/work', ['C:/work'], 'foo', { matchCase: false, folders: [], extensions: [] })
  })
  it('lists the results grouped by file with line numbers and the match marked', async () => {
    mount()
    search('foo')
    const group = (await screen.findByText('src/a.cs')).closest('[role="group"]')
    expect(within(group).getByText('2')).toBeTruthy()
    expect(within(group).getByText('9')).toBeTruthy()
    expect([...group.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['foo', 'foo'])
    expect(screen.getByText('docs/r.md')).toBeTruthy()
  })
  it('opens a result with its path, line and the query', async () => {
    const { onOpen } = mount()
    search('foo')
    const row = (await screen.findByText('9')).closest('button')
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith('src/a.cs', 9, 'foo')
  })
  it('shows only the latest search when an earlier one answers late', async () => {
    let first
    const grep = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { first = r }))
      .mockImplementationOnce(async () => ({ results: [{ path: 'second.txt', matches: [{ line: 1, text: 'x', start: 0, end: 1 }] }], capped: false }))
    mount(grep)
    search('one')
    search('two')
    await screen.findByText('second.txt')
    first(reply)
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByText('src/a.cs')).toBeNull()
    expect(screen.getByText('second.txt')).toBeTruthy()
  })
  it('passes Match case through', async () => {
    const { grep } = mount()
    fireEvent.click(screen.getByLabelText('Match case'))
    search('Foo')
    await screen.findByText('src/a.cs')
    expect(grep.mock.calls[0][4]).toMatchObject({ matchCase: true })
  })
  it('parses the scope fields and remembers them for the repo', async () => {
    const { grep, unmount } = mount()
    fireEvent.change(screen.getByLabelText('Folders'), { target: { value: 'src, docs' } })
    fireEvent.change(screen.getByLabelText('File types'), { target: { value: '.cs js' } })
    search('foo')
    await screen.findByText('src/a.cs')
    expect(grep.mock.calls[0][4]).toMatchObject({ folders: ['src', 'docs'], extensions: ['cs', 'js'] })
    unmount()
    mount()
    expect(screen.getByLabelText('Folders').value).toBe('src, docs')
    expect(screen.getByLabelText('File types').value).toBe('.cs js')
  })
  it('says when the results were cut short, when nothing matched, and when it failed', async () => {
    const { unmount } = mount(vi.fn(async () => ({ ...reply, capped: true })))
    search('foo')
    expect(await screen.findByText(/first matches/i)).toBeTruthy()
    unmount()
    const { unmount: u2 } = mount(vi.fn(async () => ({ results: [], capped: false })))
    search('zzz')
    expect(await screen.findByText('No matches')).toBeTruthy()
    u2()
    mount(vi.fn(async () => { throw new Error('git grep failed') }))
    search('x')
    expect((await screen.findByRole('alert')).textContent).toMatch(/git grep failed/)
  })
  it('does not search for an empty query', () => {
    const { grep } = mount()
    fireEvent.keyDown(screen.getByLabelText('Search text'), { key: 'Enter' })
    expect(grep).not.toHaveBeenCalled()
  })
  it('reads a Windows folder path with backslashes as a folder path', async () => {
    const { grep } = mount()
    fireEvent.change(screen.getByLabelText('Folders'), { target: { value: ['src', 'lib'].join(String.fromCharCode(92)) } })
    search('foo')
    await screen.findByText('src/a.cs')
    expect(grep.mock.calls[0][4].folders).toEqual(['src/lib'])
  })
})
