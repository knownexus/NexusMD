import { describe, it, expect, vi } from 'vitest'
import { buildWidgetSnapshot, pushWidgetSnapshot, routeWidgetLink } from './home-screen-widgets.js'

const link = { id: 'w1', type: 'link', config: { target: 'git', kind: 'file', path: '/README.md', repo: { provider: 'github', name: 'NexusMD', fullName: 'knownexus/NexusMD' } } }

describe('buildWidgetSnapshot', () => {
  it('counts open tasks and lists the first few', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({ id: i, task: `t${i}`, priority: '3 - Medium', status: i === 0 ? 'Done' : 'To Do' }))
    const s = buildWidgetSnapshot({ tasks, now: 5 })
    expect(s.updatedAt).toBe(5)
    expect(s.tasks.open).toBe(11)
    expect(s.tasks.items).toHaveLength(8)
    expect(s.tasks.items[0].title).toBe('t1')
  })
  it('never exposes confidential notes', () => {
    const s = buildWidgetSnapshot({ notes: [{ id: 1, title: 'Secret', confidential: true }, { id: 2, title: '', body: '# Hello world' }] })
    expect(s.notes.items).toEqual([{ id: '2', title: 'Hello world' }])
  })
  it('summarises active, non-draft PRs and failed builds', () => {
    const s = buildWidgetSnapshot({ prs: [{ id: 1, title: 'A', status: 'active' }, { id: 2, title: 'B', status: 'active', draft: true }, { id: 3, title: 'C', status: 'merged' }], builds: [{ status: 'failed' }, { status: 'success' }] })
    expect(s.git).toEqual({ openPrs: 1, failedBuilds: 1, items: [{ id: '1', title: 'A' }] })
  })
  it('lists only valid link widgets', () => {
    const s = buildWidgetSnapshot({ homeWidgets: [link, { id: 'x', type: 'link', config: {} }, { id: 'y', type: 'stats' }] })
    expect(s.links).toHaveLength(1)
    expect(s.links[0]).toMatchObject({ id: 'w1', kind: 'git' })
  })
  it('tolerates missing or malformed input', () => {
    expect(() => buildWidgetSnapshot({ tasks: null, notes: 'x', prs: undefined, homeWidgets: {} })).not.toThrow()
    expect(buildWidgetSnapshot().tasks.open).toBe(0)
  })
})

describe('pushWidgetSnapshot', () => {
  it('sends JSON to the plugin', async () => {
    const plugin = { setSnapshot: vi.fn().mockResolvedValue() }
    expect(await pushWidgetSnapshot({ v: 1 }, plugin)).toBe(true)
    expect(plugin.setSnapshot).toHaveBeenCalledWith({ json: '{"v":1}' })
  })
  it('is false without a plugin or when it fails', async () => {
    expect(await pushWidgetSnapshot({}, null)).toBe(false)
    expect(await pushWidgetSnapshot({}, { setSnapshot: () => Promise.reject(new Error('x')) })).toBe(false)
  })
})

describe('routeWidgetLink', () => {
  it('maps page widgets to views', () => {
    expect(routeWidgetLink('nexusmd://widget/tasks')).toEqual({ view: 'planner' })
    expect(routeWidgetLink('nexusmd://widget/notes')).toEqual({ view: 'notes' })
    expect(routeWidgetLink('nexusmd://widget/git')).toEqual({ view: 'pr' })
  })
  it('resolves a link widget to its target', () => {
    expect(routeWidgetLink('nexusmd://widget/link?id=w1', [link]).target).toMatchObject({ target: 'git', path: '/README.md' })
    expect(routeWidgetLink('nexusmd://widget/link?id=gone', [link]).target).toBeUndefined()
  })
  it('ignores other addresses', () => {
    expect(routeWidgetLink('nexusmd://oauth/google')).toBeNull()
    expect(routeWidgetLink('https://example.com/widget/tasks')).toBeNull()
    expect(routeWidgetLink('nonsense')).toBeNull()
  })
})
