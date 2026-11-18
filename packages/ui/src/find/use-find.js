// use-find.js — the state of a find-in-file bar: open, the query, case, and which match is current.
// The view's adapter (useDomFind, useTextareaFind, CodeEditor.find …) works out the matches and calls report(count).
import React from 'react'
import { stepIndex } from '@nexusmd/core'

export function useFind() {
  const [open, setOpenState] = React.useState(false)
  const [focusTick, setFocusTick] = React.useState(0)
  const [query, setQueryState] = React.useState('')
  const [matchCase, setMatchCaseState] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const [count, setCount] = React.useState(0)
  const countRef = React.useRef(0)

  // Opening while already open still counts: the bar takes focus back (Ctrl+F from the text).
  const setOpen = React.useCallback(b => { setOpenState(b); if (b) setFocusTick(t => t + 1) }, [])
  const setQuery = React.useCallback(q => { setQueryState(q); setIndex(0) }, [])
  const setMatchCase = React.useCallback(b => { setMatchCaseState(b); setIndex(0) }, [])
  const report = React.useCallback(n => {
    countRef.current = n
    setCount(n)
    setIndex(i => Math.max(0, Math.min(i, n - 1)))
  }, [])
  const next = React.useCallback(() => setIndex(i => stepIndex(i, countRef.current, 1)), [])
  const prev = React.useCallback(() => setIndex(i => stepIndex(i, countRef.current, -1)), [])
  const close = React.useCallback(() => setOpenState(false), [])

  return { open, setOpen, focusTick, close, query, setQuery, matchCase, setMatchCase, index, count, report, next, prev }
}
