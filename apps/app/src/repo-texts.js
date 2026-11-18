// repo-texts.js — the texts of a branch's in-scope files, for searching them on the phone. A scope of 60 files or
// fewer is fetched one by one; a bigger one is downloaded as the branch zip. Texts are kept in memory by commit, so a
// repeat search costs nothing until the branch moves on. Everything is read at the commit the tree was listed at.
import { inScope, rendererLog, ignore } from '@nexusmd/core';

const log = rendererLog('git', 'repo-search');

export const FILE_FETCH_LIMIT = 60;   // up to this many in-scope files are fetched one by one
const MAX_FILE = 1024 * 1024;         // text files over 1 MB are not searched
const CONCURRENCY = 4;

// `${repoId}|${branch}|${commit}|${path}` → the file's text, or null for a file that is not searchable text (so it is
// not asked for again). Only the latest commit of a branch is kept.
const cache = new Map();
const prefixOf = (repo, branch) => `${repo.id}|${branch}|`;

const aborted = () => Object.assign(new Error('The search was cancelled.'), { name: 'AbortError' });
const check = (signal) => { if (signal?.aborted) throw aborted(); };

// A text a search can use: not too big, no NUL byte, and valid UTF-8 (a U+FFFD means it was not).
const usable = (text) => typeof text === 'string' && text.length <= MAX_FILE && !text.includes('\u0000') && !text.includes('�');

/** Forgets the loaded texts of one repository (by id), or of all of them. */
export function clearRepoTexts(repoId) {
  for (const key of [...cache.keys()]) if (!repoId || key.startsWith(`${repoId}|`)) cache.delete(key);
}

/** How many files are held (the ones that are not text count too). */
export const repoTextsCacheSize = () => cache.size;

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
  // Files are read at the commit that was listed, so a push in between cannot mix two commits. With no commit known
  // the branch name is used and nothing is cached, since nothing would say when it was out of date.
  const ref = commit ? { commit } : branch;
  const key = (p) => (commit ? `${prefixOf(repo, branch)}${commit}|${p}` : null);
  const have = (p) => (key(p) && cache.has(key(p)) ? cache.get(key(p)) : undefined);
  const missing = wanted.filter(p => have(p) === undefined);
  const via = total <= FILE_FETCH_LIMIT ? 'files' : 'zip';
  const fresh = new Map();   // path → text, or null when it is not searchable text

  if (via === 'files') {
    let done = total - missing.length;
    onProgress?.({ done, total });
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const path = missing[next++];
        check(signal);
        let text = null;
        try { text = await backend.getFile(repo, ref, '/' + path); } catch (e) { ignore(log, 'a file that cannot be shown as text is left out of the search', e, 'debug'); }
        fresh.set(path, usable(text) ? text : null);
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
    const unpacked = await backend.downloadZip(repo, ref, { signal, include: (p) => wantedSet.has(p) });
    check(signal);
    for (const f of unpacked) if (wantedSet.has(f.path)) fresh.set(f.path, usable(f.text) ? f.text : null);
    // What the zip did not give back (binary, too big, not UTF-8, not in it) is remembered as not text.
    for (const p of missing) if (!fresh.has(p)) fresh.set(p, null);
  }

  if (commit) {
    // The branch moved on: the earlier commits' texts are of no further use.
    const current = `${prefixOf(repo, branch)}${commit}|`;
    for (const k of [...cache.keys()]) if (k.startsWith(prefixOf(repo, branch)) && !k.startsWith(current)) cache.delete(k);
    for (const [path, text] of fresh) cache.set(key(path), text);
  }
  const files = [];
  for (const path of wanted) {
    const text = fresh.has(path) ? fresh.get(path) : have(path);
    if (typeof text === 'string') files.push({ path, text });
  }
  return { files, commit, via, total };
}
