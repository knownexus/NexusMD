import { test, expect } from '@playwright/test'
import { launchApp } from './launch.js'

// Settings: a status on each Integrations card (so a folded card still says where it stands), the tab Settings was left on,
// and Collapse all / Expand all.

const toggle = (win, title) => win.locator('.set-card-toggle', { hasText: title })
const card = (win, title) => win.locator('.set-card', { has: toggle(win, title) })
const tab = (win, name) => win.locator('nav button', { hasText: name })
const openSettings = (win) => win.getByText('Settings').first().click()

test('each Integrations card says where it stands, also when folded', async () => {
  const { win, close } = await launchApp()
  try {
    await openSettings(win)
    await tab(win, 'Integrations').click()
    for (const title of ['Azure DevOps Connection', 'Jira Cloud Connection', 'GitHub Connection']) {
      await expect(card(win, title).getByTestId('card-status')).toHaveText('Not set up')
    }
    await expect(card(win, 'Work Items Display').getByTestId('card-status')).toHaveText('Merged')
    const db = card(win, 'Database Connections')
    if (await db.count()) await expect(db.getByTestId('card-status')).toHaveText('No connections')

    await toggle(win, 'GitHub Connection').click()
    await expect(toggle(win, 'GitHub Connection')).toHaveAttribute('aria-expanded', 'false')
    await expect(card(win, 'GitHub Connection').getByTestId('card-status')).toBeVisible()
  } finally { await close() }
})

test('Settings opens on the tab it was left on', async () => {
  const { win, close } = await launchApp()
  try {
    await openSettings(win)
    await tab(win, 'Integrations').click()
    await expect(toggle(win, 'Azure DevOps Connection')).toBeVisible()
    await win.reload()
    await expect(win.locator('button.nav-item').first()).toBeVisible({ timeout: 30_000 })
    await openSettings(win)
    await expect(toggle(win, 'Azure DevOps Connection')).toBeVisible()
    // Another tab replaces it.
    await tab(win, 'Appearance').click()
    await win.reload()
    await expect(win.locator('button.nav-item').first()).toBeVisible({ timeout: 30_000 })
    await openSettings(win)
    await expect(toggle(win, 'Azure DevOps Connection')).toHaveCount(0)
  } finally { await close() }
})

test('Collapse all folds every section on the tab, Expand all opens them again, and it is kept after a reload', async () => {
  const { win, close } = await launchApp()
  try {
    await openSettings(win)
    await tab(win, 'Integrations').click()
    const toggles = win.locator('.set-card-toggle')
    const n = await toggles.count()
    expect(n).toBeGreaterThan(2)
    await win.getByRole('button', { name: 'Collapse all' }).click()
    for (let i = 0; i < n; i++) await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'false')

    await win.reload()
    await expect(win.locator('button.nav-item').first()).toBeVisible({ timeout: 30_000 })
    await openSettings(win)
    for (let i = 0; i < n; i++) await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'false')

    await win.getByRole('button', { name: 'Expand all' }).click()
    for (let i = 0; i < n; i++) await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'true')
  } finally { await close() }
})
