import React from 'react'
import { CodeEditor, languageForPath } from '@nexusmd/editor-kit/code-editor.jsx'
import { useFind, FindBar, useFindShortcut, useDomFind } from '@nexusmd/ui'
import { ipcMessage } from './use-git-actions.js'
import { fileStats, formatSize } from './file-stats.js'

// Given to the find hooks while there is nothing to search: closed, and Ctrl+F does nothing.
const NO_FIND = { open: false, query: '', matchCase: false, index: 0, count: 0, report() {}, setOpen() {} }

/**
 * A file's text, read-only and highlighted, for the explorer's preview. `load()` resolves
 * { text } or { missing: true } or { text: null, note } (why it isn't shown: binary, too large),
 * and is called again whenever `loadKey` changes. `extra` follows a note (e.g. a link to GitHub).
 * `markedLines` ([1-based line, …]) are tinted as changed; `showStatus` adds the footer (language, lines,
 * size, line endings, encoding). `renderText(text)` draws the text some other way than the code view (rendered
 * Markdown).
 */
export function TextPreview({ path, load, loadKey, extra = null, markedLines = null, showStatus = false, renderText = null }) {
  const [state, setState] = React.useState({ status: 'loading' })
  const latest = React.useRef(load)
  latest.current = load
  React.useEffect(() => {
    let live = true
    setState(s => (s.status === 'ready' && s.path === path ? s : { status: 'loading' }))
    Promise.resolve().then(() => latest.current()).then(
      r => { if (live) setState(r?.missing ? { status: 'missing' } : r?.text == null ? { status: 'note', note: r?.note } : { status: 'ready', path, text: r.text }) },
      e => { if (live) setState({ status: 'error', error: ipcMessage(e) || String(e) }) },
    )
    return () => { live = false }
  }, [path, loadKey])
  const lineClasses = React.useMemo(() => (markedLines?.length ? markedLines.map(n => [n, 'nx-gw-changed-line']) : null), [markedLines])

  // Find in the file. The code view (CodeMirror) marks matches itself; rendered Markdown is searched in the page.
  const find = useFind()
  const rootRef = React.useRef(null)
  const codeApi = React.useRef(null)
  const renderedRef = React.useRef(null)
  const ready = state.status === 'ready'
  const codeActive = ready && !renderText
  useFindShortcut(rootRef, ready ? find : NO_FIND)
  useDomFind(renderedRef, ready && renderText ? find : NO_FIND, state.text)
  const { open: findOpen, query: findQuery, matchCase: findCase, index: findIndex, report: findReport } = find
  React.useEffect(() => {
    const api = codeApi.current
    if (!codeActive || !api) return
    if (!findOpen || !findQuery) { api.clearFind(); findReport(0); return }
    findReport(api.find(findQuery, { matchCase: findCase, index: findIndex }))
  }, [codeActive, path, state.text, findOpen, findQuery, findCase, findIndex, findReport])

  if (state.status === 'loading') return <div className="nx-gw-fx-note nx-gw-fx-pad">Loading…</div>
  if (state.status === 'error') return <div role="alert" className="nx-alert bad nx-gw-fx-pad">{state.error}</div>
  if (state.status === 'missing') return <div className="nx-gw-fx-note nx-gw-fx-pad">This file isn’t there any more.</div>
  if (state.status === 'note') return <div className="nx-gw-fx-note nx-gw-fx-pad">{state.note}{extra && <> {extra}</>}</div>
  if (renderText) {
    return (
      <div ref={rootRef} style={{ display: 'contents' }}>
        <FindBar find={find} />
        <div ref={renderedRef} style={{ display: 'contents' }}>{renderText(state.text)}</div>
      </div>
    )
  }
  const stats = showStatus ? fileStats(state.text, path) : null
  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      <FindBar find={find} />
      <div className="nx-gw-fx-code">
        <CodeEditor key={path} value={state.text} language={languageForPath(path)} ariaLabel={`Preview of ${path}`} readOnly lineClasses={lineClasses}
          apiRef={codeApi} onFind={() => find.setOpen(true)} />
      </div>
      {stats && (
        <div role="status" aria-label="File details" className="nx-gw-fx-status">
          <span>{stats.language}</span>
          <span>{`${stats.lines.toLocaleString()} ${stats.lines === 1 ? 'line' : 'lines'}`}</span>
          <span>{formatSize(stats.bytes)}</span>
          <span>{stats.eol}</span>
          <span>{stats.encoding}</span>
        </div>
      )}
    </div>
  )
}
