// Stylesheets that still style a bare `button` element, with how many selectors each has.
// This is a ratchet: a file may not gain bare button selectors, and the count must be lowered
// (or the entry removed) as screens migrate to the Button primitives. It should reach zero.
// The rule is defined in docs/ui/controls.md.
//
// Keys are paths relative to the frontend directory.
export const BARE_BUTTON_ALLOWLIST = {
  // Keep the global focus rule for .journey-test-time-toggle, plus hover and touch treatment for
  // navigation tabs, More entry and the PWA install row until they own those states.
  'src/ui/styles/shared/base.css': 3,
}
