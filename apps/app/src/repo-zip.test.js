import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { unpackBranchZip, ZIP_LIMIT, UNPACK_LIMIT } from './repo-zip.js'

const make = async files => {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

describe('unpackBranchZip', () => {
  it('returns the text files, strips the top folder, and skips binary and big files', async () => {
    const bytes = await make({
      'repo-abc123/src/a.cs': 'class A {}\n',
      'repo-abc123/bin/x.png': new Uint8Array([0x89, 0x50, 0x00, 0x01]),
      'repo-abc123/big.txt': 'x'.repeat(2 * 1024 * 1024),
      'repo-abc123/readme.md': '# hi',
    })
    const files = await unpackBranchZip(bytes, { stripTop: true })
    expect(files.map(f => f.path).sort()).toEqual(['readme.md', 'src/a.cs'])
    expect(files.find(f => f.path === 'src/a.cs').text).toBe('class A {}\n')
  })
  it('keeps paths as they are when there is no top folder to strip', async () => {
    const files = await unpackBranchZip(await make({ 'src/a.cs': 'a' }), { stripTop: false })
    expect(files.map(f => f.path)).toEqual(['src/a.cs'])
  })
  it('only unpacks what include() accepts', async () => {
    const bytes = await make({ 'r/src/a.cs': 'a', 'r/docs/b.md': 'b' })
    const files = await unpackBranchZip(bytes, { stripTop: true, include: p => p.startsWith('docs/') })
    expect(files.map(f => f.path)).toEqual(['docs/b.md'])
  })
  it('skips a file that is not valid UTF-8 without failing', async () => {
    const bytes = await make({ 'r/ok.txt': 'fine', 'r/bad.txt': new Uint8Array([0xff, 0xfe, 0xfd, 0x41]) })
    const files = await unpackBranchZip(bytes, { stripTop: true })
    expect(files.map(f => f.path)).toEqual(['ok.txt'])
  })
  it('refuses a download over the limit, by its declared size, without unpacking it', async () => {
    expect(ZIP_LIMIT).toBe(50 * 1024 * 1024)
    await expect(unpackBranchZip(new Uint8Array([1, 2, 3]), { declaredSize: 60 * 1024 * 1024 })).rejects.toThrow(/too large to search on the phone \(60 MB\)/)
  })
  it('refuses bytes over the limit too', async () => {
    await expect(unpackBranchZip({ length: ZIP_LIMIT + 1 }, {})).rejects.toThrow(/too large to search on the phone/)
  })
  it('stops and says so when the files add up to more than it will unpack, instead of inflating everything', async () => {
    expect(UNPACK_LIMIT).toBe(150 * 1024 * 1024)
    const bytes = await make({ 'r/a.txt': 'a'.repeat(600), 'r/b.txt': 'b'.repeat(600), 'r/c.txt': 'c'.repeat(600) })
    await expect(unpackBranchZip(bytes, { stripTop: true, maxTotal: 1000 })).rejects.toThrow(/too large to search on the phone/)
  })
  it('reads a huge, well-compressed file only as far as the size limit (a decompression bomb)', async () => {
    // 20 MB of one repeated letter compresses to a few KB; it must be skipped, and not slow the rest down.
    const bytes = await make({ 'r/bomb.txt': 'z'.repeat(20 * 1024 * 1024), 'r/ok.txt': 'fine' })
    expect(bytes.length).toBeLessThan(100 * 1024)
    const started = Date.now()
    const files = await unpackBranchZip(bytes, { stripTop: true })
    expect(files.map(f => f.path)).toEqual(['ok.txt'])
    expect(Date.now() - started).toBeLessThan(5000)
  })
})
