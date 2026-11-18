# Repo search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Search the lines of a repo's files on the branch being viewed, with a chosen scope of folders and file types, on desktop Git (local repos) and Android Git (GitHub and Azure DevOps).

**Architecture:** Pure scope and search logic in `@nexusmd/core`. Desktop runs `git grep` in the main process and lists results in the Git file explorer. Android lists the branch's tree, applies the scope, fetches the few in-scope files (60 or fewer) or downloads the branch as a zip, searches the texts with the shared logic, and lists results. A result opens the file at its line with the find bar (#103) filled in.

**Tech Stack:** React, Electron main process (`git grep` via the existing `git` helper), Capacitor Android app, `jszip` (already in `apps/app`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-repo-search-design.md`

## Global Constraints

- Searches only the branch currently being viewed (desktop: the worktree as checked out; Android: the selected branch at its current commit id).
- Plain text, not regex; case-insensitive by default with a match-case toggle.
- Result caps: 200 files with matches, 50 matches per file, 1000 matches in total; the results say when capped.
- Scope is `{ folders: string[], extensions: string[] }`, empty meaning everything; remembered per repo.
- Android: 60 files or fewer in scope are fetched one by one; more than 60 use the zip. A branch zip over about 50 MB compressed is refused with a message. Only text files under 1 MB are searched.
- No free-form glob patterns; extensions are a typed list (`cs, js`, with or without a leading dot).
- Desktop covers local repos only (not the GitHub files tab).

## Review Focus

1. Query or pathspec text that looks like an option or regex (`-n`, `--`, `.*`, `(`, a folder named `-rf`) is searched literally and can never act as a git option.
2. A file with a 10 MB single line or a minified bundle does not flood the results or freeze the UI (long lines are cut in the snippet; caps hold).
3. Binary files, and files that are not valid UTF-8, are skipped without an error.
4. The branch moves on while a cached search exists (a new commit): the cache is not reused for the new commit.
5. Leaving the repo or starting another search cancels the one in flight; a late answer never replaces newer results, and no partial zip or half-fetched set is cached.

---

### Task 1: Core scope and text search

**Files:**
- Create: `packages/core/src/modules/repo-search/index.js`
- Modify: `packages/core/src/index.js` (add `export * from './modules/repo-search/index.js'`), `packages/core/tests/public-api.test.js` (add the new names to the list)
- Test: `packages/core/tests/repo-search.test.js`

**Interfaces:**
- Consumes: `findMatches(text, query, { matchCase, limit })` from `@nexusmd/core` (find module).
- Produces:
  - `SEARCH_CAPS = { files: 200, perFile: 50, total: 1000 }`
  - `normaliseExtensions(input: string): string[]` — splits on commas/spaces, lower-cases, strips leading dots, drops empties and duplicates.
  - `inScope(path: string, scope: { folders?: string[], extensions?: string[] }): boolean` — path is repo-relative with `/` separators and no leading slash; a folder matches itself and everything under it (`src` matches `src/a.js` but not `srcs/a.js`); extension compare is case-insensitive on the last `.ext`; both lists empty → true.
  - `searchTexts(files: Array<{ path: string, text: string }>, query: string, opts?: { matchCase?: boolean }): { results: Array<{ path: string, matches: Array<{ line: number, text: string, start: number, end: number }> }>, capped: boolean }` — `line` is 1-based, `text` the line cut to 300 characters around the match (with `start`/`end` offsets into that cut text), results in input order, only files with matches, caps from `SEARCH_CAPS` setting `capped`.

- [ ] **Step 1: Write the failing tests** in `repo-search.test.js`: `inScope('src/a.js', {folders:['src']})` true, `inScope('srcs/a.js', {folders:['src']})` false, `inScope('a/b.CS', {extensions:['cs']})` true, both empty true, folder and extension must both hold; `normaliseExtensions('.CS, js  ts,js')` → `['cs','js','ts']`; `searchTexts` finds line numbers for `foo` in `'a\nfoo\nbar foo'` → lines 2 and 3, honours matchCase, treats `'('` literally, skips files without matches; a 10 000-character line gives a `text` of at most 300 characters whose `text.slice(start,end)` equals the match; 60 matches in one file → 50 and `capped`; 250 files with a match → 200 and `capped`; 1100 matches over many files → total 1000 and `capped`.
- [ ] **Step 2: Run** `npx vitest run packages/core/tests/repo-search.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the four exports in `modules/repo-search/index.js`; build on `findMatches` per line; stop scanning once the total cap is reached.
- [ ] **Step 4: Run** the test file, then `npx vitest run packages/core` — expect PASS.
- [ ] **Step 5: Commit** `feat(core): repo search scope and text search`.

### Task 2: Desktop `git grep` (main process and adapter)

**Files:**
- Modify: `modules/git/src/main/git-files.cjs` (register `git:grep` in `registerFiles`, next to `git:files`), `modules/git/src/renderer/git-adapter.js` (add `grep`), `packages/core/src/adapters/index.js` (add `grep` to `IGitAdapter` with its contract comment)
- Test: `modules/git/src/main/git.grep.integration.test.js` (follows `git.files.integration.test.js`: temp repo, `register`, `call('git:grep', ...)`)

**Interfaces:**
- Consumes: the `git(wt, argv)` helper and `requireExactWorktree(repo, wt, registered)` already used by `git:files`; `SEARCH_CAPS` and `normaliseExtensions` from `@nexusmd/core` (or the same numbers if main cannot import ESM; the builder decides).
- Produces: `IGitAdapter.grep(repo, worktreePath, registered, query: string, options?: { matchCase?: boolean, folders?: string[], extensions?: string[] }) → Promise<{ results: Array<{ path, matches: [{ line, text, start, end }] }>, capped: boolean }>` — the same result shape as `searchTexts`; empty query → `{ results: [], capped: false }`.

- [ ] **Step 1: Write the failing integration tests** (temp repo with committed `src/a.cs` containing `foo bar`, `docs/readme.md` containing `Foo`, a binary file containing `foo`, an untracked `src/new.cs` containing `foo`, an ignored `x.log` containing `foo`): `grep('foo')` returns matches in `src/a.cs`, `docs/readme.md` and the untracked file (tracked plus untracked, not ignored), none from the binary or ignored file, with correct `line` and `start/end` offsets; `matchCase:true` drops `Foo`; `folders:['src']` limits to `src/`; `extensions:['md']` limits to `.md`; query `'-n'` and `'--help'` and `'(x'` are searched literally and return normally; a folder named `-rf` in `folders` is treated as a path; empty query → empty result; a file with 2 000 matching lines is capped at 50 per file with `capped: true`.
- [ ] **Step 2: Run** `npx vitest run modules/git/src/main/git.grep.integration.test.js` — expect FAIL (`git:grep` not registered).
- [ ] **Step 3: Implement** `git:grep`: run `git grep -n -I -F --no-color --untracked --exclude-standard [-i] -e <query> -- <pathspecs…>` (the `-e` form and the `--` separator keep text from being read as options; folders become `<folder>/` pathspecs with `:(literal)`, extensions become `:(glob)**/*.<ext>`); exit code 1 means no matches, not an error; parse `path:line:text`, find the match offsets with `findMatches`, cut long lines to 300 characters around the match, apply the caps while parsing and kill the process once they are reached. Wire `grep` through `git-adapter.js` and add it to `IGitAdapter`.
- [ ] **Step 4: Run** the integration test, then `npx vitest run modules/git` — expect PASS.
- [ ] **Step 5: Commit** `feat(git): git grep over a worktree`.

### Task 3: Desktop search panel in the Git file explorer

**Files:**
- Create: `modules/git/src/renderer/repo-search-panel.jsx`
- Modify: `modules/git/src/renderer/files-pane.jsx` (mount the panel beside the explorer's file filter; opening a result picks the file and opens the preview at the line), `modules/git/src/renderer/file-preview.jsx` (accept `line` and `findQuery` props: pass `line` to `CodeEditor` and open the find bar on `findQuery`)
- Test: `modules/git/src/renderer/repo-search-panel.test.jsx`

**Interfaces:**
- Consumes: `adapter.grep` (Task 2); `inScope`/`normaliseExtensions` are not needed here (the main process applies the scope).
- Produces: `RepoSearchPanel({ adapter, repo, worktreePath, registered, onOpen })` — a "Search in files" input (Enter or a Search button runs it), a "Match case" toggle, and a scope control (a text field for folders, one per line or comma-separated, and one for extensions); calls `adapter.grep` and lists results grouped by file (path, then `line  text` rows with the match marked); `onOpen(path, line, query)` when a row is clicked. Shows "Searching…", "No matches", an error, and "Showing the first 1000 matches" when `capped`. Cancels a stale answer when a newer search starts or the panel unmounts. Remembers the scope per repo in `localStorage` under `git_search_scope:<repo.path>`.

- [ ] **Step 1: Write the failing tests** (fake adapter with `grep`): typing and pressing Enter calls `adapter.grep` with the query and `{ matchCase, folders, extensions }`; results render grouped by file with line numbers and the marked match; clicking a row calls `onOpen(path, line, query)`; a second search started before the first answers shows only the second's results; "Match case" is passed through; the scope fields are parsed (`src, docs` → folders; `.cs js` → extensions) and remembered after a remount; capped results show the note; an empty result shows "No matches"; an error shows an alert. In `file-preview-find.test.jsx` add: `TextPreview` with `line={3}` and `findQuery="foo"` opens the find bar holding `foo`.
- [ ] **Step 2: Run** `npx vitest run modules/git/src/renderer/repo-search-panel.test.jsx modules/git/src/renderer/file-preview-find.test.jsx` — expect FAIL.
- [ ] **Step 3: Implement** the panel and the `TextPreview` props; mount it in `files-pane.jsx` so clicking a result picks the file in the tree and shows the preview scrolled to the line with the bar open.
- [ ] **Step 4: Run** the two files, then `npx vitest run modules/git/src/renderer` — expect PASS.
- [ ] **Step 5: Commit** `feat(git): search the lines of the files`.

### Task 4: Android repo texts (tree, files, zip) with a cache

**Files:**
- Modify: `apps/app/src/git-backend.js` (add `listTree`, `getTexts`; keep the existing methods), `apps/app/src/git-browser.js` (ADO: recursive tree and zip), `apps/app/src/github-client.js` (the binary download for the GitHub zipball and ADO zip, through the existing native HTTP path)
- Create: `apps/app/src/repo-texts.js`
- Test: `apps/app/src/repo-texts.test.js`, `apps/app/src/git-backend.test.js` (extend)

**Interfaces:**
- Consumes: existing `listItems`/`getFile` per provider; `inScope` from core; `jszip`.
- Produces:
  - `backend.listTree(repo, branch) → Promise<{ files: string[], commit: string }>` — every file path (repo-relative, no leading slash) on the branch and the branch's current commit id (GitHub: the git trees API with `recursive=1` for the branch head; ADO: items with `recursionLevel=Full`, commit from the branch ref). Rejects with a clear message when the tree is truncated by the provider.
  - `backend.downloadZip(repo, branch, { signal }) → Promise<{ files: Array<{ path, text }> }>` — downloads the branch zip (GitHub zipball for the ref; ADO items `$format=zip`), refuses over about 50 MB compressed (reads `Content-Length` when present, else stops while reading) with the message "This branch is too large to search on the phone (n MB).", unpacks with `jszip`, drops the zip's top-level folder prefix, keeps text files under 1 MB (skips files with a NUL byte or invalid UTF-8).
  - `loadRepoTexts({ backend, repo, branch, scope, signal, onProgress }) → Promise<{ files: Array<{ path, text }>, commit: string, via: 'files' | 'zip', total: number }>` in `repo-texts.js`: calls `listTree`; filters with `inScope`; when `total` is 60 or fewer fetches each with `backend.getFile` (with a small concurrency limit of 4, calling `onProgress({ done, total })`), otherwise calls `downloadZip` and filters the unpacked files with `inScope`; caches the texts in memory by `repo.id|branch|commit|path` (a per-commit cache means a moved branch misses); aborts on `signal`; never caches a partial result.
  - `clearRepoTexts(repoId?: string): void` — drops the cache for a repo (or all).

- [ ] **Step 1: Write the failing tests** with a fake backend: 3 in-scope files out of 200 listed → three `getFile` calls and `via: 'files'`; 61 in-scope → one `downloadZip` call and `via: 'zip'`, files filtered by scope; the same call again with the same commit makes no further requests; a different commit id refetches; `signal` aborted mid-way rejects with `AbortError` and a later call does not see partial files in the cache; `onProgress` reports `done/total`; `clearRepoTexts` empties it. For `downloadZip`: build a small zip in the test with `jszip` containing `repo-abc123/src/a.cs`, `repo-abc123/bin/x.png` (with a NUL byte) and a 2 MB text file → only `src/a.cs` returned, prefix stripped; a response declaring over 50 MB rejects with the "too large" message without unpacking.
- [ ] **Step 2: Run** `npx vitest run apps/app/src/repo-texts.test.js apps/app/src/git-backend.test.js` — expect FAIL.
- [ ] **Step 3: Implement.** First check how `createGithubHttpAdapter` and `adoGet` return bodies and add a binary-capable GET (ArrayBuffer) to each, via `CapacitorHttp` with `responseType: 'arraybuffer'` on device and `fetch` in the browser, keeping the existing auth headers; the zipball redirects to codeload, so follow redirects. If the native adapter cannot return binary, fall back to base64 (`responseType: 'blob'`) and decode.
- [ ] **Step 4: Run** the two files, then `npx vitest run apps/app` — expect PASS.
- [ ] **Step 5: Commit** `feat(app): load a branch's texts for searching, by file or zip`.

### Task 5: Android search screen

**Files:**
- Create: `apps/app/src/views/repo-search.jsx`
- Modify: `apps/app/src/git-view.jsx` (a search icon in the repo's Files tab app bar opens the screen; a result opens `FileViewer` at the line with the find bar open on the term; back returns to the results), `apps/app/src/git-layers.js` (a layer for the search screen so the back gesture works: results, then the repo)
- Test: `apps/app/src/views/repo-search.test.jsx`, `apps/app/src/git-view-find.test.jsx` (extend)

**Interfaces:**
- Consumes: `loadRepoTexts`, `clearRepoTexts` (Task 4); `searchTexts`, `inScope`, `normaliseExtensions` (Task 1); the existing `FindBar`/find hooks in `FileViewer`.
- Produces:
  - `RepoSearch({ backend, repo, branch, onOpen, onBack })` — a query input (`enterKeyHint="search"`), a "Match case" toggle, a scope section (folders chosen from the branch's top-level and nested folders drawn from `listTree`, plus an extensions field), a "Search" button; before a zip download shows "n files in scope · about x MB, download?" with Download and Cancel; then "Fetching n of N…" / "Downloading…" / "Searching…"; results grouped by file with `line  text` rows and the match marked, a "Showing the first 1000 matches" note when capped, "No matches", and errors in `m-error`. Scope remembered per repo in `localStorage` (profile-keyed with `getProfileKey`, key `helm.git.search.<repo.id>`). Starting another search or leaving cancels the one in flight (`AbortController`); leaving the repo calls `clearRepoTexts(repo.id)`.
  - `FileViewer` accepts `{ line, findQuery }` (from a result): it scrolls the code view to `line` (highlighting the line briefly) and calls `find.setOpen(true); find.setQuery(findQuery)` once the text has loaded.

- [ ] **Step 1: Write the failing tests** (fake backend and `repo-texts`): typing a query and tapping Search with 3 files in scope shows "Fetching 3 of 3…" then results grouped by file with line numbers and a marked match; tapping a result calls `onOpen(path, line, query)`; with 70 in scope the screen asks before downloading and does not call `downloadZip` until "Download" is tapped; Cancel does not download; leaving mid-search aborts it; the scope's extensions field (`.cs js`) and a ticked folder are passed to `loadRepoTexts`; capped results show the note; an error shows `m-error`. In `git-view-find.test.jsx`: opening a file with `line: 3, findQuery: 'foo'` shows the find bar holding `foo` and the line scrolled into view; the back gesture from a result's file returns to the results, and again to the repo.
- [ ] **Step 2: Run** `npx vitest run apps/app/src/views/repo-search.test.jsx apps/app/src/git-view-find.test.jsx` — expect FAIL.
- [ ] **Step 3: Implement** the screen, the `FileViewer` props and the layer.
- [ ] **Step 4: Run** the two files, then `npx vitest run apps/app` — expect PASS.
- [ ] **Step 5: Commit** `feat(app): search the lines of a repo's files`.

### Task 6: Full verification

- [ ] **Step 1:** `npx vitest run` from the repo root — all pass (the git integration project too: `npx vitest run --project git-integration`); report any failure with its output.
- [ ] **Step 2:** Run the desktop app (`run` skill) against a local repo: search a term, narrow with a folder and an extension, open a result and confirm the file opens at the line with the find bar filled; try `-n` and `(x` as queries. On an Android device or emulator: search a GitHub repo with a small scope (no zip) and a whole-repo scope (asks before the zip), open a result, use the back gesture. Report what could not be run.
- [ ] **Step 3:** Commit any fixes; leave the branch `feat/repo-search` ready for a PR.
