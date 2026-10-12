// Stylesheets that still style a bare `button` element, with how many selectors each has.
// This is a ratchet: a file may not gain bare button selectors, and the count must be lowered
// (or the entry removed) as screens migrate to the Button primitives. It should reach zero.
// The rule is defined in docs/ui/controls.md.
//
// Keys are paths relative to the frontend directory.
export const BARE_BUTTON_ALLOWLIST = {
  // Feature screens, removed by the Stops, Explore, and Plan migrations.
  'src/features/explore-view/styles/explore-view.css': 10,
  'src/features/plan-view/styles/plan-view.css': 5,
  // Mobile navigation bar and shared navigation (Sheet and Menus migrations).
  'src/ui/mobile/styles/layout.css': 1,
  'src/ui/styles/shared/navigation.css': 4,
  // Popovers and map controls.
  'src/ui/styles/shared/controls/journey-test-time.css': 1,
  'src/ui/styles/shared/map.css': 1,
  // Global button defaults (hover filter, focus ring, tap highlight). They stay until every
  // button is a primitive, because native buttons elsewhere still rely on them.
  'src/ui/styles/shared/base.css': 3,
}
