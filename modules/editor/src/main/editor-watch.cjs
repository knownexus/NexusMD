'use strict';

// Watches the files the Documents tabs have open and tells the window when one changes on disk.
//   createWatcher({ read, send }) -> { watch(paths), unwatch(paths), dispose() }
// A burst of events (editors write in several steps) becomes one message, sent after `debounceMs`, carrying the file's
// new text and stamp, or { missing: true } when it is gone. Nothing is sent when the stamp is the one last sent. Editors
// that save by replacing the file leave a watch on the old one, so every event re-establishes the watch; a path that
// cannot be watched for the moment (mid-replace) is retried until it can.
const fs = require('fs');
const { moduleLogger, ignore } = require('@nexusmd/main-kit/logging');

const modLog = moduleLogger('editor');

const RETRY_MS = 1000;

function createWatcher({ read, send, debounceMs = 150, fsWatch = fs.watch }) {
  const entries = new Map(); // path -> { handle, timer, retry, lastStamp, gone }

  function attach(path, entry) {
    try {
      entry.handle = fsWatch(path, { persistent: false }, () => schedule(path));
      entry.handle.on?.('error', (err) => ignore(modLog, 'a file watch reported an error; the next event or retry recovers', err));
    } catch (err) {
      ignore(modLog, 'watching a file that may be mid-replace; tried again shortly', err);
      entry.handle = null;
      entry.retry = setTimeout(() => { entry.retry = null; if (entries.get(path) === entry) attach(path, entry); }, RETRY_MS);
    }
  }

  function schedule(path) {
    const entry = entries.get(path);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => settle(path, entry), debounceMs);
  }

  async function settle(path, entry) {
    if (entries.get(path) !== entry) return;
    try { entry.handle?.close(); } catch (err) { ignore(modLog, 'closing a file watch that is already closed', err); }
    entry.handle = null;
    let r;
    try { r = await read(path); } catch (err) { ignore(modLog, 'reading a changed file, which may be mid-replace; reported as gone', err); r = { missing: true }; }
    if (entries.get(path) !== entry) return;
    attach(path, entry);
    if (r?.missing) {
      if (!entry.gone) { entry.gone = true; send('editor:file-changed', { path, missing: true }); }
      return;
    }
    entry.gone = false;
    if (r.stamp === entry.lastStamp) return;
    entry.lastStamp = r.stamp;
    send('editor:file-changed', { path, text: r.text, stamp: r.stamp, bom: !!r.bom });
  }

  function stop(entry) {
    clearTimeout(entry.timer);
    clearTimeout(entry.retry);
    try { entry.handle?.close(); } catch (err) { ignore(modLog, 'closing a file watch that is already closed', err); }
  }

  return {
    watch(paths) {
      for (const path of paths) {
        if (entries.has(path)) continue;
        const entry = { handle: null, timer: null, retry: null, lastStamp: undefined, gone: false };
        entries.set(path, entry);
        attach(path, entry);
      }
    },
    unwatch(paths) {
      for (const path of paths) {
        const entry = entries.get(path);
        if (!entry) continue;
        stop(entry);
        entries.delete(path);
      }
    },
    dispose() {
      for (const entry of entries.values()) stop(entry);
      entries.clear();
    },
  };
}

module.exports = { createWatcher };
