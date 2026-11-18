# Find in the open file Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A find-in-file bar (Ctrl+F on desktop, search icon on Android) in the Git file view, Markdown viewer and Documents (JSON text) viewer on both platforms.

**Architecture:** Pure match logic in `@nexusmd/core`; a shared `useFind` state hook, `FindBar` component and per-view adapters in `@nexusmd/ui`; each surface mounts the bar and one adapter (DOM highlighter for rendered markdown / Android line view, decoration API on `CodeEditor` for CodeMirror, selection-and-scroll for textareas).

**Tech Stack:** React, CodeMirror 6 (`@nexusmd/editor-kit`), Vitest + Testing Library (jsdom), Capacitor Android app in `apps/app`, Electron app in `apps/desktop`.

**Spec:** `docs/superpowers/specs/2026-11-18-find-in-file-design.md`

## Global Constraints

- Find within the open file only; no cross-file search, no replace, no regex/whole-word.
- Case-insensitive by default, with a match-case toggle.
- The JSON tree's existing search (`view-json-editor.jsx` tree, `json-phone.jsx` tree mode) is not changed.
- Textareas show one current match (selected + scrolled into view), not all.
- Ctrl+F is only handled while the file view that owns it is visible; it must not fire in Regex Tester, Work, etc.
- Opening/closing find must never change file text, caret (while closed), undo history or autosave.
- Run tests from the repo root: `npx vitest run <path>`.

## Review Focus

1. Query containing regex metacharacters (`.`, `(`, `[`, `\`, `*`) matches literally and never throws.
2. Text with case-folding length changes (`İstanbul`, `ß`) returns correct offsets under case-insensitive search.
3. A file with huge match counts (e.g. 200k `a`) stays responsive: highlights are capped at 5000 and the bar shows `5000+`.
4. Text edited or replaced while the bar is open (autosave, Reload, switching document) re-computes matches and clamps the current index; no stale highlights.
5. Closing the bar (Esc/close button) or unmounting removes every highlight/`<mark>` and leaves the rendered preview identical to before.

Known limitation (documented, not fixed): in rendered markdown, a term spanning formatting boundaries (`foo **bar**` searching `foo bar`) is not found, because matching is per text node.

---

### Task 1: Core match logic

**Files:**
- Create: `packages/core/src/modules/find/index.js`
- Modify: `packages/core/src/index.js` (add `export * from './modules/find/index.js'`)
- Test: `packages/core/tests/find.test.js`

**Interfaces:**
- Produces:
  - `findMatches(text: string, query: string, opts?: { matchCase?: boolean, limit?: number }): Array<{ start: number, end: number }>` — literal, non-overlapping, left to right; empty query or empty text → `[]`; `limit` (default 5000) caps the array length.
  - `stepIndex(index: number, count: number, dir: 1 | -1): number` — wraps around; `count <= 0` → `0`.
  - `splitAtMatches(text: string, matches: Array<{start,end}>): Array<{ text: string, hit: boolean, matchIndex: number | null }>` — covers the whole string in order, no empty segments.
  - `FIND_LIMIT = 5000`.

- [ ] **Step 1: Write the failing tests** in `find.test.js`: `findMatches('a.b a.b', '.')` → 2 matches at 1 and 5 (literal dot); `findMatches('(x)[y]', '(x)')` and `'\\'` do not throw; case-insensitive default (`'Foo foo'`,`'FOO'` → 2) and `matchCase: true` → 0; overlapping `'aaa'`,`'aa'` → 1 match; empty query → `[]`; `findMatches('İstanbul İ', 'i̇')`/`'İ'` offsets index the original string (`text.slice(start,end)` equals the matched original substring) for `'İstanbul'` and `'Straße'` with query `'ß'`; 200k × `'a'` with query `'a'` returns exactly 5000; `stepIndex(0,3,-1)` → 2, `stepIndex(2,3,1)` → 0, `stepIndex(0,0,1)` → 0; `splitAtMatches('abcabc',[{start:1,end:3}])` → `['a','bc','abc']` hit flags `[false,true,false]`.
- [ ] **Step 2: Run** `npx vitest run packages/core/tests/find.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the four exports in `modules/find/index.js`. Case-insensitive: lowercase both and use `indexOf`, but if `text.toLowerCase().length !== text.length` fall back to a global `RegExp` built from an escaped query with flags `giu`, mapping matches by `lastIndex` (guard against zero-length matches).
- [ ] **Step 4: Run** the same command — expect PASS. Then `npx vitest run packages/core` — expect no regressions.
- [ ] **Step 5: Commit** `feat(core): find-in-file match logic`.

### Task 2: Shared find state, bar and shortcut

**Files:**
- Create: `packages/ui/src/find/use-find.js`, `packages/ui/src/find/find-bar.jsx`, `packages/ui/src/find/use-find-shortcut.js`
- Modify: `packages/ui/src/index.js` (export `useFind`, `FindBar`, `useFindShortcut`)
- Test: `packages/ui/tests/find-bar.test.jsx`

**Interfaces:**
- Consumes: `stepIndex` from `@nexusmd/core`.
- Produces:
  - `useFind(): { open: boolean, setOpen(b), close(), query: string, setQuery(s), matchCase: boolean, setMatchCase(b), index: number, count: number, report(count: number): void, next(): void, prev(): void }` — `setQuery`/`setMatchCase` reset `index` to 0; `report` stores `count` and clamps `index` to `count-1` (min 0); `next`/`prev` use `stepIndex(index, count, ±1)`; `close()` sets `open=false` and keeps the query for reopening.
  - `FindBar({ find, className?, style? })`: renders nothing when `!find.open`; otherwise a `role="search"` row: text input (`aria-label="Find in file"`, autofocus on open, Enter → next, Shift+Enter → prev, Esc → close), a status (`"3 of 12"`, `"5000+"` when `count >= 5000`, `"No matches"` when query non-empty and count 0, empty otherwise), buttons `aria-label` `"Previous match"`, `"Next match"`, `"Match case"` (`aria-pressed`), `"Close find"`. Styled with existing CSS variables (`--surface`, `--border`, `--text`, `--accent`) so it works with both the desktop and `m-` Android themes.
  - `useFindShortcut(containerRef, find)`: window `keydown` for Ctrl/Cmd+F → `preventDefault()` and `find.setOpen(true)`, only when `containerRef.current` is in the document and visible (`offsetParent !== null` or `getClientRects().length`), and removed on unmount.

- [ ] **Step 1: Write failing tests**: hook — `setQuery` resets index; `report(2)` after index 5 clamps to 1; `next` wraps. Bar — renders nothing closed; shows `"2 of 5"` with `index=1,count=5`; Enter/Shift+Enter/Esc call next/prev/close; `"No matches"` for query `x`, count 0; match-case button toggles `aria-pressed`. Shortcut — Ctrl+F opens when container visible, does nothing when container is `display:none`, does nothing after unmount.
- [ ] **Step 2: Run** `npx vitest run packages/ui/tests/find-bar.test.jsx` — FAIL.
- [ ] **Step 3: Implement** the three files per the Interfaces block.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ui): FindBar, useFind and Ctrl+F shortcut`.

### Task 3: View adapters (rendered DOM, textarea)

**Files:**
- Create: `packages/ui/src/find/use-dom-find.js`, `packages/ui/src/find/use-textarea-find.js`
- Modify: `packages/ui/src/index.js`
- Test: `packages/ui/tests/use-dom-find.test.jsx`, `packages/ui/tests/use-textarea-find.test.jsx`

**Interfaces:**
- Consumes: `findMatches`, `FIND_LIMIT` from core; `find` from `useFind`.
- Produces:
  - `useDomFind(rootRef: RefObject<HTMLElement>, find, contentKey: unknown): void` — when `find.open && find.query`, walks text nodes under `rootRef.current` (skipping `script/style`), finds matches per node with `findMatches`, highlights all (up to `FIND_LIMIT` total), emphasises match `find.index` and scrolls it into view (`scrollIntoView({ block: 'center' })`), then `find.report(total)`. Re-runs when query, matchCase, open, `contentKey` or index change. Uses `CSS.highlights` (`Highlight`) when available, else wraps hits in `<mark data-find>` (current gets `data-find-current`). On cleanup (close, query cleared, unmount) removes all highlights/marks and calls `root.normalize()` so the DOM is as before. Must run after `MarkdownPreview` has rendered (effect order / `contentKey` = the markdown string).
  - `useTextareaFind(taRef: RefObject<HTMLTextAreaElement>, text: string, find): void` — matches via `findMatches(text, …)`, `find.report(count)`; when the current match changes, `setSelectionRange(start, end)` on the textarea **without stealing focus from the find input**, and scrolls it into view by measuring the match's line top with an offscreen mirror element that copies the textarea's font, padding, width and wrapping. Does nothing when closed.
  - Both hooks are no-ops (and report `0`) when `!find.open`.

- [ ] **Step 1: Write failing tests** (jsdom has no `CSS.highlights`, so the `<mark>` path is exercised): DOM — `<p>Foo foo</p>` query `foo` → 2 `mark[data-find]`, `find.report` called with 2, index 1 has `data-find-current`; query with `<script>`-ish text node skipped; closing removes all marks and `root.innerHTML` equals the original; changing `contentKey` re-highlights new content; metacharacter query `(` does not throw. Textarea — `report` count correct; moving index sets `selectionStart/End` to the match; `document.activeElement` is unchanged by stepping; editing `text` to shorter content clamps index.
- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement** the two hooks per Interfaces.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ui): DOM and textarea find adapters`.

### Task 4: CodeMirror support in `CodeEditor`

**Files:**
- Modify: `packages/editor-kit/src/code-editor.jsx` (props at the `CodeEditor` signature; `api` object near `replaceText`)
- Test: `packages/editor-kit/tests/code-editor-find.test.jsx` (place beside existing code-editor tests; check `packages/editor-kit` for the test folder)

**Interfaces:**
- Consumes: `findMatches`, `FIND_LIMIT` from core.
- Produces, on the existing `apiRef` object:
  - `find(query: string, opts: { matchCase: boolean, index: number }): number` — decorates every match (class `cm-find-hit`) and the match at `index` (class `cm-find-current`, `scrollIntoView` centred) and returns the match count; empty query clears and returns 0.
  - `clearFind(): void`.
  - New prop `onFind?: () => void`: when given, Mod-f is bound at highest precedence to call it and return `true` (suppressing CodeMirror's own search panel); when absent behaviour is unchanged.
  - Decorations are re-applied when the document changes while a find is active (re-run last query), and styled in the editor's `THEME` (hit = soft accent background, current = stronger).

- [ ] **Step 1: Write failing tests**: `apiRef.current.find('foo', { matchCase:false, index:0 })` returns the count and the DOM has that many `.cm-find-hit` with exactly one `.cm-find-current`; `clearFind()` removes them; Mod-f keydown calls `onFind` and the `.cm-search` panel does not appear; without `onFind`, Mod-f still opens the built-in panel; replacing text via `value` re-runs the active query.
- [ ] **Step 2: Run** `npx vitest run packages/editor-kit` — new tests FAIL.
- [ ] **Step 3: Implement** using a `StateField`/`Compartment` of `Decoration.mark` sets (follow the existing `lineDecorations`/`tints` pattern), `Prec.highest(keymap.of(...))` for Mod-f, and `EditorView.scrollIntoView(pos, { y: 'center' })` for the current match.
- [ ] **Step 4: Run** `npx vitest run packages/editor-kit` — PASS, no regressions.
- [ ] **Step 5: Commit** `feat(editor-kit): find decorations and onFind on CodeEditor`.

### Task 5: Desktop Markdown viewer and JSON text view

**Files:**
- Modify: `packages/ui/src/views/MarkdownViewer.jsx` (textarea at ~line 1263 with `editorRef`; preview container with `previewRef`, ~line 598 refs)
- Modify: `packages/ui/src/views/view-json-editor.jsx` (raw text `<textarea>` at ~line 339; leave the tree search untouched)
- Test: `packages/ui/src/views/MarkdownViewer.test.jsx` (extend), `packages/ui/tests/view-json-find.test.jsx`

**Interfaces:**
- Consumes: `useFind`, `FindBar`, `useFindShortcut`, `useDomFind`, `useTextareaFind` (Tasks 2–3).
- Produces: in each view, one `useFind()`; `<FindBar find={find}/>` rendered above the pane that holds the file (Markdown: above the editor/preview split; JSON: above the text view only when the text view is showing). Markdown: the **editor** textarea uses `useTextareaFind(editorRef, markdown, find)` and the **preview** uses `useDomFind(previewRef, find, markdown)`; they share one bar, and the adapter that applies is the pane that last had focus (default editor), tracked with `onFocus`/`onMouseDown` on each pane. `useFindShortcut` is attached to each view's root container.

- [ ] **Step 1: Write failing tests**: Markdown — Ctrl+F shows the bar; typing `foo` with content `foo bar foo` reports `"1 of 2"` and Enter moves to `"2 of 2"`; with preview focused, matches show as `mark[data-find]` in `.md-content`; Esc closes and returns focus to the textarea; typing in the textarea does not change content while the bar is open. JSON — Ctrl+F shows the bar only in the text view; in the tree view Ctrl+F does nothing (the tree's own search box is unchanged).
- [ ] **Step 2: Run** `npx vitest run packages/ui/src/views/MarkdownViewer.test.jsx packages/ui/tests/view-json-find.test.jsx` — FAIL.
- [ ] **Step 3: Implement** the wiring; keep new code small and local.
- [ ] **Step 4: Run** the same command plus `npx vitest run packages/ui` — PASS.
- [ ] **Step 5: Commit** `feat(ui): find in Markdown viewer and JSON text view`.

### Task 6: Desktop Git file preview

**Files:**
- Modify: `modules/git/src/renderer/file-preview.jsx` (`TextPreview`; the `CodeEditor` and `renderText` branches)
- Test: `modules/git/src/renderer/file-preview-find.test.jsx`

**Interfaces:**
- Consumes: Tasks 2–4. `TextPreview` already receives `renderText` for rendered markdown.
- Produces: `TextPreview` owns `useFind()`, renders `<FindBar/>` at the top of the preview when `state.status === 'ready'`, and `useFindShortcut` on its root. Code view: pass `apiRef` and `onFind={() => find.setOpen(true)}` to `CodeEditor`, and an effect calls `apiRef.current.find(find.query, { matchCase: find.matchCase, index: find.index })` → `find.report(count)` (and `clearFind` when closed/empty). Rendered markdown view: wrap the `renderText` result in a div and run `useDomFind` on it. Image/binary/note states show no bar and ignore Ctrl+F. The existing `go-to-file` Ctrl+P and other git shortcuts are unaffected (check `use-git-shortcuts.js` for a Ctrl+F binding and, if one exists, make the preview's handler win only while a file is showing).

- [ ] **Step 1: Write failing tests**: with a ready text file, Ctrl+F shows the bar, typing a term reports the CodeMirror match count and marks `.cm-find-hit`; with `renderText` markdown, matches are `mark[data-find]`; with a `note` state (binary), Ctrl+F shows no bar.
- [ ] **Step 2: Run** `npx vitest run modules/git/src/renderer/file-preview-find.test.jsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** that file plus `npx vitest run modules/git/src/renderer` (skip `*.integration.test.js`) — PASS.
- [ ] **Step 5: Commit** `feat(git): find in the file preview`.

### Task 7: Android Git file viewer

**Files:**
- Modify: `apps/app/src/git-view.jsx` (`FileViewer`, lines 57–97)
- Test: `apps/app/src/git-view.test.jsx` (extend)

**Interfaces:**
- Consumes: `useFind`, `FindBar`, `useDomFind`, `findMatches`, `splitAtMatches`, `stepIndex`.
- Produces: a search `m-iconbtn` (`aria-label="Find in file"`, `Icon name="search"`) in the app bar actions that calls `find.setOpen(true)`; `<FindBar find={find}/>` at the top of `m-screen`. Plain-text view (`!md || raw`): per-line matches from `findMatches(line, …)` rendered through `splitAtMatches` as `<mark className="find-hit">` with the global current match (counting across lines, capped at `FIND_LIMIT`) marked `find-current` and scrolled into view; `find.report(total)`. Rendered markdown view: `useDomFind` on a wrapper around `MarkdownPreview`. Add `.find-hit`/`.find-current` rules to the Android stylesheet in `apps/app/src/styles/`.

- [ ] **Step 1: Write failing tests**: tapping "Find in file" shows the bar; typing a term in a code file shows `"1 of N"` and `mark.find-hit` elements, Enter advances the current mark; switching Rendered↔Raw for a markdown file keeps the query and re-highlights; closing removes marks.
- [ ] **Step 2: Run** `npx vitest run apps/app/src/git-view.test.jsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** that file — PASS.
- [ ] **Step 5: Commit** `feat(app): find in the Git file viewer`.

### Task 8: Android Markdown and JSON editors

**Files:**
- Modify: `apps/app/src/views/md-phone.jsx` (actions in `ToolFrame`, textarea `ta`, preview `m-docs-preview`), `apps/app/src/views/json-phone.jsx` (edit-mode textarea; tree mode untouched)
- Test: `apps/app/src/views/md-phone-extras.test.jsx` (extend), `apps/app/src/views/json-tree-ui.test.jsx` (extend)

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: a search icon button added to each tool's `actions` (`aria-label="Find in file"`); `<FindBar/>` above the text/preview. Markdown: Edit mode → `useTextareaFind(ta, m.content, find)`; Preview mode → `useDomFind(previewRef, find, m.content)`; Compare mode: the button is hidden. JSON: shown only in Edit mode (`useTextareaFind` on its textarea); hidden in Tree mode (it has its own search). Stepping must not summon the soft keyboard: do not call `focus()` on the textarea.

- [ ] **Step 1: Write failing tests**: Markdown Edit — icon opens the bar, typing reports `"1 of 2"` and the textarea selection equals the first match; Preview mode shows `mark[data-find]`; Compare mode has no Find button. JSON — Edit mode has the button; Tree mode does not.
- [ ] **Step 2: Run** `npx vitest run apps/app/src/views/md-phone-extras.test.jsx apps/app/src/views/json-tree-ui.test.jsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — PASS.
- [ ] **Step 5: Commit** `feat(app): find in Markdown and JSON editors`.

### Task 9: Full verification

- [ ] **Step 1:** `npx vitest run` from the repo root (excludes the git integration project by config) — all pass; report any failures with output.
- [ ] **Step 2:** Run the app (`run` skill): on desktop open a `.md`, a code file in Git and a JSON document and confirm Ctrl+F works in each, including highlight, count, Esc, and that Ctrl+F in Regex Tester does nothing; verify on the Android build/emulator that the search icon appears in the three places and stepping doesn't raise the keyboard. Confirm whether an unfocused textarea shows its selection on both platforms; if it doesn't, add a mirror-overlay highlight for the current match in `useTextareaFind` and re-run Task 3's tests.
- [ ] **Step 3:** Commit any fixes; leave the branch `feat/find-in-file` ready for a PR.
