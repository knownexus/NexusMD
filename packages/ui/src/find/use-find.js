// use-find.js — the state of a find-in-file bar: open, the query, case, and which match is current.
// The view's adapter (useDomFind, useTextareaFind, CodeEditor.find …) works out the matches and calls report(count).
import React from 'react'
import { stepIndex } from '@nexusmd/core'

export function useFind() {
  const [open, setOpen] = React.useState(false)
  const [query, setQueryState] = React.useState('')
  const [matchCase, setMatchCaseState] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const [count, setCount] = React.useState(0)
  const countRef = React.useRef(0)

  const setQuery = React.useCallback(q => { setQueryState(q); setIndex(0) }, [])
  const setMatchCase = React.useCallback(b => { setMatchCaseState(b); setIndex(0) }, [])
  const report = React.useCallback(n => {
    countRef.current = n
    setCount(n)
    setIndex(i => Math.max(0, Math.min(i, n - 1)))
  }, [])
  const next = React.useCallback(() => setIndex(i => stepIndex(i, countRef.current, 1)), [])
  const prev = React.useCallback(() => setIndex(i => stepIndex(i, countRef.current, -1)), [])
  const close = React.useCallback(() => setOpen(false), [])

  return { open, setOpen, close, query, setQuery, matchCase, setMatchCase, index, count, report, next, prev }
}
