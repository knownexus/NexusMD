import { addOpenedDocument, addOpenedJsonDocument, documentNameOf, isMarkdownFile, isJsonFile, savedDocIds } from '@nexusmd/core'
import { getProfileKey } from '@nexusmd/shell-sdk'

// Files the desktop app was opened with (double-click, "Open with") that are Markdown or JSON: each becomes a saved document, a
// copy kept in the app, in the tool's own store under the active profile's key (the same stores the tools read, as on Android).
// A path-backed Markdown file is a tab: it stays linked to its file, keeps its own text, stamp and unsaved state, and the snapshot's
// `source` is the active tab. A change on disk reaches a tab through `diskChanged`: a tab with no unsaved edits takes the new text; one
// with edits keeps them and records the new text as `conflict` for the person to decide (`reloadFromDisk` / `keepMine`).
// The Documents screen watches `getSnapshot()`: `count` rises with each arrival, so it shows the newest document in `tool`
// (or, for `openDoc`, the one named by `docId`).
const STORE_KEYS = { markdown: 'md_documents', json: 'json_editor_documents' }
export function createOpenedFiles({ storage = globalThis.localStorage, profileKey = getProfileKey } = {}) {
  // `viewing` says what `source` is: 'tab' (the active tab) or 'other' (a JSON file or a saved document, which tabs changing leave alone).
  let snapshot = { count: 0, tool: 'markdown', docId: null, tabs: [], activePath: null, viewing: 'other' }
  const listeners = new Set()
  const emit = (next) => { snapshot = next; listeners.forEach(fn => fn()) }
  // One file, however it is spelled: slashes and case do not tell two paths apart on Windows.
  const keyOf = path => String(path).replace(/\\/g, '/').toLowerCase()
  const indexOfTab = (path) => snapshot.tabs.findIndex(t => keyOf(t.path) === keyOf(path))
  const withTabs = (tabs, activePath = snapshot.activePath, over = {}) => {
    const next = { ...snapshot, ...over, tabs, activePath }
    return { ...next, source: next.viewing === 'tab' ? tabs.find(t => t.path === activePath) ?? null : next.source }
  }
  const patchTab = (path, fn) => {
    const i = indexOfTab(path)
    if (i < 0) return
    const next = fn(snapshot.tabs[i])
    if (next === snapshot.tabs[i]) return
    const tabs = snapshot.tabs.map((t, j) => (j === i ? next : t))
    emit(withTabs(tabs))
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    /** Adds { name, text } to the Markdown or JSON documents. Throws a message fit to show when it cannot. */
    add(file) {
      const tool = isJsonFile(file) ? 'json' : isMarkdownFile(file) ? 'markdown' : null
      if (!tool) {
        throw new Error(`${file?.name || 'That file'} is not a Markdown or JSON file.`)
      }
      // A native path means the desktop shell has handed us a real file. Keep
      // that source session in memory instead of serialising a second copy of
      // its text into the profile's managed-documents store.
      if (file?.path && tool === 'markdown') {
        const i = indexOfTab(file.path)
        const tab = { path: file.path, name: file.name, text: String(file.text ?? ''), stamp: file.stamp ?? null, bom: !!file.bom, dirty: false, conflict: null, missing: false }
        const known = i >= 0 ? snapshot.tabs[i] : null
        // Opened again: the tab that is already there is shown, with the file's current text when it has no unsaved edits.
        const kept = known ? (known.dirty ? { ...known, conflict: known.stamp !== tab.stamp ? { text: tab.text, stamp: tab.stamp } : known.conflict } : { ...known, ...tab, path: known.path, name: known.name }) : tab
        const tabs = known ? snapshot.tabs.map((t, j) => (j === i ? kept : t)) : [...snapshot.tabs, kept]
        emit(withTabs(tabs, kept.path, { count: snapshot.count + 1, tool, docId: null, viewing: 'tab' }))
        return { tool, source: kept, created: false, name: documentNameOf(file.name) }
      }
      if (file?.path) {
        const source = { path: file.path, name: file.name, text: String(file.text ?? ''), stamp: file.stamp ?? null, bom: !!file.bom }
        emit({ ...snapshot, count: snapshot.count + 1, tool, docId: null, source, viewing: 'other' })
        return { tool, source, created: false, name: documentNameOf(file.name) }
      }
      const result = tool === 'json'
        ? addOpenedJsonDocument(storage, file, { key: profileKey('json_editor_documents') })
        : addOpenedDocument(storage, file, { key: profileKey('md_documents') })
      emit({ ...snapshot, count: snapshot.count + 1, tool, docId: null, source: undefined, viewing: 'other' })
      return { tool, ...result, name: documentNameOf(file.name) }
    },
    /** Shows the tab for a path. */
    activate(path) {
      const t = snapshot.tabs[indexOfTab(path)]
      // Shown again even when it is the active one: the person may have been in another tool or on a saved document since.
      if (t) emit(withTabs(snapshot.tabs, t.path, { count: snapshot.count + 1, tool: 'markdown', docId: null, viewing: 'tab' }))
    },
    /** Closes a tab; the one beside it is shown (none when it was the last). */
    close(path) {
      const i = indexOfTab(path)
      if (i < 0) return
      const tabs = snapshot.tabs.filter((_, j) => j !== i)
      const wasActive = snapshot.tabs[i].path === snapshot.activePath
      const active = wasActive ? (tabs[Math.min(i, tabs.length - 1)]?.path ?? null) : snapshot.activePath
      emit(withTabs(tabs, active))
    },
    /** What the viewer reports about a tab: { text, stamp, dirty } after an edit or a save. */
    update(path, patch) {
      patchTab(path, (t) => {
        const { savedText, ...rest } = patch
        // A save reports the text it wrote: edits made while it ran keep the tab unsaved, and a conflict at the stamp it made is our own.
        if (savedText !== undefined) return { ...t, ...rest, dirty: t.text !== savedText, conflict: t.conflict?.stamp === rest.stamp ? null : t.conflict }
        return { ...t, ...rest }
      })
    },
    /** The file changed on disk: { text, stamp }, or { missing: true } when it is gone. */
    diskChanged(path, change) {
      patchTab(path, t => {
        if (change.missing) return t.missing ? t : { ...t, missing: true }
        if (change.stamp === t.stamp && !t.missing) return t
        if (t.dirty) return t.conflict?.stamp === change.stamp ? t : { ...t, conflict: { text: change.text, stamp: change.stamp }, missing: false }
        return { ...t, text: change.text, stamp: change.stamp, conflict: null, missing: false }
      })
    },
    /** Takes the disk's text over the tab's unsaved edits. */
    reloadFromDisk(path) {
      patchTab(path, t => (t.conflict ? { ...t, text: t.conflict.text, stamp: t.conflict.stamp, dirty: false, conflict: null } : t))
    },
    /** Keeps the tab's edits and adopts the disk's stamp, so the next save writes them over the disk's version. */
    keepMine(path) {
      patchTab(path, t => (t.conflict ? { ...t, stamp: t.conflict.stamp, conflict: null } : t))
    },
    /** Shows one saved document, by id, in its tool (a Home shortcut). { ok: false } when there is no such document. */
    openDoc({ tool, docId } = {}) {
      const key = STORE_KEYS[tool]
      if (!key || !savedDocIds(storage.getItem(profileKey(key))).some(d => d.id === docId)) return { ok: false }
      emit({ ...snapshot, count: snapshot.count + 1, tool, docId, source: undefined, viewing: 'other' })
      return { ok: true }
    },
  }
}

// The one the running app uses.
export const openedFiles = createOpenedFiles()
