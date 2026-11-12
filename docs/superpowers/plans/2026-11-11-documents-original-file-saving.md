# Documents Original-file Saving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Documents save explicitly, support per-document interval autosave, and write externally opened Markdown and JSON files back to their source paths.

**Architecture:** Preserve the existing profile-scoped stores for Documents created in NexusMD, but represent a file supplied by the operating system as an ephemeral path-backed session rather than a stored document copy. Add a Documents-owned native file IPC surface using the safe, stamped read/write rules already established by Editor; the renderer routes Markdown and JSON save commands through a common Documents toolbar contract.

**Tech Stack:** React 18, Electron IPC/CommonJS, `@nexusmd/main-kit/safe-file`, `@nexusmd/core`, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-11-documents-original-file-saving-design.md`

## Global Constraints

- Autosave is opt-in per document; valid intervals are exactly 15 seconds, 30 seconds, 1 minute, and 5 minutes.
- A path-backed document must not serialize its content into `md_documents` or `json_editor_documents`.
- Save uses optimistic concurrency and preserves the original UTF-8 BOM; a changed or missing source is never overwritten silently.
- A failed save preserves the unsaved editor buffer and offers Save As.
- Openings without a trusted native path retain the existing Android/browser saved-document behavior.
- Do not add dependencies.

## Review Focus

- A Markdown source modified after opening reports a conflict and retains the typed text; Task 1 native-write test and Task 4 UI test pin this.
- An invalid JSON source can still be manually saved as text without losing the raw buffer; Task 4 pins this.
- Autosave never writes an unchanged source and stops when disabled, when the active document changes, or when the view unmounts; Task 3 pins this with fake timers.
- A source path that cannot be written exposes Save As and never turns into a profile-stored copy; Task 4 pins this.
- Legacy pathless opens still create and select their existing managed Markdown/JSON records; Task 2 pins this.

---

### Task 1: Documents native file bridge

**Files:**
- Create: `modules/documents/src/main/documents-files.cjs`
- Create: `modules/documents/src/main/documents-files.test.js`
- Create: `modules/documents/src/main/index.cjs`
- Modify: `modules/documents/app.manifest.json`
- Test: `modules/documents/src/main/manifest.test.js`

**Interfaces:**
- Consumes: `@nexusmd/main-kit/safe-file` helpers `readText`, `checkText`, `writeAtomic`, `realDeep`, `sha256`, and `BOM`.
- Produces: `window.electronAPI.documents.read(path)` → `{ path, text, stamp, bom } | { missing: true }`; `window.electronAPI.documents.write(path, text, { expectedStamp, overwrite, bom })` → `{ ok, stamp, path } | { ok: false, conflict?: true, missing?: true }`; and `window.electronAPI.documents.saveAs(defaultName, text)` → `{ path, stamp, bom } | null`.

- [ ] **Step 1: Write failing unit tests for Documents path validation, text reads, atomic stamped writes, changed-file conflicts, missing files, BOM preservation, and Save As cancellation.**

- [ ] **Step 2: Run `npm run test:documents -- modules/documents/src/main/documents-files.test.js` and verify the new tests fail because the bridge does not exist.**

- [ ] **Step 3: Implement `documents-files.cjs` and its `register(ipcMain, { dialog })` function.**

  Reuse Editor's safe text-file rules, but keep the handler owned by Documents so a Documents-only install works; Save As uses Electron's save dialog and returns a freshly readable file descriptor.

- [ ] **Step 4: Add the Documents main entry and manifest-owned preload declarations, then test that every declared preload channel and main file is valid.**

- [ ] **Step 5: Run `npm run test:documents -- modules/documents/src/main` and verify it passes.**

- [ ] **Step 6: Commit the native bridge.**

### Task 2: Path-backed open routing without document copies

**Files:**
- Modify: `modules/editor/src/renderer/open-files.js`
- Test: `modules/editor/src/renderer/open-files.test.js`
- Modify: `modules/documents/src/renderer/opened.js`
- Test: `modules/documents/src/renderer/opened.test.js`
- Modify: `modules/documents/src/renderer/index.js`
- Test: `modules/documents/src/renderer/index.test.jsx`
- Modify: `modules/documents/src/renderer/documents-app.jsx`
- Test: `modules/documents/src/renderer/documents-app.test.jsx`

**Interfaces:**
- Consumes: Task 1 `documents.read` result and the existing `documents.openFile(file)` capability.
- Produces: `documents.openFile({ name, text, path?, stamp?, bom? })`; a path-backed call publishes `{ tool, source }` to `DocumentsApp` without changing the managed-document stores, while a pathless call returns the existing managed-record result.

- [ ] **Step 1: Write failing routing tests proving a Markdown and JSON launch forwards canonical path, text, stamp, and BOM to Documents, while unsupported files still open in Editor.**

- [ ] **Step 2: Write failing Documents tests proving a path-backed open selects the correct tool without writing `md_documents`/`json_editor_documents`, re-opening the same path refreshes its source session, and pathless opens keep the legacy copy behavior.**

- [ ] **Step 3: Run `npm run test:editor -- modules/editor/src/renderer/open-files.test.js` and `npm run test:documents -- modules/documents/src/renderer/opened.test.js modules/documents/src/renderer/index.test.jsx`; verify they fail for the new expectations.**

- [ ] **Step 4: Implement source-session publication in `opened.js` and pass its snapshot from `DocumentsApp` into `DocumentsView`; update Editor routing to use the Documents bridge's stamped read.**

- [ ] **Step 5: Run the scoped editor and Documents renderer tests and verify they pass.**

- [ ] **Step 6: Commit the path-backed routing.**

### Task 3: Explicit-save and autosave controller

**Files:**
- Create: `packages/ui/src/views/document-save-controller.js`
- Test: `packages/ui/src/views/document-save-controller.test.js`
- Modify: `packages/ui/src/views/documents-bar.jsx`
- Test: `packages/ui/src/views/documents-bar.test.jsx`
- Modify: `packages/ui/src/views/view-documents.jsx`
- Test: `packages/ui/src/views/view-documents.test.jsx`
- Modify: `packages/ui/src/views/document-store.js`
- Test: `packages/ui/src/views/document-store.test.jsx`

**Interfaces:**
- Consumes: a document descriptor `{ id?: string, source?: { path, stamp, bom }, autosave?: number | null }`, current text, and `save()` supplied by the active tool.
- Produces: shared bar registration `{ save, canSave, dirty, status, autosave, setAutosave, sourceLabel }`; `save()` is callable from the visible button and keyboard shortcut, while `setAutosave(interval | null)` schedules only dirty content.

- [ ] **Step 1: Write failing controller tests for manual saves, dirty tracking, all four interval values, disabled autosave, unchanged content, source-session changes, and timer cleanup.**

- [ ] **Step 2: Write failing Documents bar tests for an enabled Save button, Ctrl/Cmd+S delegation, per-document Autosave control, interval selection, source-path label, and disabled state with no editable document.**

- [ ] **Step 3: Run `npm -w packages/ui test -- document-save-controller documents-bar document-store view-documents` and verify the targeted tests fail.**

- [ ] **Step 4: Implement the controller and expand `DocumentsBarContext` so an active tool registers its save command and document-level autosave state.**

  Persist autosave on managed document records; store only source-path-to-preference metadata for path-backed sessions under a profile-scoped Documents preference key.

- [ ] **Step 5: Replace the unconditional 300 ms/1500 ms persistence scheduling in `document-store.js` with explicit-save primitives that the controller can invoke.**

- [ ] **Step 6: Run the targeted UI tests and verify they pass.**

- [ ] **Step 7: Commit the shared save controller.**

### Task 4: Markdown and JSON integration

**Files:**
- Modify: `packages/ui/src/views/MarkdownViewer.jsx`
- Test: `packages/ui/src/views/MarkdownViewer.test.jsx`
- Modify: `packages/ui/src/views/view-json-editor.jsx`
- Test: `packages/ui/src/views/view-json-editor.test.jsx`
- Modify: `packages/ui/src/views/view-documents.jsx`
- Test: `packages/ui/src/views/view-documents.test.jsx`

**Interfaces:**
- Consumes: Task 2 source-session props and Task 3 `DocumentsBarContext` registration.
- Produces: Markdown and JSON editors that save managed documents to their existing stores, and source sessions through `documents.write`; both surface write errors plus a Save As recovery action.

- [ ] **Step 1: Write failing Markdown tests for visible Save, Ctrl/Cmd+S, managed-document save, source-path save with stamp/BOM, conflict retention, Save As recovery, and its per-document autosave setting.**

- [ ] **Step 2: Write failing JSON tests for the same save flows, including saving invalid raw JSON unchanged and preserving the raw buffer after a source-write failure.**

- [ ] **Step 3: Run `npm -w packages/ui test -- MarkdownViewer view-json-editor view-documents` and verify the new cases fail.**

- [ ] **Step 4: Wire `MarkdownViewer` and `JsonEditorView` to load source sessions without creating managed documents, register their commands with the Documents bar, and implement Save/Save As results and status copy.**

- [ ] **Step 5: Run the targeted UI tests and verify they pass.**

- [ ] **Step 6: Commit the tool integrations.**

### Task 5: Cross-workspace verification

**Files:**
- Modify: none unless verification exposes an integration defect.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: a verified Documents feature across its UI, module IPC, and desktop integration boundary.

- [ ] **Step 1: Run `npm run test:affected -- --base master` and verify all selected tests pass.**

- [ ] **Step 2: Run `npm -w apps/desktop run build:renderer` and verify the renderer builds successfully.**

- [ ] **Step 3: Run `npm -w apps/desktop test` and `npm -w modules/documents test`, then resolve only failures caused by this feature.**

- [ ] **Step 4: Commit verification fixes, if any.**


