# NUSGo manual smoke checklist

This is the canonical browser smoke checklist for a release or deployment milestone. It is not a requirement to repeat the full checklist for every implementation task.

Run it against a local production build (`npm run build` followed by `npm run preview`) or the deployed development site. Use a supported desktop browser and record the browser, URL, date, and viewport sizes with the result.

## How to scope browser verification

- For pure domain, data, test, or infrastructure changes with no user-visible behavior change, automated checks are sufficient.
- For UI or map changes, run the smallest targeted subset covering the changed behavior when a local browser is available.
- Run the full checklist before a release or when a change materially affects responsive layout, keyboard behavior, map presentation, navigation state, or external map resources.
- If browser testing is unavailable, record the affected areas as unverified and explain the environment blocker. Do not claim browser QA.

## Desktop — 1440 × 900

- [ ] The map, trip endpoint controls, and Explore panel are visible without overlap.
- [ ] Venue search, venue detail, Back, Close, Escape, and map-click behavior work.
- [ ] Selecting a venue flies to it and shows one selected venue marker without a duplicate popup.
- [ ] For a selected basement, ground-floor, and first-floor venue, venue details show “Basement 1”, “Ground floor”, and “Floor 1” respectively.
- [ ] bus route browsing, route selection, route clearing, stop popups, and camera fitting work.
- [ ] Trip endpoints can be set, swapped, and cleared for venues and bus stops.
- [ ] In Plan, the Origin location action requests browser location only after activation, fills the closest mapped venue, keeps the existing origin until success, and shows a retryable message when location is denied or unavailable.
- [ ] In Plan, the endpoint rows, swap and location actions, validation message, Clear all control, and Get route action use compact, consistent alignment without clipping. The Journey summary and leg details remain readable.
- [ ] Repeat the Plan layout check in both light and dark themes.
- [ ] In Plan, set origin to PGP and destination to UTown Auditorium 2. The Journey calculation returns a valid Recommended journey, and the map, page, and endpoint controls remain responsive while it is calculated. If the result is budgeted, the panel explains that a faster route may exist instead of calling it fastest.
- [ ] Venue and transit loading failures remain independently understandable and usable where supported.
- [ ] Native MapLibre navigation controls remain usable on desktop.

## Mobile — 390 × 844

- [ ] Explore, Stops, Plan, and More open at the shared partial detent, with the sheet occupying 50% of the visual viewport above the bottom navigation. Verify More at 360 × 740, 375 × 812, and 414 × 896; its content remains usable and scrollable, the map and bottom navigation remain usable, and Settings and My waypoints open full-height. Desktop presentation is unchanged above 768px.
- [ ] Explore, Stops, and Plan tabs remain visible while the sheet is partial or collapsed. Full reaches the top and bottom of the viewport and covers the tab bar; collapsed leaves the 44px handle above it.
- [ ] Switching tabs reaches each sheet's remembered detent immediately, without briefly opening full, and preserves the map camera and trip endpoints.
- [ ] The handle works by tap, Enter, and Space (partial and full toggle; collapsed opens partial), and Up and Down Arrow move one detent, including full to partial. Swiping the handle or blank sheet whitespace tracks the touch smoothly and settles at a snap point; cancelling a swipe does not cause a second tap action.
- [ ] Scrollable sheet content scrolls natively, text and controls remain usable, uncovered map areas remain interactive, and sheet surfaces block taps beneath them.
- [ ] Explore venue search/details and bus route browsing, map-based stop selection, Plan endpoints and Journey, Back, Close, Escape, and map-click behavior continue to work.
- [ ] In Plan, endpoint controls stay compact at the phone width with controls at least 36px high, validation on the left, and the action group on the right. Check both light and dark themes.
- [ ] Sheets are non-modal, scroll independently, respect safe-area and software-keyboard insets, and expose accessible names, expanded states, visible focus, and touch-sized controls.
- [ ] Back, Escape, sheet collapse, and tab changes leave focus on a usable control without trapping it in an inactive sheet.
- [ ] The single mobile location button sits inside the top-left safe area when the map is exposed and is hidden while Plan is full. Pointer and keyboard activation focus the active or first device fix; when no active fix is available, the map falls back to Kent Ridge MRT at zoom 15 before requesting or retrying location. Location updates alone do not move the camera.
- [ ] Basemap attribution appears just above the mobile sheet during the five-second startup display, then disappears. The About section retains its source links.

## Responsive boundary — 768 / 769px

- [ ] Resizing across the breakpoint without reloading switches between mobile and desktop layouts correctly.
- [ ] No overlay covers another control, traps focus, or makes the map unavailable.

## More menu and PWA installation

- [ ] More lists My waypoints, Settings, Release notes, and a quiet Download NUSGo row in that order. Confirm the app icon loads at desktop and mobile sizes and Settings behaves as before.
- [ ] Confirm Download NUSGo reveals the existing browser instructions when no native install prompt is available, uses the browser prompt when one is available, and is hidden in an installed app.
- [ ] Installation announces completion with More closed. Opening an already installed app stays silent; after an observed uninstall, reinstalling announces completion again.

## Settings, Stops and Plan additions

- [ ] Settings opens from the map gear. Appearance, Favourites and About expand independently, Back restores the previous tab, and each theme (System, Light, Dark, NUS, Matcha, Sakura) applies immediately.
- [ ] In Stops, Nearby opens timing rows only for stops within 250 m of the map centre, and the centre marker is the glowing dot.
- [ ] In Stops, with live data unavailable, one list-wide "Live times unavailable" notice shows and scheduled internal rows remain.
- [ ] In Plan, a collapsed journey card expands on tap, and tapping an expanded card recentres the map on the route.

## Personal Waypoints (#207)

- [ ] Add a waypoint and confirm the category field is empty but for its placeholder. Choose an existing category, then reopen the field and confirm it clears to the placeholder for searching rather than repeating the chosen name, that no separate category caption appears beneath it, and that pressing Escape closes only the list, restores the chosen category and leaves the form open. Open the field and click or tap outside it, including on the field's own "Category" label, and confirm the list closes and stays closed. Confirm changing a saved place's category is done by editing the place, since details has no separate Move action. Enter name, category and note, then use Adjust on map; tap the map or drag the pointed pin, confirm the selected-coordinate readout updates, and return to the form with entries preserved. Also pan the focused map with the arrow keys, confirm Use map centre is disabled during movement and enabled once the map settles, then Tab to Edit and on to Use map centre and activate it with Enter; confirm the selected coordinate updates and Done preserves the form entries. Then choose Edit and paste `1.2966, 103.7764`: press Enter and confirm the pin moves, the map pans to it without changing zoom, focus returns to Edit and the form shows `1.296600, 103.776400`. Paste `103.7764, 1.2966` and confirm a latitude message appears and the location is unchanged. Paste `51.5072, -0.1276` and confirm it applies with an outside-Singapore note that clears when the pin is moved. Press Escape in the input and confirm entry closes without closing the sheet. With reduced motion enabled, confirm the map jumps without animating. Confirm the collapsed screen shows only the Edit button beyond what it had before. Check the single Save action at 390 × 844 and a desktop viewport, and confirm the form has no Cancel of its own because the panel's Back leaves it.
- [ ] From More → My waypoints, add waypoints in multiple categories and confirm they appear as alphabetical category groups with one place count and a chevron on each heading, and that no heading or row shows an overflow (⋮) button. Confirm each row shows only the saved marker colour and icon plus its name — no repeated category label and no per-row action icons — and that tapping anywhere on a row opens that place's details. Expand a group, use Expand all / Collapse all, then reload More and confirm expansion was remembered. Type in search and confirm matching groups appear without changing the remembered expansion. Tap a category heading (not its chevron) and confirm the collection switches to that category's view with a Back control that returns to all categories.
- [ ] Open details from a place row and confirm it is the single home for that place's actions: Directions is the only filled action, Edit and danger-coloured Delete follow as quiet actions, coordinates are secondary, and the note appears when set. Confirm Delete keeps the waypoint when cancelled and removes only that waypoint when confirmed. Return to details and confirm the collection's own Edit list / Done and Clear all are visible secondary buttons rather than an overflow menu. At desktop and 390 × 844, open details from a marker while Plan is active, focus Directions and press Enter; confirm focus moves into Plan, the destination is correct, and the same marker and a different marker each reopen details afterwards.
- [ ] At 390 × 844 with reduced motion, note the map camera, then open details from a marker: confirm the sheet covers 60% of the screen including the navigation pill, the waypoint is focused once above the sheet, and panning afterwards is not overridden. Switch to a different marker's details, then close with Back; confirm the original More page, detent, map centre, zoom, bearing and pitch return exactly and focus lands on the control that opened details. Reopen, choose Directions and confirm it opens Plan without restoring the camera. Repeat the reduced-motion check and confirm focus and return jump without animating.
- [ ] In Add and Edit forms, confirm Marker style starts collapsed with the current preview. Expand it with touch and keyboard, choose a different colour and icon, confirm the preview updates, save, reopen Edit, and confirm the saved choices remain selected.
- [ ] After saving or changing a place, confirm the success message is small, appears at the bottom of the More panel, and clears after about seven seconds. Confirm waypoint-limit and write-problem messages remain visible near the related controls.
- [ ] Open Categories and confirm every category is listed in one alphabetical order with no Selected / All categories split, that ticking a box leaves the row exactly where it was, and that a hidden category's row is dimmed and unchecked rather than showing a cross with no action button of its own. Confirm the Categories summary never truncates and that Done reads "Done" with nothing staged and "Done (n)" for n pending changes. Select a category row and confirm it shows that waypoint on the map; open details from the map marker and confirm the name, category, note, and location are shown.
- [ ] Confirm the collapsed Categories summary is unchanged. When expanded, confirm there is one Categories heading, with the search field directly below it.
- [ ] Change visibility, open a category, then return to Categories. Confirm the draft remains checked/unchecked as staged, Cancel discards it, and Done applies it. When any category is hidden, confirm Show all selects every category; Cancel discards the draft and Done shows all category markers. Clear selections and verify no category markers remain after Done.
- [ ] Back from category details returns to that category; Back to categories returns to the picker. Back from marker-opened details restores the previous More page, sheet position and the exact map camera (centre, zoom, bearing, pitch) captured on open, without changing the selected stop or route.
- [ ] On mobile, open Waypoint list options and press Escape with focus on the trigger and then on a menu item. Confirm only the menu closes, focus returns to the trigger, and the sheet stays at the same detent.
- [ ] Open the list overflow menu and confirm it offers Edit list and Clear all, that Clear all asks for confirmation and is disabled while search is active, and that while editing the menu has no Done entry. Enter Edit list and confirm Add waypoint is replaced by Cancel and Confirm, that the grip and remove icons have no borders, and that the grip sits close to the card's leading edge. Remove a place and confirm the list updates but reopening My waypoints shows it still saved, then press Cancel and confirm the dialog names what will be lost and discarding leaves the store unchanged. Enter Edit list again, drag a place by its handle onto another category card: confirm the card highlights while hovered and, if it was collapsed, opens after about 1.5s. Release and confirm the place appears under the new category, then press Confirm and confirm it persists after reopening. Empty a category by moving its last place out and confirm the group stays visible in its alphabetical position rather than jumping to the end of the list, with a drop-target message, and that a place can be dropped back into it. Confirm dragging from the row body does not move it, and remove buttons appear only during Edit list. While editing, tap a place's name and confirm it does not open that place's details, since that would abandon the pending edit. On a touch device, press and hold a place's grip for a moment, then drag it onto another category card: the waypoint must move and the My waypoints panel must not slide, since the panel is a swipe-dismissable sheet that would otherwise claim the gesture.
- [ ] Confirm reordering is disabled with an active search and in a category view, with the filter note shown. Clear the search or return to All places and confirm reorder handles are enabled again.
- [ ] With keyboard focus on a reorder handle, press Space or Enter to start, use Up/Down to preview and hear position announcements, then press Space or Enter to save. Confirm focus stays on that handle. Repeat with Escape and with a no-op move; confirm the order is unchanged and not saved. Confirm a failed or conflicted write reports that the new position could not be saved.
- [ ] In a category, search, edit a place from details, and remove it. Change its category and verify the derived category groups and counts update. Delete it and confirm only that Personal Waypoint and its marker are removed. Clear all waypoints and verify confirmation is required and Community Waypoints remain unchanged.
- [ ] Add enough categories and places to verify the picker list and places list scroll independently. Repeat at 390 × 844 and check keyboard focus, scrolling, and touch-sized controls.
- [ ] In two tabs, keep a draft open in the first tab, save a change in the second tab, then save the first draft. Confirm the latest saved values are shown, the draft is preserved, and a separate Replace saved version action is required before overwriting. Repeat if the latest value changes again before replacement.
- [ ] With malformed/unsupported storage and with rejected records, verify there is no write before the user confirms reset or explicitly keeps readable records and discards rejected ones.
- [ ] Repeat the edit conflict review at 390 × 844. Check keyboard focus, scrolling, and touch-sized controls.

## Keyboard and accessibility

- [ ] Focus is visible and follows a sensible order through the affected workflow.
- [ ] Back, Escape, Close, and outside-map dismissal return focus to a usable control.
- [ ] Interactive controls have meaningful accessible names and state changes are communicated semantically.

## Map and external resources

- [ ] The basemap, glyphs, route lines, stop labels, markers, and popups render as expected for the changed area.
- [ ] Tile or style failures produce a user-safe status without hiding unrelated application controls.
- [ ] Any external-resource limitation is recorded separately from application behavior.

## Evidence

Record each pass in the [evidence log](evidence-log.md) with the browser, URL, date, viewport and result.
