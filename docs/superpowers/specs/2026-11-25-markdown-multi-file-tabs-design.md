# Markdown multi-file tabs with live disk refresh — design

## Intent
Select several `.md` files in the OS, "Open with NexusMD", and get one tab per file in Documents. Keep working across them:
edit and save any tab, and when something else changes a file on disk (an editor, an AI tool) the tab shows the new text
without reopening anything.

## Goals
- Every file the app is opened with gets its own tab; none replaces another (today each arrival remounts the viewer and drops the last).
- Opening a file that is already open switches to its tab (my call).
- Each tab keeps its own text, disk stamp, unsaved state and autosave setting while you switch tabs.
- Saving a tab uses the existing conflict-safe write (`expectedStamp`).
- A file changing on disk updates its tab: silently if the tab has no unsaved edits; otherwise a banner
  "Changed on disk — Reload / Keep mine". Unsaved edits are never overwritten (my call).
- Closing a tab with unsaved edits asks first.

## Non-goals
- JSON files and profile-stored documents keep today's single-document behaviour.
- No tab persistence across app restarts, no drag-reordering, no split between tabs.
- No Android change (path-based sources are desktop-only).

## Approaches considered
- **A (chosen):** tab list in the `opened.js` store, one viewer showing the active tab, main-process file watching.
- B: one mounted viewer per tab — rejected: each viewer registers global paste/drop/Ctrl+F handlers that would collide.
- C: check disk only on focus/tab switch — kept only as a safety net inside A (Windows watchers can miss events).

## Design
1. **Store** (`modules/documents/src/renderer/opened.js`): `add()` for a path-backed Markdown file upserts `{path,name,text,stamp,bom}` into `tabs`
   and sets `activeId`; snapshot exposes `tabs`, `active`. Actions: `activate(path)`, `close(path)`, `update(path, patch)` (viewer pushes
   text/stamp/dirty back), `diskChanged(path, {text,stamp})`. JSON and non-path files keep the old snapshot path.
2. **Tab strip** (new `packages/ui/src/views/markdown-tabs.jsx`) above the viewer: name, dirty dot, close button, middle-click close.
   Shown only with two or more tabs or any tab open (builder's call: hide when zero).
3. **Viewer** (`MarkdownViewer.jsx`): takes `source` for the active tab as now, keyed by tab path rather than remounting the screen;
   reports edits/saves up through an `onSourceChange` callback so state survives a tab switch. Existing source effect already reloads on a new `stamp`.
4. **Watching** (main process, `modules/editor/src/main`): `editor:watch(paths)` / unwatch using `fs.watch` per file, debounced ~150 ms,
   re-reading via the existing `read` and pushing `editor:file-changed {path, text, stamp}` only when the stamp differs from the last one sent.
   Renderer also re-checks stamps for open tabs on window focus and tab activation.
5. **Routing** (`modules/editor/src/renderer/open-files.js`, `documents-app.jsx`): drop `key={count}` remount for path sources;
   a burst of paths (Windows sends one launch per file) lands as separate tabs.

## Constraints
Path validation stays in `editor-files.cjs` (absolute paths, text only, 5 MB cap). A file deleted on disk shows "File removed — your text is kept" and stays editable (Save re-creates is NOT offered; builder's call: Save reports missing).

## Testing
Store tests (upsert, dedupe, close, diskChanged clean vs dirty); viewer test that a stamp change reloads a clean tab and banners a dirty one;
main-process watcher test with a temp file; update `open-files` tests for multi-path bursts.

## Left to the builder
Tab strip styling, overflow scrolling, exact banner copy, watcher debounce tuning.
