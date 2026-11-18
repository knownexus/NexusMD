import { describe, it, expect, vi } from 'vitest'
import { makeGitBackend, githubReposFromConfig, isGithubRepo, providerName } from './git-backend.js'

const reply = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(data) })
const fakeGithub = (routes) => ({ fetch: vi.fn(async (path) => {
  const hit = Object.entries(routes).find(([p]) => path.startsWith(p))
  return hit ? reply(typeof hit[1] === 'function' ? hit[1](path) : hit[1]) : reply({ message: 'nope' }, 404)
}) })

const make = (over = {}) => makeGitBackend({
  adoGet: vi.fn(), getAdoProjects: () => [], githubHttp: fakeGithub({}),
  getGithubConfig: () => ({ repos: ['acme/web', 'me/dots'] }), isGithubConfigured: () => true, ...over,
})

describe('githubReposFromConfig', () => {
  it('turns ticked repos into repo objects owned by their owner', () => {
    expect(githubReposFromConfig({ repos: ['acme/web'] })).toEqual([
      { id: 'gh:acme/web', name: 'web', project: 'acme', fullName: 'acme/web', defaultBranch: '', provider: 'github' },
    ])
    expect(githubReposFromConfig(null)).toEqual([])
  })
})

describe('git backend', () => {
  it('lists the ticked GitHub repos beside ADO ones', async () => {
    const adoGet = vi.fn(async () => ({ value: [{ id: '1', name: 'alpha', defaultBranch: 'refs/heads/main' }] }))
    const { repos, errors } = await make({ adoGet, getAdoProjects: () => ['P'] }).listRepos()
    expect(errors).toEqual([])
    expect(repos.map(r => `${r.provider}:${r.name}`)).toEqual(['ado:alpha', 'github:web', 'github:dots'])
  })

  it('still lists GitHub repos when ADO fails, and reports the error', async () => {
    const adoGet = vi.fn(async () => { throw new Error('ADO 401') })
    const { repos, errors } = await make({ adoGet, getAdoProjects: () => ['P'] }).listRepos()
    expect(repos.map(r => r.provider)).toEqual(['github', 'github'])
    expect(errors[0].message).toBe('ADO 401')
  })

  it('lists no GitHub repos while GitHub is not configured', async () => {
    const { repos } = await make({ isGithubConfigured: () => false }).listRepos()
    expect(repos).toEqual([])
  })

  it('reads GitHub branches, commits, folders and files in the UI shapes', async () => {
    const b = make({ githubHttp: fakeGithub({
      'repos/acme/web/branches': [{ name: 'dev', commit: { sha: 'a' } }, { name: 'main', commit: { sha: 'b' } }],
      'repos/acme/web/commits': [{ sha: 'abcdef1234567', commit: { message: 'Fix it\n\nbody', author: { name: 'Ann', date: '2026-10-01' } } }],
      'repos/acme/web/contents/src': [{ name: 'a.js', path: 'src/a.js', type: 'file' }, { name: 'lib', path: 'src/lib', type: 'dir' }],
      'repos/acme/web/contents/README.md': { content: btoa('# Hi'), size: 4, html_url: 'u' },
      'repos/acme/web': { default_branch: 'main' },
    }) })
    const repo = githubReposFromConfig({ repos: ['acme/web'] })[0]
    expect((await b.listBranches(repo)).map(x => `${x.name}${x.isDefault ? '*' : ''}`)).toEqual(['main*', 'dev'])
    expect(await b.listCommits(repo, 'main')).toEqual([{ id: 'abcdef1234567', shortId: 'abcdef12', message: 'Fix it', author: 'Ann', date: '2026-10-01', url: 'https://github.com/acme/web/commit/abcdef1234567' }])
    expect(await b.listItems(repo, 'main', '/src')).toEqual([{ path: '/src/lib', name: 'lib', isFolder: true }, { path: '/src/a.js', name: 'a.js', isFolder: false }])
    expect(await b.getFile(repo, 'main', '/README.md')).toBe('# Hi')
  })

  it('refuses binary files with a readable message', async () => {
    const b = make({ githubHttp: fakeGithub({ 'repos/acme/web/contents/x.bin': { content: btoa('a\0b'), size: 3 } }) })
    await expect(b.getFile(githubReposFromConfig({ repos: ['acme/web'] })[0], 'main', '/x.bin')).rejects.toThrow('Only text files')
  })

  it('labels repos by provider', () => {
    expect(isGithubRepo({ provider: 'github' })).toBe(true)
    expect(providerName({ provider: 'github' })).toBe('GitHub')
    expect(providerName({ provider: 'ado' })).toBe('Azure DevOps')
  })
})

import { sourcesOf, pickSource, sourceLabel } from './git-backend.js'

describe('repo sources', () => {
  const ado = { id: '1', provider: 'ado' }, gh = { id: 'gh:a/b', provider: 'github' }
  it('lists only the providers that have repos, in a fixed order', () => {
    expect(sourcesOf([gh, ado])).toEqual(['ado', 'github'])
    expect(sourcesOf([gh])).toEqual(['github'])
    expect(sourcesOf([])).toEqual([])
    expect(sourcesOf([{ id: 'old' }])).toEqual(['ado'])
  })
  it('keeps the saved choice while it still has repos, else the first available', () => {
    expect(pickSource('github', ['ado', 'github'])).toBe('github')
    expect(pickSource('github', ['ado'])).toBe('ado')
    expect(pickSource(null, ['github'])).toBe('github')
    expect(pickSource('ado', [])).toBeNull()
  })
  it('names the sources', () => {
    expect(sourceLabel('github')).toBe('GitHub')
    expect(sourceLabel('ado')).toBe('Azure DevOps')
  })
})

describe('git backend: listing and downloading a whole branch', () => {
  const zipOf = async (files) => {
    const z = new (await import('jszip')).default()
    for (const [n, c] of Object.entries(files)) z.file(n, c)
    return z.generateAsync({ type: 'uint8array' })
  }

  it('lists a GitHub branch tree with its commit id', async () => {
    const b = make({ githubHttp: fakeGithub({
      'repos/acme/web/commits/main': { sha: 'c0ffee' },
      'repos/acme/web/git/trees/c0ffee': { sha: 't', truncated: false, tree: [{ path: 'src', type: 'tree' }, { path: 'src/a.js', type: 'blob' }, { path: 'README.md', type: 'blob' }] },
    }) })
    expect(await b.listTree({ provider: 'github', fullName: 'acme/web' }, 'main')).toEqual({ files: ['src/a.js', 'README.md'], commit: 'c0ffee' })
  })
  it('says so when GitHub cuts the tree short', async () => {
    const b = make({ githubHttp: fakeGithub({
      'repos/acme/web/commits/main': { sha: 'c0ffee' },
      'repos/acme/web/git/trees/c0ffee': { sha: 't', truncated: true, tree: [] },
    }) })
    await expect(b.listTree({ provider: 'github', fullName: 'acme/web' }, 'main')).rejects.toThrow(/too large to list/)
  })
  it('lists an Azure DevOps branch tree with its commit id', async () => {
    const adoGet = vi.fn(async (p) => (p.includes('/refs?')
      ? { value: [{ name: 'refs/heads/main', objectId: 'abc123' }] }
      : { value: [{ path: '/', isFolder: true }, { path: '/src', isFolder: true }, { path: '/src/a.cs', isFolder: false }] }))
    const r = await make({ adoGet }).listTree({ id: 'r1', project: 'P' }, 'main')
    expect(r).toEqual({ files: ['src/a.cs'], commit: 'abc123' })
    expect(adoGet.mock.calls.some(([p]) => p.includes('recursionLevel=Full'))).toBe(true)
  })
  it('downloads a GitHub branch zip and unpacks it without its top folder', async () => {
    const bytes = await zipOf({ 'web-abc/src/a.js': 'a', 'web-abc/img.png': new Uint8Array([0, 1]) })
    const githubGetBinary = vi.fn(async () => ({ bytes }))
    const b = make({ githubGetBinary, githubHttp: fakeGithub({ 'repos/acme/web': { size: 10 } }) })
    const files = await b.downloadZip({ provider: 'github', fullName: 'acme/web' }, 'feature/x', {})
    expect(githubGetBinary.mock.calls[0][0]).toBe('repos/acme/web/zipball/feature%2Fx')
    expect(files).toEqual([{ path: 'src/a.js', text: 'a' }])
  })
  it('downloads an Azure DevOps branch zip as it is', async () => {
    const bytes = await zipOf({ 'src/a.cs': 'a' })
    const adoGetBinary = vi.fn(async () => ({ bytes }))
    const files = await make({ adoGetBinary }).downloadZip({ id: 'r1', project: 'P Q' }, 'main', {})
    expect(adoGetBinary.mock.calls[0][0]).toContain('P%20Q/_apis/git/repositories/r1/items')
    expect(adoGetBinary.mock.calls[0][0]).toContain('$format=zip')
    expect(files).toEqual([{ path: 'src/a.cs', text: 'a' }])
  })
  it('refuses a GitHub repository that reports a size over the limit before downloading it', async () => {
    const githubGetBinary = vi.fn()
    const b = make({ githubGetBinary, githubHttp: fakeGithub({ 'repos/acme/web': { size: 400 * 1024 } }) })
    await expect(b.downloadZip({ provider: 'github', fullName: 'acme/web' }, 'main', {})).rejects.toThrow(/too large to search on the phone/)
    expect(githubGetBinary).not.toHaveBeenCalled()
  })
})

describe('git backend: reading at a commit', () => {
  const zipOf = async (files) => {
    const z = new (await import('jszip')).default()
    for (const [n, c] of Object.entries(files)) z.file(n, c)
    return z.generateAsync({ type: 'uint8array' })
  }
  it('reads a GitHub file and downloads a zip at the commit, not the branch name', async () => {
    const github = fakeGithub({ 'repos/acme/web/contents/a.js': { content: btoa('x'), size: 1, html_url: 'u' }, 'repos/acme/web': { size: 10 } })
    const githubGetBinary = vi.fn(async () => ({ bytes: await zipOf({ 'web-1/a.js': 'a' }) }))
    const b = make({ githubHttp: github, githubGetBinary })
    await b.getFile({ provider: 'github', fullName: 'acme/web' }, { commit: 'c0ffee' }, '/a.js')
    expect(github.fetch.mock.calls.some(([p]) => p.includes('contents/a.js?ref=c0ffee'))).toBe(true)
    await b.downloadZip({ provider: 'github', fullName: 'acme/web' }, { commit: 'c0ffee' }, {})
    expect(githubGetBinary.mock.calls[0][0]).toBe('repos/acme/web/zipball/c0ffee')
  })
  it('reads an Azure DevOps file and zip at the commit', async () => {
    const adoGet = vi.fn(async () => 'text')
    const adoGetBinary = vi.fn(async () => ({ bytes: await zipOf({ 'a.cs': 'a' }) }))
    const b = make({ adoGet, adoGetBinary })
    await b.getFile({ id: 'r1', project: 'P' }, { commit: 'abc123' }, '/a.cs')
    expect(adoGet.mock.calls[0][0]).toContain('versionDescriptor.versionType=commit')
    expect(adoGet.mock.calls[0][0]).toContain('versionDescriptor.version=abc123')
    await b.downloadZip({ id: 'r1', project: 'P' }, { commit: 'abc123' }, {})
    expect(adoGetBinary.mock.calls[0][0]).toContain('versionDescriptor.versionType=commit')
  })
  it('lists an Azure DevOps tree at the commit it resolved first', async () => {
    const calls = []
    const adoGet = vi.fn(async (p) => { calls.push(p); return p.includes('/refs?') ? { value: [{ name: 'refs/heads/main', objectId: 'abc123' }] } : { value: [{ path: '/a.cs', isFolder: false }] } })
    const r = await make({ adoGet }).listTree({ id: 'r1', project: 'P' }, 'main')
    expect(r.commit).toBe('abc123')
    expect(calls[0]).toContain('/refs?')
    expect(calls[1]).toContain('versionDescriptor.versionType=commit')
    expect(calls[1]).toContain('versionDescriptor.version=abc123')
  })
})
