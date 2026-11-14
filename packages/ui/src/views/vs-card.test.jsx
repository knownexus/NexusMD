import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { VsCard, SettingsCollapseControls } from './view-settings.jsx'

const KEY = 'nexusmd.settings.collapsed'
const header = name => screen.getByRole('button', { name: new RegExp(name) })

describe('VsCard collapsing', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('starts expanded, collapses from its title bar, and remembers it', () => {
    render(<VsCard title="Logs" icon="log"><input aria-label="draft" /></VsCard>)
    expect(header('Logs').getAttribute('aria-expanded')).toBe('true')
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'half-typed' } })

    fireEvent.click(header('Logs'))
    expect(header('Logs').getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByLabelText('draft', { selector: 'input' }).closest('.card-body').hidden).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(['Logs'])

    fireEvent.click(header('Logs'))
    expect(screen.getByLabelText('draft').value).toBe('half-typed')   // kept mounted while collapsed
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([])
  })

  it('opens collapsed when it was left collapsed, and keeps other sections\' state', () => {
    localStorage.setItem(KEY, JSON.stringify(['Apps', 'Other']))
    render(<><VsCard title="Apps" icon="x">a</VsCard><VsCard title="Logs" icon="x">b</VsCard></>)
    expect(header('Apps').getAttribute('aria-expanded')).toBe('false')
    expect(header('Logs').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(header('Logs'))
    expect(JSON.parse(localStorage.getItem(KEY)).sort()).toEqual(['Apps', 'Logs', 'Other'])
  })

  it('remembers by id when given one, and keeps header actions outside the toggle', () => {
    render(<VsCard id="profiles" title="Profiles" icon="x" actions={<button>New</button>}>body</VsCard>)
    fireEvent.click(header('Profiles'))
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(['profiles'])
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy()   // still usable while collapsed
  })

  it('ignores an unreadable stored value', () => {
    localStorage.setItem(KEY, '{not json')
    render(<VsCard title="Logs" icon="x">b</VsCard>)
    expect(header('Logs').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('VsCard status pill', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('shows the status beside the title, also when folded, without changing the toggle\'s name', () => {
    render(<VsCard title="Azure DevOps Connection" icon="x" status={{ text: 'Connected · acme', tone: 'ok' }}>body</VsCard>)
    const pill = screen.getByTestId('card-status')
    expect(pill.textContent).toBe('Connected · acme')
    expect(pill.className).toContain('success')
    expect(screen.getByRole('button', { name: 'Azure DevOps Connection' })).toBeTruthy() // exact name: the pill is not part of the button
    fireEvent.click(header('Azure DevOps Connection'))
    expect(screen.getByTestId('card-status').textContent).toBe('Connected · acme')
  })

  it('maps tones to pill colours, and shows none without text', () => {
    const { rerender } = render(<VsCard title="A" icon="x" status={{ text: 'Not finished', tone: 'warn' }}>b</VsCard>)
    expect(screen.getByTestId('card-status').className).toContain('warning')
    rerender(<VsCard title="A" icon="x" status={{ text: 'Sync error', tone: 'bad' }}>b</VsCard>)
    expect(screen.getByTestId('card-status').className).toContain('danger')
    rerender(<VsCard title="A" icon="x" status={{ text: 'Not set up', tone: 'muted' }}>b</VsCard>)
    expect(screen.getByTestId('card-status').className.trim()).toBe('pill')
    rerender(<VsCard title="A" icon="x" status={{ text: '', tone: 'ok' }}>b</VsCard>)
    expect(screen.queryByTestId('card-status')).toBeNull()
    rerender(<VsCard title="A" icon="x">b</VsCard>)
    expect(screen.queryByTestId('card-status')).toBeNull()
  })
})

describe('Collapse all / Expand all', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('folds and unfolds every section on screen, and remembers each', () => {
    render(<><SettingsCollapseControls /><VsCard title="One" icon="x">a</VsCard><VsCard id="two" title="Two" icon="x">b</VsCard></>)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(header('One').getAttribute('aria-expanded')).toBe('false')
    expect(header('Two').getAttribute('aria-expanded')).toBe('false')
    expect(JSON.parse(localStorage.getItem(KEY)).sort()).toEqual(['One', 'two'])
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(header('One').getAttribute('aria-expanded')).toBe('true')
    expect(header('Two').getAttribute('aria-expanded')).toBe('true')
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([])
  })

  it('leaves other tabs\' sections alone and does not touch a card with nothing to remember it by', () => {
    localStorage.setItem(KEY, JSON.stringify(['Elsewhere']))
    render(<><SettingsCollapseControls /><VsCard title="One" icon="x">a</VsCard></>)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(JSON.parse(localStorage.getItem(KEY)).sort()).toEqual(['Elsewhere', 'One'])
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(['Elsewhere'])
  })

  it('a section that is not mounted any more stops listening', () => {
    const { unmount } = render(<VsCard title="One" icon="x">a</VsCard>)
    unmount()
    window.dispatchEvent(new CustomEvent('nexusmd:settings-collapse', { detail: { collapsed: true } }))
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
