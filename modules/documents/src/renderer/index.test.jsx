import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { NexusDataProvider } from '@nexusmd/ui'
import { getProfileKey } from '@nexusmd/shell-sdk'
import documents from './index.js'
import { openedFiles } from './opened.js'

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

describe('Documents app', () => {
  it('owns the markdown view', () => {
    expect(documents.id).toBe('documents')
    expect(typeof documents.views.markdown).toBe('function')
  })
})

describe('Documents app: files opened with the desktop app', () => {
  const fakeHost = () => {
    const provided = {}
    return { provided, navigate: vi.fn(), capabilities: { provide: (name, fn) => { provided[name] = fn } } }
  }

  it('offers documents.openFile, which saves the file as a document and shows the Documents screen', async () => {
    const host = fakeHost()
    documents.activate(host)
    expect(typeof host.provided['documents.openFile']).toBe('function')
    const r = await host.provided['documents.openFile']({ name: 'plan.md', text: '# Plan' })
    expect(r).toMatchObject({ tool: 'markdown', created: true, name: 'plan' })
    expect(JSON.parse(localStorage.getItem(getProfileKey('md_documents'))).docs[0]).toMatchObject({ name: 'plan', content: '# Plan' })
    expect(host.navigate).toHaveBeenCalledWith('markdown')
  })

  it('does not show the Documents screen for a file it could not take', async () => {
    const host = fakeHost()
    documents.activate(host)
    await expect(host.provided['documents.openFile']({ name: 'a.ts', text: 'x' })).rejects.toThrow(/Markdown or JSON/)
    expect(host.navigate).not.toHaveBeenCalled()
  })

  it('shows a JSON file that arrives in the JSON editor, as it is', () => {
    const Screen = documents.views.markdown
    render(<NexusDataProvider value={{ storage: localStorage, getProfileKey, pushPref: () => {} }}><Screen /></NexusDataProvider>)
    act(() => { openedFiles.add({ name: 'settings.json', text: '{"theme":"dark"}' }) })
    expect(screen.getByText('dark')).toBeTruthy()
    expect(screen.getByText('Valid JSON')).toBeTruthy()
  })
})

describe('Documents app: a Home shortcut to one saved document', () => {
  const fakeHost = () => {
    const provided = {}
    return { provided, navigate: vi.fn(), capabilities: { provide: (name, fn) => { provided[name] = fn } } }
  }
  const seed = () => {
    localStorage.setItem(getProfileKey('md_documents'), JSON.stringify({ docs: [
      { id: 'old', name: null, autoName: 'Old', content: '# Old\n\nfrom before', createdAt: 1, updatedAt: 1 },
      { id: 'new', name: null, autoName: 'New', content: '# New\n\nlast edited', createdAt: 2, updatedAt: 9 },
    ] }))
    localStorage.setItem(getProfileKey('json_editor_documents'), JSON.stringify([
      { id: 'j1', name: 'cfg', autoName: 'cfg', content: '{"theme":"dark"}', createdAt: 1, updatedAt: 1 },
    ]))
  }

  it('offers documents.openDoc, which shows the screen for a saved document and says so', () => {
    seed()
    const host = fakeHost()
    documents.activate(host)
    expect(host.provided['documents.openDoc']({ tool: 'markdown', docId: 'old' })).toBe(true)
    expect(host.navigate).toHaveBeenCalledWith('markdown')
  })

  it('does not go to the screen for a document that no longer exists', () => {
    seed()
    const host = fakeHost()
    documents.activate(host)
    expect(host.provided['documents.openDoc']({ tool: 'markdown', docId: 'gone' })).toBe(false)
    expect(host.navigate).not.toHaveBeenCalled()
  })

  it('shows the named Markdown document, not the newest, on the screen', () => {
    seed()
    const Screen = documents.views.markdown
    const { container } = render(<NexusDataProvider value={{ storage: localStorage, getProfileKey, pushPref: () => {} }}><Screen /></NexusDataProvider>)
    act(() => { openedFiles.openDoc({ tool: 'markdown', docId: 'old' }) })
    expect(container.querySelector('textarea').value).toBe('# Old\n\nfrom before')
  })

  it('shows the named JSON document on the JSON editor', () => {
    seed()
    const Screen = documents.views.markdown
    render(<NexusDataProvider value={{ storage: localStorage, getProfileKey, pushPref: () => {} }}><Screen /></NexusDataProvider>)
    act(() => { openedFiles.openDoc({ tool: 'json', docId: 'j1' }) })
    expect(screen.getByText('dark')).toBeTruthy()
  })
})

describe('Documents app: several files opened with the app are tabs', () => {
  const Screen = documents.views.markdown
  const withData = ui => <NexusDataProvider value={{ storage: localStorage, getProfileKey, pushPref: () => {} }}>{ui}</NexusDataProvider>
  const md = (name, text = `# ${name}`) => ({ name, text, path: `C:/tabs/${name}`, stamp: `s-${name}`, bom: false })
  const editor = () => document.querySelector('textarea')
  const closeAll = () => act(() => { for (const t of [...openedFiles.getSnapshot().tabs]) openedFiles.close(t.path) })
  afterEach(() => { closeAll(); vi.restoreAllMocks() })

  it('shows a tab for each file and the newest one’s text', () => {
    render(withData(<Screen />))
    act(() => { openedFiles.add(md('one.md')); openedFiles.add(md('two.md')); openedFiles.add(md('three.md')) })
    expect(screen.getAllByRole('tab', { name: /\.md/ })).toHaveLength(3)
    expect(editor().value).toBe('# three.md')
  })

  it('switching tabs shows each file’s own text, including unsaved edits', () => {
    render(withData(<Screen />))
    act(() => { openedFiles.add(md('one.md')); openedFiles.add(md('two.md')) })
    fireEvent.change(editor(), { target: { value: 'edited two' } })
    fireEvent.click(screen.getByRole('tab', { name: /one\.md/ }))
    expect(editor().value).toBe('# one.md')
    fireEvent.click(screen.getByRole('tab', { name: /two\.md/ }))
    expect(editor().value).toBe('edited two')
    expect(screen.getByRole('tab', { name: /two\.md/ }).textContent).toMatch(/●/)
  })

  it('a file changed on disk updates an unedited tab, and asks about an edited one', () => {
    render(withData(<Screen />))
    act(() => { openedFiles.add(md('one.md')); openedFiles.add(md('two.md')) })
    act(() => { openedFiles.diskChanged('C:/tabs/two.md', { text: '# two from disk', stamp: 'x1' }) })
    expect(editor().value).toBe('# two from disk')
    fireEvent.change(editor(), { target: { value: 'my edit' } })
    act(() => { openedFiles.diskChanged('C:/tabs/two.md', { text: '# two again', stamp: 'x2' }) })
    expect(editor().value).toBe('my edit')
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(editor().value).toBe('# two again')
  })

  it('closing a tab with unsaved edits asks first, and a declined close keeps it', () => {
    render(withData(<Screen />))
    act(() => { openedFiles.add(md('one.md')) })
    fireEvent.change(editor(), { target: { value: 'unsaved' } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Close one.md' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: /one\.md/ })).toBeTruthy()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close one.md' }))
    expect(screen.queryByRole('tab', { name: /one\.md/ })).toBeNull()
  })

  it('closing a clean tab does not ask, and closing the last returns to the plain screen', () => {
    render(withData(<Screen />))
    act(() => { openedFiles.add(md('one.md')) })
    const confirm = vi.spyOn(window, 'confirm')
    fireEvent.click(screen.getByRole('button', { name: 'Close one.md' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('tab', { name: /\.md/ })).toBeNull()
    expect(editor()).toBeTruthy()
  })
})
