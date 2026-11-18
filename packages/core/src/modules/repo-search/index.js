// Repo search: which files of a repo are in scope, and a search of their texts. Used by the Android repo search
// (which has the texts) and shares its result shape with the desktop `git grep`.
import { findMatches } from '../find/index.js'

export const SEARCH_CAPS = { files: 200, perFile: 50, total: 1000 }
const SNIPPET = 300

/** 'cs, .JS  ts' → ['cs', 'js', 'ts']: lower-case, no dots, no empties, no repeats. */
export function normaliseExtensions(input) {
  const out = []
  for (const part of String(input ?? '').split(/[\s,]+/)) {
    const ext = part.replace(/^\.+/, '').toLowerCase()
    if (ext && !out.includes(ext)) out.push(ext)
  }
  return out
}

const stripSlashes = p => String(p).replace(/^\/+|\/+$/g, '')

/** Whether the repo-relative `path` is in `scope` ({ folders, extensions }; empty means everything). */
export function inScope(path, { folders = [], extensions = [] } = {}) {
  if (folders.length) {
    const inside = folders.some(f => {
      const dir = stripSlashes(f)
      return dir === '' || path === dir || path.startsWith(dir + '/')
    })
    if (!inside) return false
  }
  if (extensions.length) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    // A dot-file (.gitignore) has no extension.
    if (dot <= 0 || !extensions.includes(name.slice(dot + 1).toLowerCase())) return false
  }
  return true
}

/** A line cut to at most 300 characters around the match at [start, end); start/end are offsets into the cut text. */
export function cutLine(line, start, end) {
  if (line.length <= SNIPPET) return { text: line, start, end }
  const from = Math.max(0, Math.min(start - 100, line.length - SNIPPET))
  const text = line.slice(from, from + SNIPPET)
  return { text, start: start - from, end: Math.min(end - from, text.length) }
}

/**
 * Searches `files` ([{ path, text }]) for `query`. One match per matching line, with 1-based `line` and the
 * first occurrence's offsets in the (cut) text. Stops at the caps in SEARCH_CAPS and says so in `capped`.
 */
export function searchTexts(files, query, { matchCase = false } = {}) {
  const results = []
  if (!query) return { results, capped: false }
  let total = 0
  let capped = false
  for (const file of files) {
    const lines = file.text.split('\n')
    const matches = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
      const [m] = findMatches(line, query, { matchCase, limit: 1 })
      if (!m) continue
      if (matches.length >= SEARCH_CAPS.perFile || total >= SEARCH_CAPS.total) { capped = true; break }
      matches.push({ line: i + 1, ...cutLine(line, m.start, m.end) })
      total++
    }
    if (!matches.length) continue
    if (results.length >= SEARCH_CAPS.files) { capped = true; break }
    results.push({ path: file.path, matches })
  }
  return { results, capped }
}
