// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { register } from './git.cjs'

let root
let template
let n = 0
const handlers = {}
const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM }
const run = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
const call = (channel, ...args) => handlers[channel](null, ...args)
const repo = { name: 'Work', path: null }
const REG = () => [repo.path]
const disk = file => path.join(repo.path, file)
const grep = (query, options) => call('git:grep', repo, repo.path, REG(), query, options)
const paths = r => r.results.map(x => x.path).sort()

beforeAll(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nexusmd-gitg-')))
  const globalConfig = path.join(root, 'gitconfig')
  fs.writeFileSync(globalConfig, '[user]\n\tname = Test\n\temail = test@example.invalid\n[core]\n\tautocrlf = false\n')
  process.env.GIT_CONFIG_GLOBAL = globalConfig
  process.env.GIT_CONFIG_NOSYSTEM = '1'

  template = path.join(root, '.template')
  repo.path = path.join(template, 'Work')
  fs.mkdirSync(path.join(repo.path, 'src'), { recursive: true })
  fs.mkdirSync(path.join(repo.path, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(repo.path, '-rf'), { recursive: true })
  run(repo.path, 'init', '-b', 'main')
  fs.writeFileSync(disk('.gitignore'), '*.log\n')
  fs.writeFileSync(disk('src/a.cs'), 'one\nfoo bar\nthree\n')
  fs.writeFileSync(disk('docs/readme.md'), 'Foo here\n(x) and -n and --help\n')
  fs.writeFileSync(disk('-rf/odd.cs'), 'foo in odd\n')
  fs.writeFileSync(disk('blob.bin'), Buffer.from([0x66, 0x6f, 0x6f, 0x00, 0x01]))
  fs.writeFileSync(disk('src/many.cs'), 'foo\n'.repeat(60))
  fs.writeFileSync(disk('src/min.js'), 'x'.repeat(20000) + 'foo' + 'y'.repeat(20000) + '\n')
  run(repo.path, 'add', '.')
  run(repo.path, 'commit', '-m', 'Initial')
  fs.writeFileSync(disk('src/new.cs'), 'untracked foo\n')
  fs.writeFileSync(disk('ignored.log'), 'foo noise\n')

  register({ handle: (channel, fn) => { handlers[channel] = fn } }, { logger: { scope: () => ({ error: () => {}, info: () => {} }) } })
})

beforeEach(() => {
  const dir = path.join(root, 't' + n++)
  fs.cpSync(template, dir, { recursive: true })
  repo.path = path.join(dir, 'Work')
})

afterAll(() => {
  if (saved.global === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved.global
  if (saved.nosystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM; else process.env.GIT_CONFIG_NOSYSTEM = saved.nosystem
  fs.rmSync(root, { recursive: true, force: true })
})

describe('git:grep against a real repository', () => {
  it('finds lines in tracked and untracked files, not in ignored or binary ones, with line numbers and offsets', async () => {
    const r = await grep('foo')
    expect(paths(r)).toEqual(['-rf/odd.cs', 'docs/readme.md', 'src/a.cs', 'src/many.cs', 'src/min.js', 'src/new.cs'])
    const a = r.results.find(x => x.path === 'src/a.cs').matches
    expect(a).toHaveLength(1)
    expect(a[0].line).toBe(2)
    expect(a[0].text.slice(a[0].start, a[0].end)).toBe('foo')
    expect(a[0].text).toBe('foo bar')
  })
  it('ignores case unless matchCase', async () => {
    expect(paths(await grep('foo', { matchCase: true }))).not.toContain('docs/readme.md')
    expect(paths(await grep('foo'))).toContain('docs/readme.md')
  })
  it('limits to folders and to extensions, and to both together', async () => {
    expect(paths(await grep('foo', { folders: ['docs'] }))).toEqual(['docs/readme.md'])
    expect(paths(await grep('foo', { extensions: ['md'] }))).toEqual(['docs/readme.md'])
    expect(paths(await grep('foo', { folders: ['src'], extensions: ['cs'] }))).toEqual(['src/a.cs', 'src/many.cs', 'src/new.cs'])
    expect(paths(await grep('foo', { folders: ['src'], extensions: ['md'] }))).toEqual([])
  })
  it('treats the query and the folders as text, never as options or patterns', async () => {
    expect(paths(await grep('-n'))).toEqual(['docs/readme.md'])
    expect(paths(await grep('--help'))).toEqual(['docs/readme.md'])
    expect((await grep('(x')).results).toHaveLength(1)
    expect(paths(await grep('foo', { folders: ['-rf'] }))).toEqual(['-rf/odd.cs'])
    expect(paths(await grep('foo', { folders: ['*'] }))).toEqual([])
  })
  it('returns nothing for an empty query or no matches', async () => {
    expect(await grep('')).toEqual({ results: [], capped: false })
    expect(await grep('zzzzqqq')).toEqual({ results: [], capped: false })
  })
  it('caps matches per file and says so', async () => {
    const r = await grep('foo', { folders: ['src'], extensions: ['cs'] })
    expect(r.results.find(x => x.path === 'src/many.cs').matches).toHaveLength(50)
    expect(r.capped).toBe(true)
  })
  it('cuts a very long line to a short snippet that still holds the match', async () => {
    const m = (await grep('foo', { folders: ['src'], extensions: ['js'] })).results[0].matches[0]
    expect(m.text.length).toBeLessThanOrEqual(300)
    expect(m.text.slice(m.start, m.end)).toBe('foo')
  })
})
