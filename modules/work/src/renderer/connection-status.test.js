import { describe, it, expect } from 'vitest'
import { adoStatus, jiraStatus, githubStatus, displayStatus } from './connection-status.js'

describe('adoStatus', () => {
  it('is connected only with organisation, token and a project, and names the organisation', () => {
    expect(adoStatus({ org: 'acme', pat: 't', projects: ['P'] })).toEqual({ text: 'Connected · acme', tone: 'ok' })
  })
  it('says "Not finished" for a connection that was started, and "Not set up" for none', () => {
    expect(adoStatus({ org: 'acme', pat: '', projects: ['P'] })).toEqual({ text: 'Not finished', tone: 'warn' })
    expect(adoStatus({ org: 'acme' })).toEqual({ text: 'Not finished', tone: 'warn' })
    expect(adoStatus({ org: '', pat: '', projects: [] })).toEqual({ text: 'Not set up', tone: 'muted' })
    expect(adoStatus()).toEqual({ text: 'Not set up', tone: 'muted' })
    expect(adoStatus({ projects: 'nope' })).toEqual({ text: 'Not set up', tone: 'muted' })
  })
})

describe('jiraStatus', () => {
  const full = { site: 'acme.atlassian.net', email: 'a@b.c', apiToken: 'x', projectKeys: ['K'] }
  it('names who it is connected as, and says when it is switched off', () => {
    expect(jiraStatus({ ...full, enabled: true })).toEqual({ text: 'Connected as a@b.c', tone: 'ok' })
    expect(jiraStatus(full)).toEqual({ text: 'Connected as a@b.c', tone: 'ok' })
    expect(jiraStatus({ ...full, enabled: false })).toEqual({ text: 'Connected as a@b.c · off', tone: 'muted' })
  })
  it('is not finished with a part missing, not set up with nothing', () => {
    expect(jiraStatus({ ...full, apiToken: '' })).toEqual({ text: 'Not finished', tone: 'warn' })
    expect(jiraStatus({ ...full, projectKeys: [] })).toEqual({ text: 'Not finished', tone: 'warn' })
    expect(jiraStatus({})).toEqual({ text: 'Not set up', tone: 'muted' })
  })
})

describe('githubStatus', () => {
  it('counts the repositories, singular and plural', () => {
    expect(githubStatus({ pat: 't', repos: ['a/b'] })).toEqual({ text: '1 repository', tone: 'ok' })
    expect(githubStatus({ pat: 't', repos: ['a/b', 'c/d', 'e/f'] })).toEqual({ text: '3 repositories', tone: 'ok' })
  })
  it('says what is missing', () => {
    expect(githubStatus({ pat: 't', repos: [] })).toEqual({ text: 'No repositories chosen', tone: 'warn' })
    expect(githubStatus({ pat: '', repos: ['a/b'] })).toEqual({ text: 'Token missing', tone: 'warn' })
    expect(githubStatus({ pat: '', repos: [] })).toEqual({ text: 'Not set up', tone: 'muted' })
  })
})

describe('displayStatus', () => {
  it('names the work items display mode', () => {
    expect(displayStatus('merged').text).toBe('Merged')
    expect(displayStatus('separate').text).toBe('Separate')
    expect(displayStatus(undefined).text).toBe('Merged')
  })
})
