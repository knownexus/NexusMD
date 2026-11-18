// Find-in-file: literal matching of a query in a text, shared by every viewer that offers a find bar.

export const FIND_LIMIT = 5000

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every literal, non-overlapping match of `query` in `text`, left to right, as { start, end } offsets into `text`.
 * Case-insensitive unless `matchCase`. Stops at `limit` matches (default FIND_LIMIT).
 */
export function findMatches(text, query, { matchCase = false, limit = FIND_LIMIT } = {}) {
  const out = []
  if (!text || !query) return out
  const hay = matchCase ? text : text.toLowerCase()
  if (hay.length !== text.length) {
    // Lower-casing moved the offsets (e.g. İ): match on the original text instead.
    const re = new RegExp(escapeRegExp(query), matchCase ? 'gu' : 'giu')
    for (let m = re.exec(text); m && out.length < limit; m = re.exec(text)) {
      out.push({ start: m.index, end: m.index + m[0].length })
    }
    return out
  }
  const needle = matchCase ? query : query.toLowerCase()
  if (!needle) return out
  for (let i = hay.indexOf(needle); i !== -1 && out.length < limit; i = hay.indexOf(needle, i + needle.length)) {
    out.push({ start: i, end: i + needle.length })
  }
  return out
}

/** The index after stepping `dir` (1 or -1) from `index` among `count` matches, wrapping around; 0 when there are none. */
export function stepIndex(index, count, dir) {
  if (count <= 0) return 0
  return (((index + dir) % count) + count) % count
}

/** `text` cut into consecutive segments { text, hit, matchIndex } at the given matches; no empty segments. */
export function splitAtMatches(text, matches) {
  const out = []
  let at = 0
  matches.forEach((m, i) => {
    if (m.start > at) out.push({ text: text.slice(at, m.start), hit: false, matchIndex: null })
    if (m.end > m.start) out.push({ text: text.slice(m.start, m.end), hit: true, matchIndex: i })
    at = m.end
  })
  if (at < text.length) out.push({ text: text.slice(at), hit: false, matchIndex: null })
  return out
}
