// connection-status.js — the one-line state each Integrations card shows beside its title ({ text, tone }), worked out from
// what is SAVED, not from what is half-typed in the form, so a folded card still says where it stands. Same rule as
// core's isAdoConfigured / isJiraConfigured / isGithubConfigured: a connection counts only when everything it needs is set.
//   tone: 'ok' connected · 'warn' started but not usable yet · 'muted' nothing set up

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NOT_SET_UP = { text: 'Not set up', tone: 'muted' };

export function adoStatus(c = {}) {
  const projects = Array.isArray(c.projects) ? c.projects : [];
  if (c.org && c.pat && projects.length) return { text: `Connected · ${c.org}`, tone: 'ok' };
  if (c.org || c.pat || projects.length) return { text: 'Not finished', tone: 'warn' };
  return NOT_SET_UP;
}

export function jiraStatus(c = {}) {
  const keys = Array.isArray(c.projectKeys) ? c.projectKeys : [];
  if (c.site && c.email && c.apiToken && keys.length) {
    return c.enabled === false ? { text: `Connected as ${c.email} · off`, tone: 'muted' } : { text: `Connected as ${c.email}`, tone: 'ok' };
  }
  if (c.site || c.email || c.apiToken || keys.length) return { text: 'Not finished', tone: 'warn' };
  return NOT_SET_UP;
}

export function githubStatus(c = {}) {
  const repos = Array.isArray(c.repos) ? c.repos : [];
  if (c.pat && repos.length) return { text: plural(repos.length, 'repository', 'repositories'), tone: 'ok' };
  if (c.pat) return { text: 'No repositories chosen', tone: 'warn' };
  if (repos.length) return { text: 'Token missing', tone: 'warn' };
  return NOT_SET_UP;
}

export function displayStatus(mode) {
  return { text: mode === 'separate' ? 'Separate' : 'Merged', tone: 'muted' };
}
