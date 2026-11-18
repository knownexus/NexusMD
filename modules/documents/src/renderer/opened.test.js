import { describe, it, expect, vi } from 'vitest'
import { createOpenedFiles } from './opened.js'

// A file opened with the desktop app (double-click, "Open with") becomes a
// document for its editor. Path-backed Markdown instead stays linked to its
// original file so Save can write it back in place.
function memStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}
const make = () => {
  const storage = memStorage()
  return { storage, opened: createOpenedFiles({ storage, profileKey: k => `p1:${k}` }) }
}

describe('files opened with the desktop app', () => {
  it('adds a Markdown file to the Markdown documents of the active profile', () => {
    const { storage, opened } = make()
    const r = opened.add({ name: 'notes.md', text: '# Plan\nbody' })
    expect(r).toMatchObject({ tool: 'markdown', created: true, name: 'notes' })
    const saved = JSON.parse(storage.getItem('p1:md_documents')).docs
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: 'notes', content: '# Plan\nbody' })
  })

  it('keeps a path-backed Markdown file out of managed document storage', () => {
    const { storage, opened } = make()
    const r = opened.add({ name: 'readme.md', text: '# Original', path: 'C:\\work\\readme.md', stamp: 'abc', bom: true })
    expect(r).toMatchObject({ tool: 'markdown', source: { path: 'C:\\work\\readme.md', stamp: 'abc', bom: true } })
    expect(storage.getItem('p1:md_documents')).toBeNull()
    expect(opened.getSnapshot()).toMatchObject({ tool: 'markdown', source: { path: 'C:\\work\\readme.md', text: '# Original' } })
  })

  it('adds a JSON file to the JSON editor documents, as a plain array, even when it does not parse', () => {
    const { storage, opened } = make()
    expect(opened.add({ name: 'ok.json', text: '{"a":1}' })).toMatchObject({ tool: 'json', created: true })
    expect(opened.add({ name: 'broken.json', text: '{"a":' })).toMatchObject({ tool: 'json', created: true })
    const saved = JSON.parse(storage.getItem('p1:json_editor_documents'))
    expect(Array.isArray(saved)).toBe(true)
    expect(saved.map(d => d.content)).toEqual(['{"a":1}', '{"a":'])
  })

  it('keeps a path-backed JSON file out of managed document storage', () => {
    const { storage, opened } = make()
    expect(opened.add({ name: 'settings.json', text: '{"theme":"dark"}', path: 'C:\\work\\settings.json' }))
      .toMatchObject({ tool: 'json', source: { path: 'C:\\work\\settings.json' }, created: false })
    expect(storage.getItem('p1:json_editor_documents')).toBeNull()
    expect(opened.getSnapshot()).toMatchObject({ count: 1, tool: 'json', source: { text: '{"theme":"dark"}' } })
  })

  it('refuses a file that is neither, so nothing is saved for it', () => {
    const { storage, opened } = make()
    expect(() => opened.add({ name: 'a.ts', text: 'x' })).toThrow(/Markdown or JSON/)
    expect(() => opened.add({ name: 'a.txt', text: 'x' })).toThrow(/Markdown or JSON/)
    expect(storage.getItem('p1:md_documents')).toBeNull()
    expect(storage.getItem('p1:json_editor_documents')).toBeNull()
  })

  it('opening the same unchanged file again brings its document forward instead of making a copy, and still counts as an arrival', () => {
    const { storage, opened } = make()
    opened.add({ name: 'a.md', text: 'one' })
    const again = opened.add({ name: 'a.md', text: 'one' })
    expect(again.created).toBe(false)
    expect(JSON.parse(storage.getItem('p1:md_documents')).docs).toHaveLength(1)
    expect(opened.getSnapshot().count).toBe(2)
  })

  it('does not take a file over the 2 MB limit', () => {
    const { opened } = make()
    expect(() => opened.add({ name: 'big.md', text: 'x'.repeat(2 * 1024 * 1024 + 1) })).toThrow(/too large/)
    expect(opened.getSnapshot().count).toBe(0)
  })

  it('tells listeners which tool the last file went to, and that another arrived', () => {
    const { opened } = make()
    const seen = vi.fn()
    const off = opened.subscribe(seen)
    expect(opened.getSnapshot()).toEqual({ count: 0, tool: 'markdown', docId: null })
    opened.add({ name: 'a.json', text: '{}' })
    expect(opened.getSnapshot()).toEqual({ count: 1, tool: 'json', docId: null })
    opened.add({ name: 'b.md', text: 'b' })
    expect(opened.getSnapshot()).toEqual({ count: 2, tool: 'markdown', docId: null })
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    opened.add({ name: 'c.md', text: 'c' })
    expect(seen).toHaveBeenCalledTimes(2)
  })
})

describe('showing one saved document (a Home shortcut)', () => {
  const seed = (storage) => {
    storage.setItem('p1:md_documents', JSON.stringify({ docs: [{ id: 'm1', name: null, autoName: 'Plan', content: '# Plan' }] }))
    storage.setItem('p1:json_editor_documents', JSON.stringify([{ id: 'j1', name: 'cfg', autoName: 'cfg', content: '{}' }]))
  }

  it('asks the screen to show a saved Markdown or JSON document, in its tool', () => {
    const { storage, opened } = make()
    seed(storage)
    const seen = vi.fn()
    opened.subscribe(seen)
    expect(opened.openDoc({ tool: 'markdown', docId: 'm1' })).toEqual({ ok: true })
    expect(opened.getSnapshot()).toEqual({ count: 1, tool: 'markdown', docId: 'm1' })
    expect(opened.openDoc({ tool: 'json', docId: 'j1' })).toEqual({ ok: true })
    expect(opened.getSnapshot()).toEqual({ count: 2, tool: 'json', docId: 'j1' })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('says no, and changes nothing, for a document that is gone or in the other tool', () => {
    const { storage, opened } = make()
    seed(storage)
    const seen = vi.fn()
    opened.subscribe(seen)
    for (const spec of [{ tool: 'markdown', docId: 'gone' }, { tool: 'json', docId: 'm1' }, { tool: 'regex', docId: 'm1' }, { tool: 'markdown' }, undefined]) {
      expect(opened.openDoc(spec)).toEqual({ ok: false })
    }
    expect(opened.getSnapshot().count).toBe(0)
    expect(seen).not.toHaveBeenCalled()
  })

  it('says no when the store is empty or unreadable', () => {
    const { storage, opened } = make()
    expect(opened.openDoc({ tool: 'markdown', docId: 'm1' })).toEqual({ ok: false })
    storage.setItem('p1:md_documents', '{broken')
    expect(opened.openDoc({ tool: 'markdown', docId: 'm1' })).toEqual({ ok: false })
  })

  it('a file opened afterwards shows its own newest document, not the named one', () => {
    const { storage, opened } = make()
    seed(storage)
    opened.openDoc({ tool: 'markdown', docId: 'm1' })
    opened.add({ name: 'new.md', text: 'fresh' })
    expect(opened.getSnapshot().docId).toBeNull()
  })
})
