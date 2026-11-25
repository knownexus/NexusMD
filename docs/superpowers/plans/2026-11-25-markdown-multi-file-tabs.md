# Markdown multi-file tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Files the desktop app is opened with each get a Documents tab, keep their own edits, and refresh when changed on disk.

**Architecture:** `opened.js` keeps a `tabs` list of path-backed Markdown sessions. One `MarkdownViewer` shows the active tab and reports edits/saves back to the store. The editor main process watches open paths and pushes `editor:file-changed`; the store applies it silently to clean tabs and as a banner to dirty ones.

**Tech Stack:** React 18, Vitest + Testing Library, Electron IPC (module manifest preload map), `fs.watch`.

**Spec:** `docs/superpowers/specs/2026-11-25-markdown-multi-file-tabs-design.md`

## Global Constraints

- JSON files and profile-stored (path-less) documents keep today's single-document behaviour; Android untouched.
- Unsaved edits are never overwritten by a disk change.
- Opening an already-open path activates its tab (no duplicate).
- Closing a tab with unsaved edits asks first.
- Path validation stays in `editor-files.cjs` (`checkPath`: absolute, no device paths; 5 MB read cap).
- File deleted on disk: tab keeps its text, shows "File removed — your text is kept"; Save reports the file missing.
- No tab persistence across restarts.

## Review Focus

- Windows launches once per selected file: ten `open(path)` calls in quick succession must give ten tabs, last-opened active, none lost.
- Same file opened twice (or via different casing/`\` vs `/`): one tab.
- Disk change arriving while the tab is mid-save (stamp just changed by our own write): must not banner against ourselves.
- File saved by an editor via rename/atomic replace (watcher fires `rename`, handle goes stale): watching must survive.
- Closing the active tab activates a neighbour; closing the last returns to the normal (no-tab) Documents view.

---

### Task 1: Tabs in the opened-files store

**Files:**
- Modify: `modules/documents/src/renderer/opened.js`
- Test: `modules/documents/src/renderer/opened.test.js`

**Interfaces:**
- Produces on `createOpenedFiles()`: snapshot gains `tabs: Tab[]` and `activePath: string|null`;
  `Tab = { path, name, text, stamp, bom, dirty: boolean, conflict: null|{text,stamp}, missing: boolean }`.
  Methods: `activate(path)`, `close(path)` (activates a neighbour; `tabs` empty → `activePath: null`), `update(path, patch)` (merges `text|stamp|dirty|conflict|missing`),
  `diskChanged(path, { text, stamp } | { missing: true })`, `reloadFromDisk(path)` (apply `conflict`), `keepMine(path)` (adopt `conflict.stamp`, clear conflict).
  `add(file)` with `file.path` and a Markdown name upserts a tab (key = `path.toLowerCase()` with `\` normalised to `/`), sets `activePath`, bumps `count`, still returns `{ tool, source, created:false, name }` where `source` is the tab. JSON and path-less files behave exactly as before.

- [ ] **Step 1: Write failing tests** in `opened.test.js`: `adds a tab per path`, `a second add of the same path (other case/slashes) activates instead of duplicating`, `ten adds give ten tabs, last active`, `diskChanged on a clean tab replaces text and stamp`, `diskChanged on a dirty tab sets conflict and leaves text`, `diskChanged with the tab's current stamp is ignored`, `reloadFromDisk applies conflict and clears dirty`, `keepMine adopts the conflict stamp and keeps text`, `close of the active tab activates a neighbour; closing the last leaves activePath null`, `diskChanged {missing:true} sets missing and keeps text`, `json files still bypass tabs`.
- [ ] **Step 2:** Run `npx vitest run modules/documents/src/renderer/opened.test.js` — expect the new tests to FAIL.
- [ ] **Step 3: Implement** the interface above in `opened.js`; keep existing `openDoc` and `getSnapshot` fields. Snapshots stay immutable (new `tabs` array per change).
- [ ] **Step 4:** Re-run the file — expect all PASS.
- [ ] **Step 5: Commit** `feat(documents): keep one tab per opened Markdown file in the store`.

### Task 2: File watching in the editor main process

**Files:**
- Create: `modules/editor/src/main/editor-watch.cjs`
- Modify: `modules/editor/src/main/index.cjs`, `modules/editor/app.manifest.json`, `apps/desktop/e2e/split.spec.js:27`
- Test: `modules/editor/src/main/editor-watch.test.js`, `modules/editor/src/main/manifest.test.js`

**Interfaces:**
- Produces `createWatcher({ read, send, debounceMs = 150, fsWatch = fs.watch }) -> { watch(paths: string[]), unwatch(paths: string[]), dispose() }`.
  On a (debounced, per-path) change it calls `read(path)` and `send('editor:file-changed', { path, text, stamp })`, or `{ path, missing: true }` when `read` reports missing. It sends only when the stamp differs from the last one sent for that path. After any event it re-establishes the watch (atomic-replace safe).
- IPC: `editor:watch(paths)`, `editor:unwatch(paths)` (each runs `checkPath` on every path); manifest preload adds `"watch": {"invoke":"editor:watch"}`, `"unwatch": {"invoke":"editor:unwatch"}`, `"onFileChanged": {"on":"editor:file-changed"}`.

- [ ] **Step 1: Write failing tests** with an injected `fsWatch` fake and fake timers: `emits file-changed once for a burst of events`, `does not emit when the stamp equals the last one`, `emits missing when read reports missing`, `re-watches after a rename event`, `unwatch stops events`, `dispose closes every handle`; in `manifest.test.js` assert the three new preload entries exist and the handlers `editor:watch`/`editor:unwatch` reject a relative path.
- [ ] **Step 2:** Run `npx vitest run modules/editor/src/main` — expect FAIL.
- [ ] **Step 3: Implement** `editor-watch.cjs` (one `fs.watch` per path on its file, `persistent:false`), register the IPC handlers in `index.cjs` using `files.read` and `ctx.send`, dispose in the returned `dispose`, update the manifest and the `editor:` channel list in `split.spec.js`.
- [ ] **Step 4:** Run `npx vitest run modules/editor/src/main` — PASS.
- [ ] **Step 5: Commit** `feat(editor): watch open files and push disk changes`.

### Task 3: Viewer reports edits; per-tab banner and reload

**Files:**
- Modify: `packages/ui/src/views/MarkdownViewer.jsx` (source effect ~line 629, save ~line 766, find-paste fix already applied), `packages/ui/src/views/view-documents.jsx`
- Test: `packages/ui/src/views/MarkdownViewer.test.jsx`

**Interfaces:**
- Consumes: Task 1 `Tab` shape.
- Produces: `MarkdownViewer` props `onSourceChange(patch: { text?, stamp?, dirty? })`, `onReloadFromDisk()`, `onKeepMine()`; `source` may carry `conflict` and `missing`.
  `DocumentsView` props gain `tabs`, `activePath`, `onActivate(path)`, `onCloseTab(path)`, `onSourceChange`, `onReloadFromDisk`, `onKeepMine` and passes them through.

- [ ] **Step 1: Write failing tests**: `reports text and dirty:true to onSourceChange when the buffer is edited`, `reports the new stamp and dirty:false after a successful save`, `a new source.stamp on a clean tab replaces the buffer without a banner`, `a source with conflict shows "Changed on disk" with Reload and Keep mine, and the buffer keeps the user's text`, `Reload calls onReloadFromDisk, Keep mine calls onKeepMine`, `a source with missing shows "File removed — your text is kept" and Save reports the file unavailable`, `our own save's stamp change does not raise the banner`.
- [ ] **Step 2:** Run `npx vitest run packages/ui/src/views/MarkdownViewer.test.jsx` — expect the new tests FAIL.
- [ ] **Step 3: Implement** in `MarkdownViewer.jsx`: an effect pushing `{ text: markdown, dirty: true }` up when `source?.path` and `markdown !== source.text`; push `{ stamp, text, dirty:false }` in `saveNow` on success; render the banner above the editor when `source.conflict` (copy: "Changed on disk." + buttons "Reload" / "Keep mine") or `source.missing`; thread the new props through `view-documents.jsx`.
- [ ] **Step 4:** Re-run the file — PASS (existing 23 tests too).
- [ ] **Step 5: Commit** `feat(documents): viewer reports edits upward and handles disk changes`.

### Task 4: Tab strip and screen wiring

**Files:**
- Create: `packages/ui/src/views/markdown-tabs.jsx`, `packages/ui/src/views/markdown-tabs.test.jsx`
- Modify: `modules/documents/src/renderer/documents-app.jsx` (drop `key={count}` remount for path tabs), `packages/ui/src/index.js` if the strip is exported, `modules/documents/src/renderer/index.test.jsx`

**Interfaces:**
- Produces `MarkdownTabs({ tabs: Tab[], activePath, onActivate(path), onClose(path) })`: one button per tab (name, `●` when dirty, `×` close; middle-click closes), `aria-label` per tab, renders nothing for an empty list. Unsaved-close confirmation lives in `DocumentsApp` (`window.confirm`-free: use the app's existing confirm/toast pattern; builder's call).
- `DocumentsApp` subscribes to the store, renders the strip above `DocumentsView` when `tabs.length`, passes the active tab as `openedSource`, and wires `onSourceChange → openedFiles.update(activePath, patch)`, `onReloadFromDisk/onKeepMine → store`, `onCloseTab → confirm if dirty, then close`.

- [ ] **Step 1: Write failing tests**: strip renders a tab per file with a dirty dot; clicking activates; × and middle-click close; empty list renders nothing; `DocumentsApp` shows both tabs after two `openedFiles.add` calls and switching tabs shows each file's own text including unsaved edits; closing a dirty tab asks first and a declined close keeps it.
- [ ] **Step 2:** Run `npx vitest run packages/ui/src/views/markdown-tabs.test.jsx modules/documents` — FAIL.
- [ ] **Step 3: Implement** `markdown-tabs.jsx` (follow `DocumentsBar` styling) and the `documents-app.jsx` wiring; keep `key` remount only for non-path adds.
- [ ] **Step 4:** Re-run — PASS.
- [ ] **Step 5: Commit** `feat(documents): tab strip for opened Markdown files`.

### Task 5: Live refresh wiring and focus re-check

**Files:**
- Modify: `modules/documents/src/renderer/index.js`, `modules/editor/src/renderer/open-files.js` (only if the burst test fails)
- Test: `modules/documents/src/renderer/index.test.jsx`, `modules/editor/src/renderer/open-files.test.js`

**Interfaces:**
- Consumes: Task 1 store methods, Task 2 preload `watch/unwatch/onFileChanged`, existing `api.read` (`editor.read(path) -> { text, stamp, bom } | { missing: true }`).
- Behaviour: in `activate(host)`, when `window.electronAPI?.editor?.watch` exists: on store snapshot changes, `watch` newly added tab paths and `unwatch` closed ones; `onFileChanged(msg) → openedFiles.diskChanged(msg.path, msg)`; on `window` `focus` and on `activate`, re-`read` every open tab and call `diskChanged` (the store ignores an unchanged stamp).

- [ ] **Step 1: Write failing tests**: `watches a path when its tab opens and unwatches when closed`, `onFileChanged reaches diskChanged`, `window focus re-reads open tabs and applies a changed stamp`, `ten paths opened in a burst through createOpenHandler give ten tabs` (in `open-files.test.js`), `no electronAPI.editor.watch → no throw, tabs still work`.
- [ ] **Step 2:** Run `npx vitest run modules/documents modules/editor/src/renderer/open-files.test.js` — FAIL.
- [ ] **Step 3: Implement** the subscription and focus handler in `index.js`.
- [ ] **Step 4:** Run `npx vitest run modules packages/ui apps/desktop` — all PASS.
- [ ] **Step 5: Commit** `feat(documents): live-refresh open tabs when files change on disk`. Then `/run` or `apps/desktop:verify` smoke: open three `.md` files at once from Explorer, edit one externally, confirm silent refresh and the dirty-banner case.
