import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadRepoTexts, clearRepoTexts } from './repo-texts.js'

const paths = (n, prefix = 'src/f') => Array.from({ length: n }, (_, i) => `${prefix}${i}.cs`)
const fake = ({ files, commit = 'c1', zip = null } = {}) => ({
  listTree: vi.fn(async () => ({ files, commit })),
  getFile: vi.fn(async (_r, _b, p) => `text of ${p}`),
  downloadZip: vi.fn(async (_r, _b, opts) => (zip ?? files.map(p => ({ path: p, text: `zip of ${p}` }))).filter(f => !opts?.include || opts.include(f.path))),
})
const repo = { id: 'r1', provider: 'github', fullName: 'a/b' }

beforeEach(() => clearRepoTexts())

describe('loadRepoTexts', () => {
  it('fetches only the files in scope, one by one, when there are 60 or fewer', async () => {
    const backend = fake({ files: [...paths(3), ...paths(197, 'other/f')] })
    const r = await loadRepoTexts({ backend, repo, branch: 'main', scope: { folders: ['src'] } })
    expect(r.via).toBe('files')
    expect(r.total).toBe(3)
    expect(backend.getFile).toHaveBeenCalledTimes(3)
    expect(backend.downloadZip).not.toHaveBeenCalled()
    expect(r.files.map(f => f.path)).toEqual(paths(3))
    expect(r.commit).toBe('c1')
  })
  it('uses the zip when more than 60 files are in scope, and keeps only the files in scope', async () => {
    const backend = fake({ files: [...paths(61), 'docs/readme.md'] })
    const r = await loadRepoTexts({ backend, repo, branch: 'main', scope: { extensions: ['cs'] } })
    expect(r.via).toBe('zip')
    expect(backend.downloadZip).toHaveBeenCalledTimes(1)
    expect(backend.getFile).not.toHaveBeenCalled()
    expect(r.files).toHaveLength(61)
    expect(r.files.every(f => f.path.endsWith('.cs'))).toBe(true)
  })
  it('does not ask again for the same commit, but does for a new one', async () => {
    const backend = fake({ files: paths(2) })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    expect(backend.getFile).toHaveBeenCalledTimes(2)
    backend.listTree.mockResolvedValue({ files: paths(2), commit: 'c2' })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    expect(backend.getFile).toHaveBeenCalledTimes(4)
  })
  it('does not download the zip a second time for the same commit', async () => {
    const backend = fake({ files: paths(70) })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    expect(backend.downloadZip).toHaveBeenCalledTimes(1)
  })
  it('reports progress while fetching files', async () => {
    const backend = fake({ files: paths(3) })
    const onProgress = vi.fn()
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {}, onProgress })
    expect(onProgress).toHaveBeenLastCalledWith({ done: 3, total: 3 })
  })
  it('skips a file that cannot be shown as text without failing the search', async () => {
    const backend = fake({ files: paths(3) })
    backend.getFile.mockImplementation(async (_r, _b, p) => { if (p.includes('f1')) throw new Error('Only text files can be shown here.'); return 'ok' })
    const r = await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    expect(r.files.map(f => f.path)).toEqual(paths(3).filter(p => !p.includes('f1')))
  })
  it('stops when aborted, and an aborted zip leaves nothing behind', async () => {
    const ctl = new AbortController()
    const backend = fake({ files: paths(70) })
    backend.downloadZip.mockImplementation(async () => { ctl.abort(); return paths(70).map(p => ({ path: p, text: 'x' })) })
    await expect(loadRepoTexts({ backend, repo, branch: 'main', scope: {}, signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    backend.downloadZip.mockImplementation(async () => paths(70).map(p => ({ path: p, text: 'y' })))
    const r = await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    expect(backend.downloadZip).toHaveBeenCalledTimes(2)
    expect(r.files[0].text).toBe('y')
  })
  it('clearRepoTexts forgets what was loaded', async () => {
    const backend = fake({ files: paths(2) })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    clearRepoTexts('r1')
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    expect(backend.getFile).toHaveBeenCalledTimes(4)
  })
  it('keeps one repo or branch from answering for another', async () => {
    const backend = fake({ files: paths(1) })
    await loadRepoTexts({ backend, repo, branch: 'main', scope: {} })
    await loadRepoTexts({ backend, repo, branch: 'dev', scope: {} })
    await loadRepoTexts({ backend, repo: { ...repo, id: 'r2' }, branch: 'main', scope: {} })
    expect(backend.getFile).toHaveBeenCalledTimes(3)
  })
})
