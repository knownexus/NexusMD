import { isMarkdownFile, isJsonFile, rendererLog } from '@nexusmd/core'
import { baseName, ipcMessage } from './editor-store.js'

const log = rendererLog('editor', 'open-files')

// Files the desktop app is opened with (double-click, "Open with"), routed as on Android: a Markdown or JSON file becomes a saved
// document in the Documents app, anything else opens in the Editor. Documents is a separate app, so it is used only when it
// offers documents.openFile; without it the Editor takes every file, as it did before.
export function createOpenHandler({ store, api, host, notify }) {
  const documentsTakes = path => (isMarkdownFile({ name: baseName(path) }) || isJsonFile({ name: baseName(path) }))
    && host.capabilities.has('documents.openFile')

  const toEditor = path => { store.openPath(path); host.navigate('editor') }

  async function toDocuments(path) {
    const name = baseName(path)
    let file
    try {
      // A folder named like a file (docs.md) is still a folder.
      const st = await api.stat(path)
      if (st?.kind !== 'file') return toEditor(path)
      const read = await api.read(path)
      file = { name, text: read.text, path: read.path || path, stamp: read.stamp ?? null, bom: !!read.bom }
    } catch (e) {
      log.warn('a file the app was opened with could not be read', e)
      notify(`Could not open ${name}: ${ipcMessage(e) || 'the file could not be read.'}`, 'error')
      return
    }
    try {
      await host.capabilities.call('documents.openFile', file)
      notify(`Opened ${name}`, 'success')
    } catch (e) {
      log.warn('a file the app was opened with could not be added to the documents', e)
      notify(ipcMessage(e) || `Could not open ${name}.`, 'error')
    }
  }

  // Windows starts the app once per selected file, so several arrive together. Documents get their files one after
  // another, in the order given: read side by side, the fastest would come first and the last opened would be a matter of luck.
  let queue = Promise.resolve()
  return function open(paths) {
    for (const path of paths) {
      if (documentsTakes(path)) queue = queue.then(() => toDocuments(path))
      else toEditor(path)
    }
  }
}
