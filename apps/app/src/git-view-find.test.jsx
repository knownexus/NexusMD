import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
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
})
