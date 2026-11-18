import { describe, it, expect } from 'vitest'
import { findMatches, stepIndex, splitAtMatches, FIND_LIMIT } from '../src/modules/find/index.js'

const spans = (text, ms) => ms.map(m => text.slice(m.start, m.end))

describe('findMatches', () => {
  it('treats the query literally', () => {
    expect(findMatches('a.b a.b', '.').map(m => m.start)).toEqual([1, 5])
  })
  it('does not throw on regex metacharacters', () => {
    expect(spans('(x)[y]', findMatches('(x)[y]', '(x)'))).toEqual(['(x)'])
    expect(() => findMatches('a\\b', '\\')).not.toThrow()
    expect(findMatches('a\\b', '\\')).toHaveLength(1)
    expect(() => findMatches('x', '[')).not.toThrow()
    expect(() => findMatches('x', '*')).not.toThrow()
  })
  it('is case-insensitive by default and honours matchCase', () => {
    expect(findMatches('Foo foo', 'FOO')).toHaveLength(2)
    expect(findMatches('Foo foo', 'FOO', { matchCase: true })).toHaveLength(0)
    expect(findMatches('Foo foo', 'Foo', { matchCase: true })).toHaveLength(1)
  })
  it('does not overlap matches', () => {
    expect(findMatches('aaa', 'aa')).toEqual([{ start: 0, end: 2 }])
  })
  it('returns nothing for an empty query or text', () => {
    expect(findMatches('abc', '')).toEqual([])
    expect(findMatches('', 'a')).toEqual([])
  })
  it('keeps offsets on the original string when case folding changes length', () => {
    const t = 'İstanbul İ'
    const ms = findMatches(t, 'İ')
    expect(ms).toHaveLength(2)
    expect(spans(t, ms)).toEqual(['İ', 'İ'])
    const s = 'Straße ß'
    expect(spans(s, findMatches(s, 'ß'))).toEqual(['ß', 'ß'])
    expect(spans('İstanbul', findMatches('İstanbul', 'stan'))).toEqual(['stan'])
  })
  it('caps the number of matches', () => {
    expect(FIND_LIMIT).toBe(5000)
    expect(findMatches('a'.repeat(200000), 'a')).toHaveLength(5000)
    expect(findMatches('aaaa', 'a', { limit: 2 })).toHaveLength(2)
  })
})

describe('stepIndex', () => {
  it('wraps around both ways', () => {
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(1, 3, 1)).toBe(2)
  })
  it('is 0 when there is nothing to step through', () => {
    expect(stepIndex(0, 0, 1)).toBe(0)
    expect(stepIndex(4, 0, -1)).toBe(0)
  })
})

describe('splitAtMatches', () => {
  it('covers the whole string in order', () => {
    const segs = splitAtMatches('abcabc', [{ start: 1, end: 3 }])
    expect(segs.map(s => s.text)).toEqual(['a', 'bc', 'abc'])
    expect(segs.map(s => s.hit)).toEqual([false, true, false])
    expect(segs.map(s => s.matchIndex)).toEqual([null, 0, null])
  })
  it('has no empty segments and handles edge matches', () => {
    const segs = splitAtMatches('ab', [{ start: 0, end: 1 }, { start: 1, end: 2 }])
    expect(segs.map(s => s.text)).toEqual(['a', 'b'])
    expect(segs.map(s => s.matchIndex)).toEqual([0, 1])
    expect(splitAtMatches('abc', [])).toEqual([{ text: 'abc', hit: false, matchIndex: null }])
    expect(splitAtMatches('', [])).toEqual([])
  })
})
