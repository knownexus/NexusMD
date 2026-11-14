# Settings: status on each card, the tab you were on, Collapse all

## Status on Integrations cards

`VsCard` takes `status={{ text, tone }}` and shows it as a pill beside the title (not inside the toggle button, so the button's name is unchanged), so a folded card still says where it stands. Tones: `ok` (green), `warn`, `bad`, `muted`. The text comes from what is **saved**, not what is half-typed, using the same "everything it needs is set" rule as core's `is*Configured`:

| Card | Text |
| --- | --- |
| Azure DevOps | `Connected · {org}`, `Not finished` (some of org, token, project), `Not set up` |
| Jira Cloud | `Connected as {email}` (`· off` when switched off), `Not finished`, `Not set up` |
| GitHub | `{n} repository/repositories`, `No repositories chosen`, `Token missing`, `Not set up` |
| Database Connections | `{n} connection(s)`, `No connections` |
| Work Items Display | `Merged` / `Separate` |

The rules are pure functions in `modules/work/src/renderer/connection-status.js` and `modules/database/src/renderer/connection-status.js`.

## The tab Settings was left on

Desktop writes the tab to `nexusmd.settings.tab` (a machine key: top-level `nexusmd.*` keys are not synced) and opens on it, unless a tab was asked for with `openSettings(tab)`. A remembered tab that no longer exists or is not shown on this install falls back to Profile. The tablet layout (rail) remembers the page for the session in session storage: a plain `helm.*` key would be an account setting and sync to other devices. The phone list layout always opens on the list.

## Collapse all / Expand all

`SettingsCollapseControls` dispatches `nexusmd:settings-collapse` with `{ collapsed }`; every mounted `VsCard` with a key follows and writes its own state, so each section is remembered as if it had been clicked. Sections on other tabs are not mounted and keep their state. Shown at the top of every desktop Settings tab.
