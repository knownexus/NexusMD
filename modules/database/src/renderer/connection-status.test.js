import { describe, it, expect } from 'vitest'
import { databaseStatus } from './connection-status.js'

describe('databaseStatus', () => {
  it('counts connections, singular and plural', () => {
    expect(databaseStatus(0)).toEqual({ text: 'No connections', tone: 'muted' })
    expect(databaseStatus()).toEqual({ text: 'No connections', tone: 'muted' })
    expect(databaseStatus(1)).toEqual({ text: '1 connection', tone: 'ok' })
    expect(databaseStatus(4)).toEqual({ text: '4 connections', tone: 'ok' })
  })
})
