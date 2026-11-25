import { rendererLog, ignore } from '@nexusmd/core'

const log = rendererLog('documents', 'watch-tabs')

// Keeps the open tabs in step with their files on disk. The main process watches the paths (api.watch) and reports a change
// (api.onFileChanged), which goes to the tab's store; and since a watcher can miss a change (it is an OS notification), every tab
// is also read again when the window regains focus. Returns stop().
//   api    window.electronAPI.editor: { watch, unwatch, onFileChanged, read }; without watch there is nothing to do
//   store  the opened-files store (opened.js)
export function watchTabs({ api, store, win = globalThis.window }) {
  if (!api?.watch) return () => {}
  let stopped = false
  const watched = new Set()

  const sync = () => {
    if (stopped) return
    const open = new Set(store.getSnapshot().tabs.map(t => t.path))
    const added = [...open].filter(p => !watched.has(p))
    const removed = [...watched].filter(p => !open.has(p))
    for (const p of added) watched.add(p)
    for (const p of removed) watched.delete(p)
    // Each path goes in its own call: a path the main process refuses must not stop the others being watched.
    for (const p of added) Promise.resolve(api.watch([p])).catch(e => log.warn('a file could not be watched for changes', e))
    for (const p of removed) Promise.resolve(api.unwatch?.([p])).catch(e => ignore(log, 'a file that is no longer open could not be unwatched', e, 'debug'))
  }

  const unsubscribe = store.subscribe(sync)
  api.onFileChanged?.((msg) => { if (!stopped && msg?.path) store.diskChanged(msg.path, msg) })

  const recheck = async () => {
    for (const { path } of store.getSnapshot().tabs) {
      try {
        const r = await api.read(path)
        if (stopped) return
        store.diskChanged(path, r?.missing ? { missing: true } : { text: r.text, stamp: r.stamp })
      } catch (e) {
        ignore(log, 'a file could not be read again on focus; its tab keeps what it has', e, 'debug')
      }
    }
  }
  win?.addEventListener?.('focus', recheck)

  sync()
  return () => {
    stopped = true
    unsubscribe()
    win?.removeEventListener?.('focus', recheck)
    if (watched.size) Promise.resolve(api.unwatch?.([...watched])).catch(e => ignore(log, 'files could not be unwatched at shutdown', e, 'debug'))
    watched.clear()
  }
}
