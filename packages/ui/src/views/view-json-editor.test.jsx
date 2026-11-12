import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { JsonEditorView } from './view-json-editor.jsx'

describe('JsonEditorView original files', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    delete window.electronAPI
  })

  it('saves an opened JSON file back through the desktop bridge', async () => {
    const write = vi.fn().mockResolvedValue({ ok: true, stamp: 'v2' })
    window.electronAPI = { editor: { write } }
    render(<JsonEditorView source={{ path: 'C:\\work\\settings.json', name: 'settings.json', text: '{"theme":"light"}', stamp: 'v1' }} />)
    fireEvent.change(document.querySelector('textarea'), { target: { value: '{"theme":"dark"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith(
      'C:\\work\\settings.json', '{"theme":"dark"}', { expectedStamp: 'v1', overwrite: false, bom: false },
    ))
  })
})
