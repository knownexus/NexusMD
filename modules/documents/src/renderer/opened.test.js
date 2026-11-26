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
    expect(opened.getSnapshot()).toMatchObject({ count: 0, tool: 'markdown', docId: null })
    opened.add({ name: 'a.json', text: '{}' })
    expect(opened.getSnapshot()).toMatchObject({ count: 1, tool: 'json', docId: null })
    opened.add({ name: 'b.md', text: 'b' })
    expect(opened.getSnapshot()).toMatchObject({ count: 2, tool: 'markdown', docId: null })
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
    expect(opened.getSnapshot()).toMatchObject({ count: 1, tool: 'markdown', docId: 'm1' })
    expect(opened.openDoc({ tool: 'json', docId: 'j1' })).toEqual({ ok: true })
    expect(opened.getSnapshot()).toMatchObject({ count: 2, tool: 'json', docId: 'j1' })
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

describe('tabs for path-backed Markdown files', () => {
  const md = (name, extra = {}) => ({ name, text: `# ${name}`, path: `C:/work/${name}`, stamp: `s-${name}`, bom: false, ...extra })
  const tabsOf = o => o.getSnapshot().tabs.map(t => t.name)

  it('adds a tab per path and makes the newest active', () => {
    const { opened } = make()
    opened.add(md('a.md')); opened.add(md('b.md'))
    expect(tabsOf(opened)).toEqual(['a.md', 'b.md'])
    expect(opened.getSnapshot().activePath).toBe('C:/work/b.md')
    expect(opened.getSnapshot().source).toMatchObject({ name: 'b.md', text: '# b.md' })
  })

  it('a second add of the same path (other case or slashes) activates instead of duplicating', () => {
    const { opened } = make()
    opened.add(md('a.md')); opened.add(md('b.md'))
    opened.add({ ...md('a.md'), path: 'c:\\work\\A.md' })
    expect(tabsOf(opened)).toEqual(['a.md', 'b.md'])
    expect(opened.getSnapshot().activePath).toBe('C:/work/a.md')
  })

  it('ten adds in a burst give ten tabs, the last one active', () => {
    const { opened } = make()
    for (let i = 0; i < 10; i++) opened.add(md(`f${i}.md`))
    expect(opened.getSnapshot().tabs).toHaveLength(10)
    expect(opened.getSnapshot().activePath).toBe('C:/work/f9.md')
  })

  it('activate switches the source to that tab, keeping its unsaved text', () => {
    const { opened } = make()
    opened.add(md('a.md')); opened.add(md('b.md'))
    opened.update('C:/work/a.md', { text: 'edited', dirty: true })
    opened.activate('C:/work/a.md')
    expect(opened.getSnapshot().source).toMatchObject({ name: 'a.md', text: 'edited', dirty: true })
  })

  it('diskChanged on a clean tab replaces its text and stamp', () => {
    const { opened } = make()
    opened.add(md('a.md'))
    opened.diskChanged('C:/work/a.md', { text: 'new', stamp: 's2' })
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ text: 'new', stamp: 's2', dirty: false, conflict: null })
  })

  it('diskChanged on a dirty tab keeps the text and records a conflict', () => {
    const { opened } = make()
    opened.add(md('a.md'))
    opened.update('C:/work/a.md', { text: 'mine', dirty: true })
    opened.diskChanged('C:/work/a.md', { text: 'theirs', stamp: 's2' })
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ text: 'mine', stamp: 's-a.md', dirty: true, conflict: { text: 'theirs', stamp: 's2' } })
  })

  it('diskChanged with the tab’s current stamp is ignored (our own save echoing back)', () => {
    const { opened } = make()
    opened.add(md('a.md'))
    opened.update('C:/work/a.md', { text: 'mine', dirty: true })
    const before = opened.getSnapshot()
    opened.diskChanged('C:/work/a.md', { text: 'whatever', stamp: 's-a.md' })
    expect(opened.getSnapshot()).toBe(before)
  })

  it('reloadFromDisk applies the conflict and clears dirty', () => {
    const { opened } = make()
    opened.add(md('a.md'))
    opened.update('C:/work/a.md', { text: 'mine', dirty: true })
    opened.diskChanged('C:/work/a.md', { text: 'theirs', stamp: 's2' })
    opened.reloadFromDisk('C:/work/a.md')
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ text: 'theirs', stamp: 's2', dirty: false, conflict: null })
  })

  it('keepMine adopts the disk stamp so the next save goes through, and keeps the text', () => {
    const { opened } = make()
    opened.add(md('a.md'))
    opened.update('C:/work/a.md', { text: 'mine', dirty: true })
    opened.diskChanged('C:/work/a.md', { text: 'theirs', stamp: 's2' })
    opened.keepMine('C:/work/a.md')
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ text: 'mine', stamp: 's2', dirty: true, conflict: null })
  })

  it('a file removed from disk is flagged and its text kept', () => {
    const { opened } = make()
    opened.add(md('a.md'))
    opened.diskChanged('C:/work/a.md', { missing: true })
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ missing: true, text: '# a.md' })
  })

  it('closing the active tab activates a neighbour; closing the last leaves none', () => {
    const { opened } = make()
    opened.add(md('a.md')); opened.add(md('b.md')); opened.add(md('c.md'))
    opened.close('C:/work/c.md')
    expect(opened.getSnapshot().activePath).toBe('C:/work/b.md')
    opened.close('C:/work/a.md'); opened.close('C:/work/b.md')
    expect(opened.getSnapshot()).toMatchObject({ tabs: [], activePath: null })
  })

  it('JSON files still bypass the tabs', () => {
    const { opened } = make()
    opened.add({ name: 'x.json', text: '{}', path: 'C:\\work\\x.json', stamp: 'j' })
    expect(opened.getSnapshot().tabs).toEqual([])
    expect(opened.getSnapshot()).toMatchObject({ tool: 'json', source: { path: 'C:\\work\\x.json' } })
  })

  it('tabs changing leave a JSON file that is showing alone', () => {
    const { opened } = make()
    opened.add({ name: 'a.md', text: 'A', path: 'C:/work/a.md', stamp: 'a1' })
    opened.add({ name: 'x.json', text: '{}', path: 'C:/work/x.json', stamp: 'j' })
    opened.diskChanged('C:/work/a.md', { text: 'A2', stamp: 'a2' })
    expect(opened.getSnapshot()).toMatchObject({ tool: 'json', source: { path: 'C:/work/x.json' } })
    opened.close('C:/work/a.md')
    expect(opened.getSnapshot()).toMatchObject({ tool: 'json', source: { path: 'C:/work/x.json' } })
  })

  it('showing the active tab again emits, so it can be shown after another tool or document', () => {
    const { opened } = make()
    opened.add({ name: 'a.md', text: 'A', path: 'C:/work/a.md', stamp: 'a1' })
    const before = opened.getSnapshot().count
    opened.activate('C:/work/a.md')
    expect(opened.getSnapshot().count).toBe(before + 1)
  })

  it('a Markdown file without a path is not replaced by a tab when a tab changes on disk', () => {
    const { opened } = make()
    opened.add({ name: 'a.md', text: 'A', path: 'C:/work/a.md', stamp: 'a1' })
    opened.add({ name: 'loose.md', text: 'L' })
    expect(opened.getSnapshot().source).toBeUndefined()
    opened.diskChanged('C:/work/a.md', { text: 'A2', stamp: 'a2' })
    expect(opened.getSnapshot().source).toBeUndefined()
  })

  it('a save reports what it wrote: edits made meanwhile keep the tab unsaved', () => {
    const { opened } = make()
    opened.add({ name: 'a.md', text: 'one', path: 'C:/work/a.md', stamp: 'a1' })
    opened.update('C:/work/a.md', { text: 'one two', dirty: true })
    opened.update('C:/work/a.md', { stamp: 'a2', savedText: 'one' })
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ text: 'one two', stamp: 'a2', dirty: true })
    opened.update('C:/work/a.md', { stamp: 'a3', savedText: 'one two' })
    expect(opened.getSnapshot().tabs[0]).toMatchObject({ stamp: 'a3', dirty: false })
  })
})
