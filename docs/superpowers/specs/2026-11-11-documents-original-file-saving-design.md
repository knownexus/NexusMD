# Documents original-file saving — design

Date: 2026-11-11. Status: approved in chat.

## Intent

Documents must make saving an intentional, obvious action. A Markdown or JSON
file opened through NexusMD's file association must be edited in place: the
Documents page writes the original path, rather than making an app-managed
copy. The app must not silently lose edits if that write fails.

## Requirements

- Show an always-visible **Save** action for the currently active Markdown or
  JSON document; `Ctrl/Cmd+S` invokes the same action.
- A managed document saves into NexusMD's existing profile-scoped document
  store. A path-backed document saves to its original file, preserving its
  BOM and using the safe optimistic-concurrency write already used by Editor.
- Files opened externally do not create a Markdown or JSON document copy.
- Autosave is configured independently for each document, defaults off, and
  offers 15 seconds, 30 seconds, 1 minute, and 5 minutes. It writes only when
  there are changes. The preference persists for managed documents and, for a
  path-backed document, is stored as metadata keyed by its path, never as a
  content copy.
- Save failures leave the editing buffer intact, visibly explain the failure,
  and provide **Save As**. A changed-on-disk source must report a conflict
  rather than overwrite it.
- Android/browser openings that do not supply a trusted native path keep their
  existing saved-document behavior.

## Constraints

- Keep Documents usable when the Editor module is not installed; native
  read/write support belongs to Documents rather than depending on Editor's
  private IPC surface.
- Do not add dependencies. Use React, Electron IPC, and the existing safe-file
  helpers and Vitest conventions.
- Existing managed Documents content remains compatible and retains its
  current profile-scoped storage keys.


