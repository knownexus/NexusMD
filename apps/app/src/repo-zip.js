// repo-zip.js — unpacks a branch zip (from GitHub's zipball or Azure DevOps) into its text files, for searching.
import JSZip from 'jszip';

export const ZIP_LIMIT = 50 * 1024 * 1024;       // a branch bigger than this (compressed) is not searched on the phone
export const UNPACK_LIMIT = 150 * 1024 * 1024;   // nor one that would unpack to more than this
const MAX_FILE = 1024 * 1024;                     // text files over 1 MB are skipped

const megabytes = (n) => Math.round(n / 1024 / 1024);
const tooLarge = (what) => new Error(`This branch is too large to search on the phone (${what}).`);

// An entry's bytes, read as a stream and given up on once more than `limit` have come out, so a small zip that
// holds a huge, well-compressed file (a decompression bomb) is never inflated in full. → { data, size } with data
// null when the limit was passed; size is how many bytes were read.
function readLimited(entry, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    const stream = entry.internalStream('uint8array');
    stream.on('data', (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) { over = true; stream.pause(); resolve({ data: null, size }); return; }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (over) return;
      const data = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) { data.set(c, at); at += c.length; }
      resolve({ data, size });
    });
    stream.resume();
  });
}

/**
 * The text files of a branch zip as [{ path, text }]. `stripTop` drops the zip's single top-level folder (GitHub's
 * zipball is `repo-<sha>/…`). `include(path)` limits what is unpacked (the scope). Skips binary files (a NUL byte),
 * files over 1 MB and files that are not valid UTF-8. `declaredSize` is what the server said it sent, if it said.
 * Refuses a zip over ZIP_LIMIT before unpacking it, and stops when what it has unpacked passes `maxTotal`.
 */
export async function unpackBranchZip(bytes, { declaredSize = 0, include = null, stripTop = false, maxTotal = UNPACK_LIMIT } = {}) {
  const size = Math.max(bytes?.length || 0, declaredSize);
  if (size > ZIP_LIMIT) throw tooLarge(`${megabytes(size)} MB`);
  const zip = await JSZip.loadAsync(bytes);
  const decoder = new TextDecoder('utf-8');
  const out = [];
  let unpacked = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = stripTop ? entry.name.slice(entry.name.indexOf('/') + 1) : entry.name;
    if (!path || (include && !include(path))) continue;
    // The size the zip declares for the file; it can lie, which is why the read below is limited too.
    if ((entry._data?.uncompressedSize ?? 0) > MAX_FILE) continue;
    const { data, size: read } = await readLimited(entry, MAX_FILE);
    unpacked += read;
    if (unpacked > maxTotal) throw tooLarge(`it unpacks to more than ${megabytes(maxTotal)} MB`);
    if (!data || data.includes(0)) continue;
    const text = decoder.decode(data);
    if (text.includes('�')) continue; // not valid UTF-8
    out.push({ path, text });
  }
  return out;
}
