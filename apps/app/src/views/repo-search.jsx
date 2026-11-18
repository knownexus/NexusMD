// repo-search.jsx — search the lines of a repository's files on the branch being looked at. The in-scope files are
// fetched one by one (a few) or from the branch zip (many; asked about first), searched on the phone, and listed
// by file. A result opens the file at its line (the Git screen's FileViewer, with the find bar on the term).
import React from 'react';
import { searchTexts, normaliseExtensions, rendererLog, ignore } from '@nexusmd/core';
import { Icon } from '../icons.jsx';
import { getProfileKey } from '../profile-keys.js';
import { loadRepoTexts, clearRepoTexts } from '../repo-texts.js';

const log = rendererLog('git', 'repo-search');

// The last finished search per repository and branch, so coming back from a result shows it again.
const last = new Map();
const lastKey = (repo, branch) => `${repo.id}|${branch}`;

/** Forgets the loaded texts and the last results of a repository (or of all): the repository was left. */
export function forgetRepoSearch(repoId) {
  clearRepoTexts(repoId);
  for (const key of [...last.keys()]) if (!repoId || key.startsWith(`${repoId}|`)) last.delete(key);
}

const scopeKey = (repo) => getProfileKey(`helm.git.search.${repo.id}`);
const readScope = (repo) => {
  try { return { folders: '', extensions: '', ...JSON.parse(localStorage.getItem(scopeKey(repo)) || '{}') }; } catch { return { folders: '', extensions: '' }; }
};
const writeScope = (repo, scope) => { try { localStorage.setItem(scopeKey(repo), JSON.stringify(scope)); } catch { /* storage full or blocked */ } };
// Every folder of the tree, keyed by its parent ('' for the top level), each with its subfolders' names, sorted.
export function folderTree(files) {
  const kids = new Map([['', new Set()]]);
  for (const file of files) {
    const parts = file.split('/').slice(0, -1);
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      if (!kids.has(parent)) kids.set(parent, new Set());
      kids.get(parent).add(parts[i]);
    }
  }
  return new Map([...kids].map(([k, v]) => [k, [...v].sort()]));
}
const parseFolders = (text) => [...new Set(String(text).split(/[\n,]+/).map(f => f.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean))];

function Snippet({ match }) {
  const { text, start, end } = match;
  return <span className="m-hit-tx">{text.slice(0, start)}<mark>{text.slice(start, end)}</mark>{text.slice(end)}</span>;
}

/**
 * The search screen. `onOpen(path, line, query)` opens a result; `onBack` leaves the screen. The scope (folders and
 * file types) is remembered per repository.
 */
export function RepoSearch({ backend, repo, branch, onOpen, onBack }) {
  const saved = last.get(lastKey(repo, branch));
  const [query, setQuery] = React.useState(saved?.query ?? '');
  const [matchCase, setMatchCase] = React.useState(saved?.matchCase ?? false);
  const [scope, setScope] = React.useState(() => readScope(repo));
  const [phase, setPhase] = React.useState(saved ? saved.phase : { name: 'idle' });
  const [tree, setTree] = React.useState(() => new Map());
  const [at, setAt] = React.useState(''); // the folder whose subfolders the chips show ('' is the top level)
  const ctl = React.useRef(null);

  // The folders, as chips for the scope that open into their subfolders.
  React.useEffect(() => {
    let live = true;
    setAt('');
    backend.listTree(repo, branch).then(
      ({ files }) => { if (live) setTree(folderTree(files)); },
      (e) => ignore(log, 'the folders for the scope chips could not be listed', e, 'debug'),
    );
    return () => { live = false; };
  }, [backend, repo, branch]);
  // Leaving the screen stops a search in flight.
  React.useEffect(() => () => ctl.current?.abort(), []);

  const changeScope = (key, value) => setScope(s => { const next = { ...s, [key]: value }; writeScope(repo, next); return next; });
  const folders = parseFolders(scope.folders);
  const toggleFolder = (path) => changeScope('folders', (folders.includes(path) ? folders.filter(f => f !== path) : [...folders, path]).join(', '));
  const here = tree.get(at) ?? [];
  const crumbs = at ? at.split('/') : [];

  const go = async () => {
    if (!query) return;
    ctl.current?.abort();
    const ctrl = new AbortController();
    ctl.current = ctrl;
    setPhase({ name: 'fetching', done: 0, total: 0 });
    try {
      const { files } = await loadRepoTexts({
        backend, repo, branch, scope: { folders, extensions: normaliseExtensions(scope.extensions) }, signal: ctrl.signal,
        onProgress: (p) => { if (!ctrl.signal.aborted) setPhase({ name: 'fetching', ...p }); },
        confirm: ({ total }) => new Promise(resolve => { setPhase({ name: 'asking', total, resolve }); }),
      });
      if (ctrl.signal.aborted) return;
      setPhase({ name: 'searching' });
      await new Promise(r => setTimeout(r, 0)); // lets "Searching…" show before the search holds the thread
      if (ctrl.signal.aborted) return;
      const result = searchTexts(files, query, { matchCase });
      const done = { name: 'done', query, files: files.length, ...result };
      setPhase(done);
      last.set(lastKey(repo, branch), { query, matchCase, phase: done });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e?.name === 'AbortError') setPhase({ name: 'idle' }); // the download was declined
      else setPhase({ name: 'error', error: e?.message || String(e) });
    }
  };
  const answer = (yes) => { phase.resolve(yes); if (yes) setPhase({ name: 'downloading' }); };

  const busy = ['fetching', 'downloading', 'searching'].includes(phase.name);
  return (
    <>
      <div className="m-appbar">
        <button type="button" className="m-iconbtn" onClick={onBack} aria-label="Back"><Icon name="chevron-left" size={18}/></button>
        <div className="m-ab-lead"><div><h1 style={{ fontSize: 17 }}>Search in files</h1><div className="m-ab-sub">{repo.name} · {branch}</div></div></div>
      </div>
      <div className="m-screen">
        <div className="m-search" style={{ marginBottom: 8 }}>
          <span className="si"><Icon name="search" size={16}/></span>
          <input type="search" enterKeyHint="search" aria-label="Search text" placeholder="Find a line" value={query} spellCheck={false}
            autoCapitalize="off" autoCorrect="off" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }}/>
        </div>
        <div className="m-docs-chips" style={{ marginBottom: 8 }}>
          <button type="button" className={`m-chip${matchCase ? ' active' : ''}`} aria-label="Match case" aria-pressed={matchCase} onClick={() => setMatchCase(m => !m)}>Aa</button>
          <button type="button" className="btn primary" onClick={go} disabled={busy || phase.name === 'asking'}>Search</button>
        </div>
        <div className="m-hint" style={{ marginBottom: 4 }}>Search only these folders and file types (empty means all).</div>
        {crumbs.length > 0 && (
          <nav className="m-crumbs" aria-label="Folder path" style={{ marginBottom: 2 }}>
            <button type="button" onClick={() => setAt('')}>All folders</button>
            {crumbs.map((name, i) => {
              const path = crumbs.slice(0, i + 1).join('/');
              return (
                <React.Fragment key={path}>
                  <span aria-hidden="true">/</span>
                  {i < crumbs.length - 1
                    ? <button type="button" onClick={() => setAt(path)}>{name}</button>
                    : <span aria-current="location" style={{ color: 'var(--text)' }}>{name}</span>}
                </React.Fragment>
              );
            })}
          </nav>
        )}
        {(here.length > 0 || at) && (
          <div className="m-docs-chips" style={{ marginBottom: 6 }}>
            {at && (
              <button type="button" className={`m-chip${folders.includes(at) ? ' active' : ''}`} aria-pressed={folders.includes(at)} onClick={() => toggleFolder(at)}>All of {crumbs[crumbs.length - 1]}</button>
            )}
            {here.map(name => {
              const path = at ? `${at}/${name}` : name;
              const on = folders.includes(path);
              return (
                <span key={path} className="m-folder-chip">
                  <button type="button" className={`m-chip${on ? ' active' : ''}`} aria-pressed={on} onClick={() => toggleFolder(path)}>{name}</button>
                  {tree.has(path) && (
                    <button type="button" className="m-chip" aria-label={`Open ${path}`} title={`Show the folders in ${name}`} onClick={() => setAt(path)}>
                      <Icon name="chevron-right" size={14}/>
                    </button>
                  )}
                </span>
              );
            })}
            {at && !here.length && <span className="m-hint" style={{ alignSelf: 'center' }}>No subfolders</span>}
          </div>
        )}
        <div className="m-fld" style={{ marginBottom: 6 }}>
          <label htmlFor="rs-folders">Folders</label>
          <input id="rs-folders" className="m-input" aria-label="Folders" placeholder="all, or src, docs/guides" value={scope.folders} spellCheck={false}
            autoCapitalize="off" onChange={e => changeScope('folders', e.target.value)}/>
        </div>
        <div className="m-fld" style={{ marginBottom: 12 }}>
          <label htmlFor="rs-types">File types</label>
          <input id="rs-types" className="m-input" aria-label="File types" placeholder="all, or cs, js" value={scope.extensions} spellCheck={false}
            autoCapitalize="off" onChange={e => changeScope('extensions', e.target.value)}/>
        </div>

        {phase.name === 'fetching' && <div className="muted" role="status">{phase.total ? `Fetching ${phase.done} of ${phase.total}…` : 'Listing the files…'}</div>}
        {phase.name === 'downloading' && <div className="muted" role="status">Downloading the branch…</div>}
        {phase.name === 'searching' && <div className="muted" role="status">Searching…</div>}
        {phase.name === 'asking' && (
          <div className="m-card" role="alertdialog" aria-label="Download the branch?">
            <div style={{ marginBottom: 8 }}>{`${phase.total} files are in scope. Download the branch to search them?`}</div>
            <div className="m-docs-chips">
              <button type="button" className="btn primary" onClick={() => answer(true)}>Download</button>
              <button type="button" className="btn" onClick={() => answer(false)}>Cancel</button>
            </div>
          </div>
        )}
        {phase.name === 'error' && <div className="m-error" role="alert">{phase.error}</div>}
        {phase.name === 'done' && phase.results.length === 0 && <div className="muted">No matches</div>}
        {phase.name === 'done' && phase.results.map(file => (
          <div key={file.path} role="group" aria-label={file.path}>
            <div className="m-sec-h"><span className="lbl">{file.path}</span><span className="line"/></div>
            <div className="m-card flush">
              {file.matches.map(m => (
                <button type="button" key={m.line} className="m-row m-hit" onClick={() => onOpen(file.path, m.line, phase.query)}>
                  <span className="m-hit-no">{m.line}</span><Snippet match={m}/>
                </button>
              ))}
            </div>
          </div>
        ))}
        {phase.name === 'done' && phase.capped && <div className="m-hint">Showing only the first matches; narrow the scope to see the rest.</div>}
      </div>
    </>
  );
}
