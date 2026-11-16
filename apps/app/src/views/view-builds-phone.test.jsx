import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/core', () => ({ CapacitorHttp: undefined, registerPlugin: () => ({}), Capacitor: { isNativePlatform: () => false } }))

import { BuildsView } from './view-builds.jsx'

afterEach(() => { cleanup(); delete window.matchMedia })

const run = { id: 7, source: 'ado', pipeline: 'CI', status: 'failed', branch: 'main', commit: 'abc1234', definitionId: 5, project: 'p', actor: 'sam', when: '1h', duration: '2m', reason: 'manual' }
const mount = (narrow) => {
  window.matchMedia = (q) => ({ matches: narrow && /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })
  return render(<BuildsView builds={[run]} acknowledgedBuilds={[]} setAcknowledgedBuilds={() => {}}/>)
}

describe('Builds on a phone', () => {
  it('stacks each build as a card with wrapping actions, and drops the column headers', () => {
    const { container } = mount(true)
    const row = container.querySelector('.build-row')
    expect(row.style.display).toBe('flex')
    expect(row.style.flexWrap).toBe('wrap')
    expect(row.style.gridTemplateColumns).toBe('')
    // the column header row is hidden
    expect([...container.querySelectorAll('div')].find(d => d.style.position === 'sticky').style.display).toBe('none')
  })

  it('keeps the table on a wide screen', () => {
    const { container } = mount(false)
    expect(container.querySelector('.build-row').style.display).toBe('grid')
  })
})

describe('Builds grouping', () => {
  const mk = (over) => ({ ...run, finishTime: '2026-11-16T14:32:00Z', ...over })
  const view = (builds) => {
    window.matchMedia = (q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })
    return render(<BuildsView builds={builds} acknowledgedBuilds={[]} setAcknowledgedBuilds={() => {}}/>)
  }

  it('groups by repo then pipeline, and shows a real date instead of time-since', () => {
    const { container, getAllByText } = view([mk({ id: 1, repo: 'api', pipeline: 'CI' }), mk({ id: 2, repo: 'api', pipeline: 'Deploy', definitionId: 6 }), mk({ id: 3, repo: 'web', pipeline: 'CI' })])
    expect([...container.querySelectorAll('.bld-repo')].map(n => n.textContent)).toEqual([expect.stringContaining('api'), expect.stringContaining('web')])
    expect(container.querySelectorAll('.bld-pipe').length).toBe(3)
    expect(container.textContent).toMatch(/2026/)
    expect(container.textContent).not.toMatch(/\b1h\b/)
    expect(getAllByText('Triggered by sam').length).toBe(3)
  })

  it('lets a pipeline take a local nickname and keeps the real name beside it', () => {
    const { container, getByLabelText, getByText } = view([mk({ id: 1, repo: 'api', pipeline: 'CI' })])
    fireEvent.click(getByLabelText('Add nickname for CI'))
    fireEvent.change(getByLabelText('Nickname for CI'), { target: { value: 'Main build' } })
    fireEvent.click(getByText('Save'))
    expect(container.querySelector('.bld-pipe').textContent).toContain('Main build')
    expect(container.querySelector('.bld-pipe').textContent).toContain('CI')
  })
})
