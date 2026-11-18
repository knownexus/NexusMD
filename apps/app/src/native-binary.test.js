import { describe, it, expect, vi, afterEach } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { request } }))

import { nativeBinary } from './native-http.js'

afterEach(() => { delete window.Capacitor; request.mockReset(); vi.unstubAllGlobals() })

describe('nativeBinary', () => {
  it('on a device asks for an arraybuffer and decodes the base64 body', async () => {
    window.Capacitor = { isNativePlatform: () => true }
    request.mockResolvedValue({ status: 200, data: btoa(String.fromCharCode(80, 75, 3, 4)), headers: { 'Content-Length': '4' } })
    const r = await nativeBinary({ url: 'https://x/y.zip', headers: { Authorization: 'a' } })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: 'https://x/y.zip', responseType: 'arraybuffer', headers: { Authorization: 'a' } }))
    expect([...r.bytes]).toEqual([80, 75, 3, 4])
    expect(r.declaredSize).toBe(4)
  })
  it('fails with the status when the server refuses', async () => {
    window.Capacitor = { isNativePlatform: () => true }
    request.mockResolvedValue({ status: 404, data: '', headers: {} })
    await expect(nativeBinary({ url: 'https://x/y.zip' })).rejects.toThrow(/404/)
  })
  it('in a browser fetches the bytes directly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => '3' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })))
    const r = await nativeBinary({ url: 'https://x/y.zip' })
    expect([...r.bytes]).toEqual([1, 2, 3])
    expect(r.declaredSize).toBe(3)
  })
})
