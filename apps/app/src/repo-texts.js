// repo-texts.js — the texts of a branch's in-scope files, for searching them on the phone. A scope of 60 files or
// fewer is fetched one by one; a bigger one is downloaded as the branch zip. Texts are kept in memory by commit, so a
// repeat search costs nothing until the branch moves on.
import { inScope, rendererLog, ignore } from '@nexusmd/core';

const log = rendererLog('git', 'repo-search');

export const FILE_FETCH_LIMIT = 60;   // up to this many in-scope files are fetched one by one
const CONCURRENCY = 4;

const cache = new Map();              // `${repoId}|${branch}|${commit}|${path}` → text
const keyOf = (repo, branch, commit, path) => `${repo.id}|${branch}|${commit}|${path}`;

const aborted = () => Object.assign(new Error('The search was cancelled.'), { name: 'AbortError' });
const check = (signal) => { if (signal?.aborted) throw aborted(); };

/** Forgets the loaded texts of one repository (by id), or of all of them. */
export function clearRepoTexts(repoId) {
  for (const key of [...cache.keys()]) if (!repoId || key.startsWith(`${repoId}|`)) cache.delete(key);
}

/**
 * The in-scope files of `branch` with their texts: { files: [{ path, text }], commit, via: 'files' | 'zip', total }.
 * `total` is how many files are in scope; files that cannot be read as text are left out of `files`.
 * `onProgress({ done, total })` is called while files are fetched one by one. `confirm({ total })` is awaited before a
 * zip is downloaded; false cancels. Rejects with an AbortError when `signal` aborts or the download is declined.
 */
export async function loadRepoTexts({ backend, repo, branch, scope = {}, signal = null, onProgress = null, confirm = null }) {
  const { files: all, commit } = await backend.listTree(repo, branch);
  check(signal);
  const wanted = all.filter(p => inScope(p, scope));
  const total = wanted.length;
  // A branch with no known commit is never cached, since nothing would say when it was out of date.
  const key = (p) => (commit ? keyOf(repo, branch, commit, p) : null);
  const have = (p) => (key(p) && cache.has(key(p)) ? cache.get(key(p)) : undefined);
  const missing = wanted.filter(p => have(p) === undefined);
  const via = total <= FILE_FETCH_LIMIT ? 'files' : 'zip';
  const fresh = new Map();

  if (via === 'files') {
    let done = total - missing.length;
    onProgress?.({ done, total });
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const path = missing[next++];
        check(signal);
        let text = null;
        try { text = await backend.getFile(repo, branch, '/' + path); } catch (e) { ignore(log, 'a file that cannot be shown as text is left out of the search', e, 'debug'); }
        if (typeof text === 'string') fresh.set(path, text);
        done++;
        onProgress?.({ done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
    check(signal);
  } else if (missing.length) {
    // A download is asked about first, since it can be large; one already downloaded for this commit is not.
    if (confirm && !(await confirm({ total }))) throw aborted();
    check(signal);
    const wantedSet = new Set(wanted);
    const unpacked = await backend.downloadZip(repo, branch, { signal, include: (p) => wantedSet.has(p) });
    check(signal);
    for (const f of unpacked) if (wantedSet.has(f.path)) fresh.set(f.path, f.text);
  }

  for (const [path, text] of fresh) if (key(path)) cache.set(key(path), text);
  const files = [];
  for (const path of wanted) {
    const text = fresh.has(path) ? fresh.get(path) : have(path);
    if (typeof text === 'string') files.push({ path, text });
  }
  return { files, commit, via, total };
}
