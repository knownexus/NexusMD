import React from 'react'
import { normaliseExtensions, rendererLog, ignore } from '@nexusmd/core'
import { Icon } from '@nexusmd/ui'
import { ipcMessage } from './use-git-actions.js'

const log = rendererLog('git', 'repo-search')
const scopeKey = repo => `git_search_scope:${repo?.path}`
const readScope = repo => {
  try { return { folders: '', extensions: '', ...JSON.parse(localStorage.getItem(scopeKey(repo)) || '{}') } } catch (e) { ignore(log, 'the saved search scope could not be read, so the default is used', e, 'debug'); return { folders: '', extensions: '' } }
}
const writeScope = (repo, scope) => { try { localStorage.setItem(scopeKey(repo), JSON.stringify(scope)) } catch (e) { ignore(log, 'the search scope could not be saved', e, 'debug') } }
const parseFolders = text => [...new Set(String(text).split(/[\n,]+/).map(f => f.trim().split(String.fromCharCode(92)).join('/')).filter(Boolean))]

// The text of a result row with the match marked.
function Snippet({ match }) {
  const { text, start, end } = match
  return <span className="nx-gw-search-text">{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</span>
}

/**
 * Searches the lines of the worktree's files (plain text), for a scope of folders and file types, and lists what it
 * finds grouped by file. `onOpen(path, line, query)` is called when a result is clicked. The scope is remembered per repo.
 */
export function RepoSearchPanel({ adapter, repo, worktreePath, registered, onOpen }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [matchCase, setMatchCase] = React.useState(false)
  const [scope, setScope] = React.useState(() => readScope(repo))
  const [state, setState] = React.useState({ status: 'idle' })
  const run = React.useRef(0)
  // A late answer to an earlier search, or to a panel that is gone, is dropped.
  React.useEffect(() => () => { run.current++ }, [])

  const changeScope = (key, value) => setScope(s => { const next = { ...s, [key]: value }; writeScope(repo, next); return next })
  const go = () => {
    const q = query.trim() ? query : ''
    if (!q) return
    const mine = ++run.current
    setState({ status: 'searching' })
    adapter.grep(repo, worktreePath, registered, q, { matchCase, folders: parseFolders(scope.folders), extensions: normaliseExtensions(scope.extensions) }).then(
      r => { if (mine === run.current) setState({ status: 'done', query: q, ...r }) },
      e => { if (mine === run.current) setState({ status: 'error', error: ipcMessage(e) || 'The search failed.' }) },
    )
  }

  return (
    <div className="nx-gw-search">
      <button type="button" className="nx-gw-search-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="search" size={12} /> Search in files
      </button>
      {open && (
        <div className="nx-gw-search-body">
          <div className="nx-gw-search-row">
            <input type="search" aria-label="Search text" placeholder="Find a line" value={query} spellCheck={false}
              onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go() }} />
            <button type="button" aria-label="Match case" title="Match case" aria-pressed={matchCase} onClick={() => setMatchCase(m => !m)}>Aa</button>
            <button type="button" onClick={go} disabled={state.status === 'searching'}>Search</button>
          </div>
          <div className="nx-gw-search-scope">
            <label>Folders
              <input type="text" aria-label="Folders" placeholder="all (e.g. src, docs)" value={scope.folders} spellCheck={false}
                onChange={e => changeScope('folders', e.target.value)} />
            </label>
            <label>File types
              <input type="text" aria-label="File types" placeholder="all (e.g. cs, js)" value={scope.extensions} spellCheck={false}
                onChange={e => changeScope('extensions', e.target.value)} />
            </label>
          </div>
          {state.status === 'searching' && <div className="nx-gw-fx-note" role="status">Searching…</div>}
          {state.status === 'error' && <div role="alert" className="nx-alert bad">{state.error}</div>}
          {state.status === 'done' && !state.results.length && <div className="nx-gw-fx-note">No matches</div>}
          {state.status === 'done' && state.results.length > 0 && (
            <div className="nx-gw-search-results">
              {state.results.map(file => (
                <div key={file.path} role="group" aria-label={file.path}>
                  <div className="nx-gw-search-file">{file.path}</div>
                  {file.matches.map(m => (
                    <button type="button" key={m.line} className="nx-gw-search-hit" onClick={() => onOpen?.(file.path, m.line, state.query)}>
                      <span className="nx-gw-search-line">{m.line}</span><Snippet match={m} />
                    </button>
                  ))}
                </div>
              ))}
              {state.capped && <div className="nx-gw-fx-note">Showing only the first matches; narrow the scope to see the rest.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
