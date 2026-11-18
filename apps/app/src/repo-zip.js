// repo-zip.js — unpacks a branch zip (from GitHub's zipball or Azure DevOps) into its text files, for searching.
import JSZip from 'jszip';

export const ZIP_LIMIT = 50 * 1024 * 1024;   // a branch bigger than this (compressed) is not searched on the phone
const MAX_FILE = 1024 * 1024;                 // text files over 1 MB are skipped

const megabytes = (n) => Math.round(n / 1024 / 1024);

/**
 * The text files of a branch zip as [{ path, text }]. `stripTop` drops the zip's single top-level folder (GitHub's
 * zipball is `repo-<sha>/…`). `include(path)` limits what is unpacked (the scope). Skips binary files (a NUL byte),
 * files over 1 MB and files that are not valid UTF-8. `declaredSize` is what the server said it sent, if it said.
 * Refuses a zip over ZIP_LIMIT before unpacking it.
 */
export async function unpackBranchZip(bytes, { declaredSize = 0, include = null, stripTop = false } = {}) {
  const size = Math.max(bytes?.length || 0, declaredSize);
  if (size > ZIP_LIMIT) throw new Error(`This branch is too large to search on the phone (${megabytes(size)} MB).`);
  const zip = await JSZip.loadAsync(bytes);
  const decoder = new TextDecoder('utf-8');
  const out = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = stripTop ? entry.name.slice(entry.name.indexOf('/') + 1) : entry.name;
    if (!path || (include && !include(path))) continue;
    const data = await entry.async('uint8array');
    if (data.length > MAX_FILE || data.includes(0)) continue;
    const text = decoder.decode(data);
    if (text.includes('�')) continue; // not valid UTF-8
    out.push({ path, text });
  }
  return out;
}
