// The find bar on a phone screen. It is pinned to the top of the scrolling screen: stepping to a match scrolls the
// screen to it, and a bar that scrolled with the content would slide out of sight on the first press.
export const FIND_BAR_STYLE = {
  position: 'sticky', top: 0, zIndex: 5,
  marginBottom: 10, borderRadius: 8, border: '1px solid var(--border)',
}
