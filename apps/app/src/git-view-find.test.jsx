import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('@capacitor/core', () => ({ CapacitorHttp: undefined }))

const fake = vi.hoisted(() => {
  const files = { '/a.txt': 'foo bar\nFoo baz\nqux foo', '/README.md': '# Title\n\nfoo and foo' }
  return {
    backend: {
      listRepos: async () => ({ repos: [{ id: 'r1', name: 'alpha', project: 'P', provider: 'ado' }], errors: [] }),
      listBranches: async () => [{ name: 'main', isDefault: true }],
      listItems: async () => [{ name: 'a.txt', path: '/a.txt', isFolder: false }, { name: 'README.md', path: '/README.md', isFolder: false }],
      getFile: async (_r, _b, path) => files[path],
      listCommits: async () => [],
      listTree: async () => ({ files: ['a.txt', 'README.md'], commit: 'c1' }),
    },
  }
})
vi.mock('./git-backend.js', async orig => ({ ...(await orig()), makeGitBackend: () => fake.backend }))

import { GitView } from './git-view.jsx'

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/git') })
afterEach(cleanup)

const openFile = async name => {
  fireEvent.click(await screen.findByText('alpha'))
  fireEvent.click(await screen.findByText(name))
}
const openFind = () => fireEvent.click(screen.getByLabelText('Find in file'))
const query = v => fireEvent.change(screen.getByRole('search').querySelector('input'), { target: { value: v } })
const status = () => document.querySelector('[role="search"] [aria-live]').textContent

describe('Git file viewer find', () => {
  it('the search button opens the bar; typing marks every match in a code file and counts them', async () => {
    render(<GitView />)
    await openFile('a.txt')
    await screen.findByText(/qux/)
    openFind()
    query('foo')
    expect(status()).toBe('1 of 3')
    const marks = document.querySelectorAll('.m-code mark[data-find]')
    expect(marks).toHaveLength(3)
    expect(marks[0].hasAttribute('data-find-current')).toBe(true)
    fireEvent.click(screen.getByLabelText('Next match'))
    expect(status()).toBe('2 of 3')
    expect(document.querySelectorAll('.m-code mark[data-find]')[1].hasAttribute('data-find-current')).toBe(true)
  })
  it('matching ignores case unless Match case is on', async () => {
    render(<GitView />)
    await openFile('a.txt')
    await screen.findByText(/qux/)
    openFind()
    fireEvent.click(screen.getByLabelText('Match case'))
    query('Foo')
    expect(status()).toBe('1 of 1')
  })
  it('closing the bar removes the marks', async () => {
    render(<GitView />)
    await openFile('a.txt')
    await screen.findByText(/qux/)
    openFind()
    query('foo')
    fireEvent.click(screen.getByLabelText('Close find'))
    expect(document.querySelectorAll('mark[data-find]')).toHaveLength(0)
    expect(screen.queryByRole('search')).toBeNull()
  })
  it('keeps the query across Rendered and Raw for a markdown file', async () => {
    render(<GitView />)
    await openFile('README.md')
    await screen.findByText('Title')
    openFind()
    query('foo')
    await waitFor(() => expect(document.querySelectorAll('.md-content mark[data-find]')).toHaveLength(2))
    expect(status()).toBe('1 of 2')
    fireEvent.click(screen.getByText('Raw'))
    await waitFor(() => expect(document.querySelectorAll('.m-code mark[data-find]')).toHaveLength(2))
    expect((screen.getByRole('search').querySelector('input')).value).toBe('foo')
  })
  it('keeps the bar pinned to the top of the scrolling screen, so jumping to a match does not scroll it away', async () => {
    render(<GitView />)
    await openFile('a.txt')
    await screen.findByText(/qux/)
    openFind()
    const bar = screen.getByRole('search')
    expect(bar.style.position).toBe('sticky')
    expect(bar.style.top).toBe('0px')
  })
})

describe('Git repo search', () => {
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const swipeBack = async () => { window.history.back(); await wait(30) }
  const openRepo = async () => { fireEvent.click(await screen.findByText('alpha')); await screen.findByText('a.txt') }
  const runSearch = async q => {
    fireEvent.click(screen.getByLabelText('Search in files'))
    fireEvent.change(await screen.findByLabelText('Search text'), { target: { value: q } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  }

  it('opens a result in the file viewer on its own match, with the term in the find bar', async () => {
    render(<GitView />)
    await openRepo()
    await runSearch('foo')
    const group = (await screen.findByText('a.txt', { selector: '.lbl' })).closest('[role="group"]')
    fireEvent.click(within(group).getByText('3').closest('button'))
    await screen.findByText(/qux/)
    await waitFor(() => expect(screen.getByRole('search').querySelector('input').value).toBe('foo'))
    await waitFor(() => expect(document.querySelector('[role="search"] [aria-live]').textContent).toBe('3 of 3'))
  })
  it('the back gesture goes from the file to the results, then to the repository', async () => {
    render(<GitView />)
    await openRepo()
    await runSearch('foo')
    const group = (await screen.findByText('a.txt', { selector: '.lbl' })).closest('[role="group"]')
    fireEvent.click(within(group).getByText('1').closest('button'))
    await screen.findByText(/qux/)
    await swipeBack()
    expect(await screen.findByText('a.txt', { selector: '.lbl' })).toBeTruthy()
    expect(screen.getByLabelText('Search text').value).toBe('foo')
    await swipeBack()
    expect(await screen.findByLabelText('Search in files')).toBeTruthy()
    expect(screen.queryByLabelText('Search text')).toBeNull()
  })
  it('shows a markdown result as raw text, so the line number is the source line', async () => {
    render(<GitView />)
    await openRepo()
    await runSearch('foo and')
    const group = (await screen.findByText('README.md', { selector: '.lbl' })).closest('[role="group"]')
    fireEvent.click(within(group).getByText('3').closest('button'))
    await waitFor(() => expect(document.querySelector('.m-code')).toBeTruthy())
  })
})
