// connection-status.js — what the Database Connections card shows beside its title, so a folded card still says where it stands.
export function databaseStatus(count = 0) {
  return count > 0
    ? { text: `${count} ${count === 1 ? 'connection' : 'connections'}`, tone: 'ok' }
    : { text: 'No connections', tone: 'muted' };
}
