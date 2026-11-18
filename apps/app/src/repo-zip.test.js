import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { unpackBranchZip, ZIP_LIMIT } from './repo-zip.js'

const make = async files => {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'uint8array' })
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
})
