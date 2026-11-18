# Search the lines of a repo's files

## Intent
Find a specific line or statement in a repo: type a term, see which files contain it and on which lines, tap a result to open that file at that line. Only the branch currently being viewed is searched. Builds on find-in-file (#103), whose find bar opens in the file with the term filled in.

## Goals
- Desktop Git (local repos): a search box that lists matches as file, line number and text, grouped by file.
- Android Git (Azure DevOps and GitHub repos): the same results list, for the branch being viewed.
- Tapping a result opens the file at that line with the find bar already holding the term.
- Match case toggle; plain text (not regex). Case-insensitive by default, as find-in-file.
- Results are capped (files, matches per file, total) and say so when capped.

## Non-goals
- Searching other branches, other repos or history.
- Regex, whole-word, replace.
- Searching the GitHub files tab on desktop (remote repos viewed on desktop) in this round.
- Searching saved Markdown/JSON documents (separate, later).

## Anti-goals
- Downloading a huge repo without warning or leaving the phone unresponsive.
- Showing results for a different commit than the one viewed.

## Constraints
- Android only reads remote repos one file at a time through the provider APIs; there is no local copy.
- Provider code-search APIs do not fit: GitHub's covers the default branch only and Azure DevOps needs its Search extension, so neither reliably searches "the current branch".
- `jszip` is already a dependency of `apps/app` and `packages/ui`.

## Approaches considered
1. Provider search APIs (GitHub code search, Azure DevOps Code Search): fast and no download, but default-branch only on GitHub and extension-dependent on Azure DevOps. Does not meet "the current branch".
2. **Desktop `git grep`; Android downloads the branch as a zip and searches it on the device (chosen).** One search path per platform that works for both providers and any branch.
3. List the tree and fetch every file on demand: simplest, but slow and rate-limited on anything sizeable. Rejected.

## Design
- **Core (`@nexusmd/core`)**: a pure `searchTexts(files, query, opts)` for the Android side (files: `[{ path, text }]`), reusing `findMatches`; returns `{ results: [{ path, matches: [{ line, text, start, end }] }], capped }`. Caps: 200 files with matches, 50 matches per file, 1000 total.
- **Desktop**: new `grep` on `IGitAdapter` (`modules/git`, main-process `git-files.cjs`), running `git grep -n -I -F --no-color` (`-i` unless match case) on the worktree at the checked-out state, with the same caps, and returning the same result shape. Skips binary files (`-I`). A search box in the Git file explorer (renderer) lists the results; clicking one opens the file via the existing explorer selection with the `CodeEditor` `line` prop and the find bar opened on the term.
- **Android**: on first search for a (repo, branch) the app downloads the branch as a zip (Azure DevOps items API with `$format=zip`; GitHub zipball for the ref), unpacks it with `jszip`, keeps text files under 1 MB, and searches them with `searchTexts`. The unpacked texts are cached in memory per (repo, branch, commit id) and dropped when the branch head changes or the repo is left. A size guard (about 50 MB compressed) stops with a message instead of downloading. Progress ("Downloading…", "Searching…") shows in the results area.
- **Results UI**: the same shape on both (grouped by file, line number and a snippet with the match marked). Android: a search icon in the repo's Files tab opens a search screen; results open the existing `FileViewer` at the line with the find bar open on the term.

## Decisions made with the user
- Find a line or statement within a repo; current branch only; plain text results as file and line.

## My calls (please check)
- Plain text only, case-insensitive with a toggle; no regex.
- Desktop covers local repos only; the GitHub tab on desktop is a later step.
- Android downloads the zip rather than using provider search, for one dependable path on any branch; the 50 MB guard and caps are my numbers.
- Result caps 200 files / 50 per file / 1000 total.

## Left to the builder
- Exact file and component names and styling.
- How each provider's zip endpoint is called through the existing `git-backend.js` / HTTP adapters (including auth and the native HTTP path).
- Whether the unpack happens in a worker to keep the phone responsive.
- Test layout (core unit tests; main-process `git grep` integration test in a temp repo; component tests for each results list).
