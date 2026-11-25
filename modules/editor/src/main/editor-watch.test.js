// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createWatcher } = require('./editor-watch.cjs')

// A stand-in for fs.watch: remembers each handle so a test can fire events at it.
function fakeFs() {
  const handles = []
  const fsWatch = vi.fn((path, _opts, listener) => {
    const h = { path, listener, closed: false, close() { h.closed = true } }
    handles.push(h)
    return h
  })
  return { fsWatch, handles, live: p => handles.filter(h => h.path === p && !h.closed) }
}

const FILE = '/work/a.md'
let fsx, send, read

beforeEach(() => {
  vi.useFakeTimers()
  fsx = fakeFs()
  send = vi.fn()
  read = vi.fn().mockResolvedValue({ text: 'v1', stamp: 's1', bom: false })
})
afterEach(() => { vi.useRealTimers() })

const make = (extra = {}) => createWatcher({ read, send, debounceMs: 100, fsWatch: fsx.fsWatch, ...extra })
const fire = async (path, type = 'change') => { fsx.live(path)[0].listener(type); await vi.advanceTimersByTimeAsync(150) }

describe('editor file watcher', () => {
  it('emits file-changed once for a burst of events', async () => {
    const w = make(); w.watch([FILE])
    const h = fsx.live(FILE)[0]
    h.listener('change'); h.listener('change'); h.listener('change')
    await vi.advanceTimersByTimeAsync(150)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('editor:file-changed', { path: FILE, text: 'v1', stamp: 's1', bom: false })
  })

  it('does not emit when the stamp equals the last one sent', async () => {
    const w = make(); w.watch([FILE])
    await fire(FILE); await fire(FILE)
    expect(send).toHaveBeenCalledTimes(1)
    read.mockResolvedValue({ text: 'v2', stamp: 's2', bom: false })
    await fire(FILE)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('emits missing when the read reports the file gone', async () => {
    read.mockResolvedValue({ missing: true })
    const w = make(); w.watch([FILE])
    await fire(FILE)
    expect(send).toHaveBeenCalledWith('editor:file-changed', { path: FILE, missing: true })
  })

  it('keeps watching after a rename event (an editor saving by replacing the file)', async () => {
    const w = make(); w.watch([FILE])
    const first = fsx.live(FILE)[0]
    await fire(FILE, 'rename')
    expect(first.closed).toBe(true)
    expect(fsx.live(FILE)).toHaveLength(1)
    read.mockResolvedValue({ text: 'v2', stamp: 's2', bom: false })
    await fire(FILE)
    expect(send).toHaveBeenLastCalledWith('editor:file-changed', expect.objectContaining({ stamp: 's2' }))
  })

  it('watches a path once however often it is asked', () => {
    const w = make(); w.watch([FILE]); w.watch([FILE])
    expect(fsx.handles).toHaveLength(1)
  })

  it('unwatch stops events and closes the handle', async () => {
    const w = make(); w.watch([FILE])
    const h = fsx.live(FILE)[0]
    h.listener('change')
    w.unwatch([FILE])
    await vi.advanceTimersByTimeAsync(150)
    expect(h.closed).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('dispose closes every handle', () => {
    const w = make(); w.watch([FILE, '/work/b.md'])
    w.dispose()
    expect(fsx.handles.every(h => h.closed)).toBe(true)
  })

  it('retries a path that cannot be watched yet (file mid-replace) until it can', async () => {
    let fail = true
    const fsWatch = vi.fn((path, o, l) => { if (fail) throw Object.assign(new Error('gone'), { code: 'ENOENT' }); return fsx.fsWatch(path, o, l) })
    const w = make({ fsWatch })
    w.watch([FILE])
    expect(fsx.handles).toHaveLength(0)
    fail = false
    await vi.advanceTimersByTimeAsync(1200)
    expect(fsx.live(FILE)).toHaveLength(1)
    w.dispose()
  })
})
