import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOpenedFiles } from './opened.js'
import { watchTabs } from './watch-tabs.js'

// Keeps the open tabs in step with their files: the main process watches them (editor.watch) and says when one changes; the
// tabs are also read again when the window comes back into focus, in case a watcher missed something.
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const md = (name, text = `# ${name}`, stamp = `s-${name}`) => ({ name, text, stamp, path: `/w/${name}`, bom: false })

let store, api, win, changed
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  store = createOpenedFiles({ storage: memStorage(), profileKey: k => k })
  changed = null
  win = new EventTarget()
  api = {
    watch: vi.fn(async () => {}),
    unwatch: vi.fn(async () => {}),
    onFileChanged: vi.fn(fn => { changed = fn }),
    read: vi.fn(async p => ({ path: p, text: 'from disk', stamp: 'new', bom: false })),
  }
})

describe('watching the open tabs', () => {
  it('watches a path when its tab opens and unwatches it when the tab closes', () => {
    const stop = watchTabs({ api, store, win })
    store.add(md('a.md')); store.add(md('b.md'))
    expect(api.watch).toHaveBeenCalledWith(['/w/a.md'])
    expect(api.watch).toHaveBeenCalledWith(['/w/b.md'])
    store.close('/w/a.md')
    expect(api.unwatch).toHaveBeenCalledWith(['/w/a.md'])
    stop()
  })

  it('does not watch a path twice, or again when only its text changes', () => {
    const stop = watchTabs({ api, store, win })
    store.add(md('a.md'))
    store.update('/w/a.md', { text: 'x', dirty: true })
    store.activate('/w/a.md')
    expect(api.watch).toHaveBeenCalledTimes(1)
    stop()
  })

  it('watches tabs that were already open when it started', () => {
    store.add(md('a.md'))
    const stop = watchTabs({ api, store, win })
    expect(api.watch).toHaveBeenCalledWith(['/w/a.md'])
    stop()
  })

  it('applies a file-changed message to its tab', () => {
    const stop = watchTabs({ api, store, win })
    store.add(md('a.md'))
    changed({ path: '/w/a.md', text: 'edited elsewhere', stamp: 'x2' })
    expect(store.getSnapshot().tabs[0]).toMatchObject({ text: 'edited elsewhere', stamp: 'x2' })
    changed({ path: '/w/a.md', missing: true })
    expect(store.getSnapshot().tabs[0].missing).toBe(true)
    stop()
  })

  it('reads every open tab again when the window gets focus, and applies what changed', async () => {
    const stop = watchTabs({ api, store, win })
    store.add(md('a.md')); store.add(md('b.md'))
    win.dispatchEvent(new Event('focus'))
    await flush()
    expect(api.read).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().tabs.map(t => t.stamp)).toEqual(['new', 'new'])
    stop()
  })

  it('treats a file that cannot be read on focus as removed, and keeps the text', async () => {
    api.read = vi.fn(async () => ({ missing: true }))
    const stop = watchTabs({ api, store, win })
    store.add(md('a.md'))
    win.dispatchEvent(new Event('focus'))
    await flush()
    expect(store.getSnapshot().tabs[0]).toMatchObject({ missing: true, text: '# a.md' })
    stop()
  })

  it('ignores a failing read on focus without losing the other tabs', async () => {
    api.read = vi.fn(async p => { if (p === '/w/a.md') throw new Error('EBUSY'); return { text: 'ok', stamp: 'n', bom: false } })
    const stop = watchTabs({ api, store, win })
    store.add(md('a.md')); store.add(md('b.md'))
    win.dispatchEvent(new Event('focus'))
    await flush()
    expect(store.getSnapshot().tabs.map(t => t.stamp)).toEqual(['s-a.md', 'n'])
    stop()
  })

  it('stops reacting after stop()', async () => {
    const stop = watchTabs({ api, store, win })
    stop()
    store.add(md('a.md'))
    win.dispatchEvent(new Event('focus'))
    await flush()
    expect(api.watch).not.toHaveBeenCalled()
    expect(api.read).not.toHaveBeenCalled()
  })

  it('does nothing, and does not throw, without the watch bridge', () => {
    const stop = watchTabs({ api: { read: api.read }, store, win })
    expect(() => store.add(md('a.md'))).not.toThrow()
    expect(store.getSnapshot().tabs).toHaveLength(1)
    stop()
  })
})
