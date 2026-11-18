import { describe, it, expect } from 'vitest'
import { inScope, normaliseExtensions, searchTexts, cutLine, SEARCH_CAPS } from '../src/modules/repo-search/index.js'

describe('normaliseExtensions', () => {
  it('splits on commas and spaces, lower-cases, strips dots, drops empties and repeats', () => {
    expect(normaliseExtensions('.CS, js  ts,js')).toEqual(['cs', 'js', 'ts'])
    expect(normaliseExtensions('')).toEqual([])
    expect(normaliseExtensions(' , ')).toEqual([])
  })
})

describe('inScope', () => {
  it('a folder matches itself and what is under it, not a folder that merely starts the same', () => {
    expect(inScope('src/a.js', { folders: ['src'] })).toBe(true)
    expect(inScope('src/deep/a.js', { folders: ['src'] })).toBe(true)
    expect(inScope('srcs/a.js', { folders: ['src'] })).toBe(false)
    expect(inScope('src/a.js', { folders: ['src/'] })).toBe(true)
    expect(inScope('src', { folders: ['src'] })).toBe(true)
  })
  it('an extension is compared case-insensitively on the last extension', () => {
    expect(inScope('a/b.CS', { extensions: ['cs'] })).toBe(true)
    expect(inScope('a/b.cs.bak', { extensions: ['cs'] })).toBe(false)
    expect(inScope('a/Makefile', { extensions: ['cs'] })).toBe(false)
  })
  it('empty scope means everything; folder and extension must both hold', () => {
    expect(inScope('x/y.z', {})).toBe(true)
    expect(inScope('x/y.z', { folders: [], extensions: [] })).toBe(true)
    expect(inScope('src/a.js', { folders: ['src'], extensions: ['cs'] })).toBe(false)
    expect(inScope('src/a.cs', { folders: ['src'], extensions: ['cs'] })).toBe(true)
  })
})

describe('cutLine', () => {
  it('leaves a short line alone', () => {
    expect(cutLine('hello world', 6, 11)).toEqual({ text: 'hello world', start: 6, end: 11 })
  })
  it('cuts a long line to 300 characters around the match, keeping offsets into the cut text', () => {
    const line = 'x'.repeat(5000) + 'NEEDLE' + 'y'.repeat(5000)
    const c = cutLine(line, 5000, 5006)
    expect(c.text.length).toBeLessThanOrEqual(300)
    expect(c.text.slice(c.start, c.end)).toBe('NEEDLE')
  })
})

describe('searchTexts', () => {
  it('gives 1-based line numbers and offsets, one match per matching line', () => {
    const r = searchTexts([{ path: 'a.txt', text: 'a\nfoo\nbar foo foo' }], 'foo')
    expect(r.capped).toBe(false)
    expect(r.results).toHaveLength(1)
    expect(r.results[0].path).toBe('a.txt')
    expect(r.results[0].matches.map(m => m.line)).toEqual([2, 3])
    const m = r.results[0].matches[1]
    expect(m.text.slice(m.start, m.end)).toBe('foo')
    expect(m.start).toBe(4)
  })
  it('handles CRLF line endings', () => {
    const r = searchTexts([{ path: 'a', text: 'one\r\nfoo\r\n' }], 'foo')
    expect(r.results[0].matches[0].text).toBe('foo')
  })
  it('ignores case unless asked, and takes the query literally', () => {
    const files = [{ path: 'a', text: 'Foo\n(x)' }]
    expect(searchTexts(files, 'foo').results[0].matches).toHaveLength(1)
    expect(searchTexts(files, 'foo', { matchCase: true }).results).toHaveLength(0)
    expect(searchTexts(files, '(x)').results[0].matches[0].line).toBe(2)
    expect(() => searchTexts(files, '[')).not.toThrow()
  })
  it('skips files without matches and returns nothing for an empty query', () => {
    expect(searchTexts([{ path: 'a', text: 'zzz' }], 'foo').results).toEqual([])
    expect(searchTexts([{ path: 'a', text: 'foo' }], '')).toEqual({ results: [], capped: false })
  })
  it('cuts a very long line so the snippet stays small and still holds the match', () => {
    const text = 'x'.repeat(10000) + 'foo' + 'y'.repeat(10000)
    const m = searchTexts([{ path: 'min.js', text }], 'foo').results[0].matches[0]
    expect(m.text.length).toBeLessThanOrEqual(300)
    expect(m.text.slice(m.start, m.end)).toBe('foo')
  })
  it('caps matches per file, files and matches in total, and says so', () => {
    expect(SEARCH_CAPS).toEqual({ files: 200, perFile: 50, total: 1000 })
    const many = 'foo\n'.repeat(60)
    const a = searchTexts([{ path: 'a', text: many }], 'foo')
    expect(a.results[0].matches).toHaveLength(50)
    expect(a.capped).toBe(true)
    const files = Array.from({ length: 250 }, (_, i) => ({ path: `f${i}`, text: 'foo' }))
    const b = searchTexts(files, 'foo')
    expect(b.results).toHaveLength(200)
    expect(b.capped).toBe(true)
    const rich = Array.from({ length: 30 }, (_, i) => ({ path: `g${i}`, text: 'foo\n'.repeat(40) }))
    const c = searchTexts(rich, 'foo')
    expect(c.results.reduce((n, r) => n + r.matches.length, 0)).toBe(1000)
    expect(c.capped).toBe(true)
  })
  it('is not capped when everything fits', () => {
    expect(searchTexts([{ path: 'a', text: 'foo\n'.repeat(50) }], 'foo').capped).toBe(false)
  })
})
