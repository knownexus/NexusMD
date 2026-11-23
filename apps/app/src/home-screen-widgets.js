// home-screen-widgets.js — feeds the Android home-screen widgets (Tasks, Notes, Git, Links). The web app owns all the
// data (localStorage), so it pushes a small snapshot to the HomeWidgets native plugin (HomeWidgetsPlugin.java), which
// keeps it in SharedPreferences for the widget providers to draw. A tap on a widget opens nexusmd://widget/<kind>,
// which routeWidgetLink() turns back into a navigation inside the app.
import { registerPlugin, Capacitor } from '@capacitor/core'
import { readTarget, shortcutTitle } from '@nexusmd/core'

export const homeWidgetsPlugin = Capacitor.isNativePlatform() ? registerPlugin('HomeWidgets') : null

const MAX = { tasks: 8, notes: 8, git: 6, links: 8 }
const clip = (s, n = 80) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const snippet = (body) => clip(String(body ?? '').replace(/[#>*`\-]/g, ''), 80)

/**
 * The data the widgets draw. Confidential notes are left out entirely: a widget is visible on a locked phone.
 * @returns {{ v: 1, updatedAt: number, tasks: {open:number,items:object[]}, notes: {items:object[]}, git: {openPrs:number,failedBuilds:number,items:object[]}, links: object[] }}
 */
export function buildWidgetSnapshot({ tasks = [], notes = [], prs = [], builds = [], homeWidgets = [], now = Date.now() } = {}) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(t => t && t.status !== 'Done')
  const activePrs = (Array.isArray(prs) ? prs : []).filter(p => p && p.status === 'active' && !p.draft)
  const failed = (Array.isArray(builds) ? builds : []).filter(b => b && b.status === 'failed')
  const links = []
  for (const w of Array.isArray(homeWidgets) ? homeWidgets : []) {
    if (w?.type !== 'link') continue
    const t = readTarget(w.config)
    if (t) links.push({ id: String(w.id), title: clip(shortcutTitle(t), 60), kind: t.target })
  }
  return {
    v: 1,
    updatedAt: now,
    tasks: {
      open: open.length,
      items: open.slice(0, MAX.tasks).map(t => ({ id: String(t.id), title: clip(t.task || t.title), priority: clip(t.priority, 20) })),
    },
    notes: {
      items: (Array.isArray(notes) ? notes : []).filter(n => n && !n.confidential).slice(0, MAX.notes)
        .map(n => ({ id: String(n.id), title: clip(n.title || snippet(n.body) || 'Untitled') })),
    },
    git: {
      openPrs: activePrs.length,
      failedBuilds: failed.length,
      items: activePrs.slice(0, MAX.git).map(p => ({ id: String(p.id), title: clip(p.title) })),
    },
    links: links.slice(0, MAX.links),
  }
}

/** Hands the snapshot to the native side. Resolves false (never throws) when there is no native plugin. */
export async function pushWidgetSnapshot(snapshot, plugin = homeWidgetsPlugin) {
  if (!plugin) return false
  try { await plugin.setSnapshot({ json: JSON.stringify(snapshot) }); return true } catch { return false }
}

const VIEWS = { tasks: 'planner', notes: 'notes', git: 'pr' }

/**
 * What a nexusmd://widget/... address asks the app to do, or null when it is not a widget address.
 * { view } opens a page; { target } opens a Home link shortcut (found by its widget id in homeWidgets).
 */
export function routeWidgetLink(url, homeWidgets = []) {
  let u
  try { u = new URL(String(url)) } catch { return null }
  if (u.protocol !== 'nexusmd:' || u.hostname !== 'widget') return null
  const kind = u.pathname.replace(/^\/+/, '')
  if (VIEWS[kind]) return { view: VIEWS[kind] }
  if (kind === 'link') {
    const w = (Array.isArray(homeWidgets) ? homeWidgets : []).find(x => x?.type === 'link' && String(x.id) === u.searchParams.get('id'))
    const target = w ? readTarget(w.config) : null
    return target ? { view: 'dashboard', target } : { view: 'dashboard' }
  }
  return null
}
