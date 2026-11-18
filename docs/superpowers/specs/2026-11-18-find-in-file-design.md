# Find in the open file

## Intent
When a file is open, the person can search inside it, like Ctrl+F in an editor: type a term, see "3 of 12", step through matches with next and previous. Wanted in the Git file view, the Markdown viewer and the Documents viewer, on desktop and Android.

## Goals
- One find bar with the same behaviour everywhere: query, "n of N" count, previous/next, case toggle, Esc/close.
- Desktop: Ctrl+F opens it (Enter / Shift+Enter step). Android: a search icon in the app bar opens it.
- Every match is highlighted wherever the view allows, and the current match is scrolled into view.
- The matching logic is pure and unit-tested.

## Non-goals
- Searching across many files or a whole repo.
- Replace.
- Rewriting the Markdown or JSON editors (e.g. swapping textareas for CodeMirror).
- Changing the JSON tree's existing search.
- Regex or whole-word search.

## Anti-goals
- Hijacking Ctrl+F in places where it isn't a file view (Regex Tester, Work, etc.).
- Breaking typing, undo or autosave in the editors: finding must not edit text or move the caret unexpectedly while the bar is closed.

## Where an open file is shown (all get find)
| Surface | Desktop | Android |
|---|---|---|
| Git file | CodeMirror read-only preview (`modules/git/.../file-preview.jsx`), or rendered markdown | `FileViewer` in `apps/app/src/git-view.jsx`: line div, or rendered `MarkdownPreview` |
| Markdown | `MarkdownViewer.jsx` textarea + preview | `md-phone.jsx` textarea + preview |
| Documents (JSON text) | `view-json-editor.jsx` text view | `json-phone.jsx` textarea |

## Approaches considered
1. Native find (`window.find` / Electron `findInPage`): cheap, but no count, no highlight-all, inconsistent between Electron and Android WebView. Rejected.
2. **Shared find bar + a small adapter per kind of view (chosen).** Same behaviour everywhere, testable, no editor rewrite.
3. Replace textareas with CodeMirror everywhere: most consistent highlighting, but rewrites two editors and Android keyboard handling. Too big.

## Design
- **Core (`@nexusmd/core`)**: pure `findMatches(text, query, { matchCase })` returning `[{ start, end }]` (literal, non-overlapping, empty query → none), plus a helper to step the current index with wrap-around.
- **UI (`@nexusmd/ui`)**: a `FindBar` component and a `useFind` hook (open/close state, query, case, current index, keyboard handling). Shared by desktop and Android (Android uses the app's `m-` styling via className/props).
- **Adapters** (how a match is shown):
  - Rendered preview (markdown) and the Android line view: highlight all matches, emphasise the current one, scroll it into view. For rendered markdown, matches are found in the rendered DOM text (CSS Custom Highlight API if the target WebViews support it, otherwise wrapping text nodes in `<mark>`).
  - CodeMirror (desktop Git): use `@codemirror/search` (already part of `basicSetup`) driven by the shared bar, or its own panel restyled, whichever the builder finds reliable; behaviour must match the shared bar (count, next/prev, Esc).
  - Textareas (Markdown and JSON editing): select the current match and scroll it into view; only one match is visible at a time. The bar returns focus to the textarea on Esc.
- Edits while the bar is open recompute matches (debounced); the current index is clamped.

## Decisions made with the user
- Find within the open file only; shared bar plus per-view adapters (approach 2).

## My calls (please check)
- Case-insensitive by default, with a toggle.
- JSON tree's existing search is untouched; the new bar covers the JSON text view and Markdown.
- Textareas show one current match, not all.
- Ctrl+F scoped to the focused/visible file view only.

## Left to the builder
- Exact component/file names and styling.
- Custom Highlight API vs `<mark>` wrapping (check Android WebView version in use).
- Whether the CodeMirror panel is reused or driven from the shared bar.
- Test layout (unit tests for core + hook; component tests per surface; extend existing e2e only if cheap).
