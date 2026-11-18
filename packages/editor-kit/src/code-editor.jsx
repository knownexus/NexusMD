import React from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment, Annotation, Transaction, StateField, StateEffect, Prec } from '@codemirror/state'
import { Decoration, keymap } from '@codemirror/view'
import { findMatches } from '@nexusmd/core'
import { syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import { isolateHistory } from '@codemirror/commands'
import { languageExtension, languageForPath } from './languages.js'

export { languageForPath }

// Marks transactions that replace the document from props, so they are not echoed to onChange.
const External = Annotation.define()
// CodeMirror stores documents with LF only, so compare and insert in that form.
const normalize = text => (text ?? '').replace(/\r\n?/g, '\n')

// NexusMD's own colours and monospace stack, so the editor reads like the rest of the app.
const THEME = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--surface-2)', fontSize: '12px', height: '100%' },
  '.cm-content': { fontFamily: "'Cascadia Code', 'Fira Code', Consolas, Menlo, monospace", caretColor: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' },
  '&.cm-focused': { outline: '1px solid var(--accent-border, var(--border))' },
  '.cm-find-hit': { backgroundColor: 'rgba(255, 200, 0, .45)' },
  '.cm-find-current': { backgroundColor: 'rgba(255, 140, 0, .8)', outline: '1px solid rgba(255, 140, 0, 1)' },
})

// Find-in-file: the matches of the active query are marked (the current one more strongly) and kept up to date
// when the document changes. `null` clears it.
const setFind = StateEffect.define()
const findDecorations = (doc, f) => {
  const ms = findMatches(doc.toString(), f.query, { matchCase: f.matchCase })
  return Decoration.set(ms.map((m, i) => Decoration.mark({ class: i === f.index ? 'cm-find-hit cm-find-current' : 'cm-find-hit' }).range(m.start, m.end)))
}
const findField = StateField.define({
  create: () => ({ find: null, deco: Decoration.none }),
  update(value, tr) {
    let find = value.find
    for (const e of tr.effects) if (e.is(setFind)) find = e.value
    if (!find) return value.find ? { find: null, deco: Decoration.none } : value
    if (find === value.find && !tr.docChanged) return value
    return { find, deco: findDecorations(tr.state.doc, find) }
  },
  provide: f => EditorView.decorations.from(f, v => v.deco),
})

// `lineClasses` as line decorations: [[1-based line, className], …]; lines past the end are ignored.
const lineDecorations = (doc, list) => {
  const marks = (list ?? []).filter(([n]) => n >= 1 && n <= doc.lines).sort((a, b) => a[0] - b[0])
    .map(([n, cls]) => Decoration.line({ class: cls }).range(doc.line(n).from))
  return EditorView.decorations.of(Decoration.set(marks))
}

/**
 * `lineClasses` tints whole lines ([[line, className], …]); they apply to the document as it is
 * after `value`, so pass classes worked out from that same text.
 *
 * `apiRef` (a React ref) is given { replaceText(text), find(query, { matchCase, index }), clearFind() } while the editor is
 * mounted. replaceText replaces the whole document as one ordinary edit: reported through onChange and undoable, unlike a
 * new `value`, which is the app setting the text (a Reload). find marks every match, scrolls the one at `index` into view
 * and returns the number of matches; the marks follow later edits until clearFind().
 *
 * `onFind` is called on Ctrl/Cmd+F, instead of opening CodeMirror's own search panel, so the app can show its find bar.
 */
export function CodeEditor({ value, language, onChange, ariaLabel, line = null, readOnly = false, lineClasses = null, apiRef = null, onFind = null, minHeight = 240 }) {
  const host = React.useRef(null)
  const view = React.useRef(null)
  const lang = React.useRef(new Compartment())
  const ro = React.useRef(new Compartment())
  const tints = React.useRef(new Compartment())
  const replaced = React.useRef(false)
  const jumped = React.useRef(null)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  const apiRefRef = React.useRef(apiRef)
  apiRefRef.current = apiRef
  const onFindRef = React.useRef(onFind)
  onFindRef.current = onFind
  const initial = React.useRef({ value, language, ariaLabel, readOnly })

  React.useEffect(() => {
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: normalize(initial.current.value),
        extensions: [
          Prec.highest(keymap.of([{ key: 'Mod-f', preventDefault: true, run: () => { if (!onFindRef.current) return false; onFindRef.current(); return true } }])),
          basicSetup, THEME, findField, syntaxHighlighting(classHighlighter), lang.current.of(languageExtension(initial.current.language)),
          ro.current.of(EditorState.readOnly.of(!!initial.current.readOnly)),
          tints.current.of([]),
          EditorView.contentAttributes.of({ 'aria-label': initial.current.ariaLabel }),
          EditorView.updateListener.of(u => {
            // Only user edits report back; documents replaced from outside are already known.
            if (u.docChanged && !u.transactions.some(t => t.annotation(External))) onChangeRef.current?.(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    const api = {
      replaceText(text) {
        const next = normalize(text)
        if (v.state.doc.toString() === next) return
        const { anchor, head } = v.state.selection.main
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: next },
          selection: { anchor: Math.min(anchor, next.length), head: Math.min(head, next.length) },
          annotations: isolateHistory.of('full'), // its own undo step, even straight after typing
        })
      },
      find(query, { matchCase = false, index = 0 } = {}) {
        const ms = query ? findMatches(v.state.doc.toString(), query, { matchCase }) : []
        const i = ms.length ? Math.min(Math.max(index, 0), ms.length - 1) : 0
        v.dispatch({
          effects: [setFind.of(query ? { query, matchCase, index: i } : null), ...(ms[i] ? [EditorView.scrollIntoView(ms[i].start, { y: 'center' })] : [])],
        })
        return ms.length
      },
      clearFind() { v.dispatch({ effects: setFind.of(null) }) },
    }
    const ref = apiRefRef.current
    if (ref) ref.current = api
    return () => {
      if (ref && ref.current === api) ref.current = null
      v.destroy(); view.current = null
    }
  }, [])

  React.useEffect(() => {
    const v = view.current
    const next = normalize(value)
    // Kept out of undo history: undoing a Revert/Reload would resurrect discarded text and report it as a user edit.
    if (v && v.state.doc.toString() !== next) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next }, annotations: [External.of(true), Transaction.addToHistory.of(false)] })
      replaced.current = true
    }
  }, [value])

  React.useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(languageExtension(language)) })
  }, [language])

  // After the value effect, so the classes land on the text they were worked out from.
  React.useEffect(() => {
    const v = view.current
    v?.dispatch({ effects: tints.current.reconfigure(lineClasses?.length ? lineDecorations(v.state.doc, lineClasses) : []) })
  }, [lineClasses, value])

  React.useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure(EditorState.readOnly.of(!!readOnly)) })
  }, [readOnly])

  // `line` is a 1-based number, or a { line } object: a new object always jumps, even to the same line.
  // Declared after the value effect so replaced text is in place first; typing alone never re-jumps.
  React.useEffect(() => {
    const v = view.current
    const wanted = typeof line === 'object' && line ? line.line : line
    const changed = jumped.current !== line
    const wasReplaced = replaced.current
    jumped.current = line
    replaced.current = false
    if (!v || !(changed || wasReplaced) || typeof wanted !== 'number' || !Number.isFinite(wanted)) return
    const pos = v.state.doc.line(Math.min(Math.max(1, Math.floor(wanted)), v.state.doc.lines)).from
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
  }, [line, value])

  return <div ref={host} style={{ flex: 1, minHeight, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }} />
}
