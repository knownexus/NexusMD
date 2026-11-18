import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('@capacitor/core', () => ({ CapacitorHttp: undefined }))

import { RepoSearch, forgetRepoSearch } from './repo-search.jsx'

const repo = { id: 'r1', name: 'alpha', project: 'P', provider: 'github', fullName: 'P/alpha' }
const TEXTS = {
  'src/a.cs': 'one\nfoo bar\nthree foo',
  'src/b.cs': 'nothing here',
  'docs/readme.md': 'Foo in docs',
  'tools/x.js': 'foo js',
}
const make = (files = Object.keys(TEXTS), over = {}) => ({
  listTree: vi.fn(async () => ({ files, commit: 'c1' })),
  getFile: vi.fn(async (_r, _b, p) => TEXTS[p.replace(/^\//, '')] ?? `foo in ${p}`),
  downloadZip: vi.fn(async (_r, _b, opts) => files.map(path => ({ path, text: TEXTS[path] ?? `foo in ${path}` })).filter(f => !opts?.include || opts.include(f.path))),
  ...over,
})
const mount = (backend = make(), onOpen = vi.fn(), onBack = vi.fn()) => {
  const view = render(<RepoSearch backend={backend} repo={repo} branch="main" onOpen={onOpen} onBack={onBack} />)
  return { backend, onOpen, onBack, ...view }
}
const search = q => {
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: q } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

beforeEach(() => { localStorage.clear(); forgetRepoSearch() })
afterEach(cleanup)

describe('RepoSearch', () => {
  it('fetches the in-scope files, then lists matches grouped by file with line numbers and the match marked', async () => {
    const { backend } = mount()
    search('foo')
    const group = (await screen.findByText('src/a.cs')).closest('[role="group"]')
    expect(within(group).getByText('2')).toBeTruthy()
    expect(within(group).getByText('3')).toBeTruthy()
    expect([...group.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['foo', 'foo'])
    expect(screen.getByText('docs/readme.md')).toBeTruthy()
    expect(screen.queryByText('src/b.cs')).toBeNull()
    expect(backend.downloadZip).not.toHaveBeenCalled()
  })
  it('opens a result with its path, line and the query', async () => {
    const { onOpen } = mount()
    search('foo')
    const row = (await screen.findByText('3')).closest('button')
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith('src/a.cs', 3, 'foo')
  })
  it('passes Match case through', async () => {
    mount()
    fireEvent.click(screen.getByLabelText('Match case'))
    search('Foo')
    await screen.findByText('docs/readme.md')
    expect(screen.queryByText('src/a.cs')).toBeNull()
  })
  it('limits the search to the chosen folders and file types', async () => {
    const { backend } = mount()
    fireEvent.change(screen.getByLabelText('Folders'), { target: { value: 'src' } })
    fireEvent.change(screen.getByLabelText('File types'), { target: { value: '.cs' } })
    search('foo')
    await screen.findByText('src/a.cs')
    expect(backend.getFile.mock.calls.map(c => c[2]).sort()).toEqual(['/src/a.cs', '/src/b.cs'])
    expect(screen.queryByText('docs/readme.md')).toBeNull()
  })
  it('offers the top-level folders as chips that add to the folders', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'docs' }))
    expect(screen.getByLabelText('Folders').value).toBe('docs')
    fireEvent.click(screen.getByRole('button', { name: 'src' }))
    expect(screen.getByLabelText('Folders').value).toBe('docs, src')
    fireEvent.click(screen.getByRole('button', { name: 'docs' }))
    expect(screen.getByLabelText('Folders').value).toBe('src')
  })
  it('opens a folder into its subfolders, selects a nested folder, and goes back up by the path', async () => {
    const files = ['src/app/main.cs', 'src/app/views/home.cs', 'src/lib/util.cs', 'src/top.cs', 'docs/readme.md']
    mount(make(files))
    expect(screen.queryByRole('button', { name: 'Open docs' })).toBeNull() // no subfolders, nothing to open
    fireEvent.click(await screen.findByRole('button', { name: 'Open src' }))
    expect(screen.queryByRole('button', { name: 'docs' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open src/app' }))
    fireEvent.click(screen.getByRole('button', { name: 'views' }))
    expect(screen.getByLabelText('Folders').value).toBe('src/app/views')
    fireEvent.click(screen.getByRole('button', { name: 'All of app' }))
    expect(screen.getByLabelText('Folders').value).toBe('src/app/views, src/app')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Folder path' })).getByRole('button', { name: 'src' }))
    expect(screen.getByRole('button', { name: 'lib' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'app' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'All folders' }))
    expect(screen.getByRole('button', { name: 'docs' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Folder path' })).toBeNull()
  })
  it('searches only a nested folder that was chosen', async () => {
    const files = ['src/app/a.cs', 'src/lib/b.cs']
    const { backend } = mount(make(files))
    fireEvent.click(await screen.findByRole('button', { name: 'Open src' }))
    fireEvent.click(screen.getByRole('button', { name: 'lib' }))
    search('foo')
    await screen.findByText('src/lib/b.cs')
    expect(backend.getFile.mock.calls.map(c => c[2])).toEqual(['/src/lib/b.cs'])
  })
  it('asks before downloading the branch when many files are in scope, and downloads only when told to', async () => {
    const many = Array.from({ length: 70 }, (_, i) => `src/f${i}.cs`)
    const { backend } = mount(make(many))
    search('foo')
    expect(await screen.findByText(/70 files/)).toBeTruthy()
    expect(backend.downloadZip).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await screen.findByText('src/f0.cs')
    expect(backend.downloadZip).toHaveBeenCalledTimes(1)
  })
  it('does not download when told to cancel', async () => {
    const many = Array.from({ length: 70 }, (_, i) => `src/f${i}.cs`)
    const { backend } = mount(make(many))
    search('foo')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Download' })).toBeNull())
    expect(backend.downloadZip).not.toHaveBeenCalled()
  })
  it('stops the search in flight when the screen is left', async () => {
    let seen
    const backend = make(Array.from({ length: 70 }, (_, i) => `src/f${i}.cs`), {
      downloadZip: vi.fn((_r, _b, opts) => { seen = opts.signal; return new Promise(() => {}) }),
    })
    const { unmount } = mount(backend)
    search('foo')
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }))
    await waitFor(() => expect(seen).toBeTruthy())
    unmount()
    expect(seen.aborted).toBe(true)
  })
  it('says when the results were cut short, when nothing matched, and when it failed', async () => {
    const lots = { listTree: vi.fn(async () => ({ files: ['big.txt'], commit: 'c1' })), getFile: vi.fn(async () => 'foo\n'.repeat(80)) }
    const first = mount(make(['big.txt'], lots))
    search('foo')
    expect(await screen.findByText(/first matches/i)).toBeTruthy()
    first.unmount()
    forgetRepoSearch()
    const second = mount()
    search('zzzqqq')
    expect(await screen.findByText('No matches')).toBeTruthy()
    second.unmount()
    forgetRepoSearch()
    mount(make(undefined, { listTree: vi.fn(async () => { throw new Error('rate limited') }) }))
    search('foo')
    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toMatch(/rate limited/)
  })
  it('shows the last results again when the screen comes back, with the same query', async () => {
    const first = mount()
    search('foo')
    await screen.findByText('src/a.cs')
    first.unmount()
    mount()
    expect(screen.getByLabelText('Search text').value).toBe('foo')
    expect(screen.getByText('src/a.cs')).toBeTruthy()
  })
  it('remembers the scope for the repository', async () => {
    const first = mount()
    fireEvent.change(screen.getByLabelText('Folders'), { target: { value: 'src' } })
    fireEvent.change(screen.getByLabelText('File types'), { target: { value: 'cs' } })
    first.unmount()
    forgetRepoSearch()
    mount()
    expect(screen.getByLabelText('Folders').value).toBe('src')
    expect(screen.getByLabelText('File types').value).toBe('cs')
  })
  it('does not search for an empty query', async () => {
    const { backend } = mount()
    await waitFor(() => expect(backend.listTree).toHaveBeenCalledTimes(1)) // the folder chips
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await new Promise(r => setTimeout(r, 20))
    expect(backend.listTree).toHaveBeenCalledTimes(1)
    expect(backend.getFile).not.toHaveBeenCalled()
  })
  it('goes back through the Back button', () => {
    const { onBack } = mount()
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
