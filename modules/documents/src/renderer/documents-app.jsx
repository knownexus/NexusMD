import React from 'react'
import { DocumentsView, MarkdownTabs } from '@nexusmd/ui'
import { openedFiles } from './opened.js'

// The Documents screen: markdown documents, the JSON editor and the regex tester.
// A Markdown or JSON file the app was opened with is a new saved document: the screen starts again on it, in its tool.
// A Markdown file that comes with a path is a tab instead (see opened.js): files opened together sit side by side, each keeps its
// own edits, and the screen is not started again as they come and go.
// A Home shortcut to a saved document does the same on that document.
export function DocumentsApp() {
  const { count, tool, docId, source = null, tabs = [], activePath = null } = React.useSyncExternalStore(openedFiles.subscribe, openedFiles.getSnapshot)
  const closeTab = (path) => {
    const tab = tabs.find(t => t.path === path)
    if (tab?.dirty && !window.confirm(`Close ${tab.name}? Its unsaved changes will be lost.`)) return
    openedFiles.close(path)
  }
  const view = (
    <DocumentsView key={tabs.length ? 'tabs' : count} opened={count} openedTool={tool} openedSource={source} openDocId={docId}
      onSourceChange={(patch, path) => openedFiles.update(path, patch)}
      onReloadFromDisk={() => activePath && openedFiles.reloadFromDisk(activePath)}
      onKeepMine={() => activePath && openedFiles.keepMine(activePath)} />
  )
  if (!tabs.length) return view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarkdownTabs tabs={tabs} activePath={activePath} onActivate={openedFiles.activate} onClose={closeTab} />
      <div style={{ flex: 1, minHeight: 0 }}>{view}</div>
    </div>
  )
}
