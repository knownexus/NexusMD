// native-http.js — the CapacitorHttp.request contract, as one function. On a device it is native
// HTTP (no CORS). In `vite dev` in a desktop browser Atlassian and Azure DevOps refuse
// cross-origin calls, so the request goes through the dev server's /__dev-proxy (vite.config.js).
import { CapacitorHttp } from '@capacitor/core';

const onDevice = () => !!window.Capacitor?.isNativePlatform?.();

async function viaDevProxy(req) {
  const r = await fetch('/__dev-proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!r.ok && r.status === 403) throw new Error('Dev proxy refused that host.');
  return r.json();
}

export const nativeHttp = (req) =>
  (import.meta.env?.DEV && !onDevice() ? viaDevProxy(req) : CapacitorHttp.request(req));

// A GET that returns raw bytes: { bytes: Uint8Array, declaredSize } (declaredSize is Content-Length, or 0 when absent).
// CapacitorHttp hands a binary body back as base64 text; a browser (dev) reads it as an ArrayBuffer. A device cannot
// stream or abort the request, so the size is only known once it has arrived.
export async function nativeBinary({ url, headers = {} }) {
  if (onDevice()) {
    const r = await CapacitorHttp.request({ method: 'GET', url, headers, responseType: 'arraybuffer' });
    if (r.status >= 400) throw new Error(`The download failed (${r.status}).`);
    const lower = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const bin = atob(String(r.data || ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, declaredSize: Number(lower['content-length']) || 0 };
  }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`The download failed (${r.status}).`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), declaredSize: Number(r.headers.get('content-length')) || 0 };
}
