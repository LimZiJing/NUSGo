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

- Move a waypoint through its row options while searching; verify existing category and explicit Create choices, list scroll retention, and focus returning to search when the row leaves the filter. Confirm the More popup announces the move and its Undo restores the prior category/order.

- [ ] Add a waypoint and confirm the form opens immediately with the visible map centre as its location. Enter name, category and note, then use Adjust on map; confirm the compact overlay leaves the map exposed, tap the map or drag the pin, confirm the coordinate status updates, then choose Use location and verify the form entries and new coordinate remain while the waypoint is not saved. Repeat and choose Cancel, then shared Back; each must restore the original coordinate and preserve the other form entries. Pan the focused map with arrow keys, confirm Use map centre is disabled during movement and enabled once the map settles, then activate it with Enter and choose Use location. Expand Coordinates and paste `1.2966, 103.7764`: press Enter and confirm the pin moves, the map pans without changing zoom and focus returns to Coordinates. Paste `103.7764, 1.2966` and confirm a latitude message appears and the location is unchanged. Paste `51.5072, -0.1276` and confirm it applies with an outside-Singapore note that clears when the pin is moved. Press Escape in the input and confirm entry closes without leaving placement. With reduced motion enabled, confirm the map jumps without animating. Check overlay scrolling, Save and Cancel at 390 × 844 and 1280 × 800.
- [ ] From More → My waypoints, add waypoints in multiple categories and confirm All places shows alphabetical category groups, initially collapsed, with counts and saved order within each group. Expand a category and confirm its rows and persistent map markers appear; use Expand all, Collapse all, and search, then clear search and confirm the normal expansion state is preserved. Remount My waypoints and confirm expansion state is restored. Tap a row and confirm it opens waypoint details; use its quiet icon-only Directions row action and confirm Plan opens with that waypoint as destination. Open details from a persistent map marker and confirm the Navigate pill is the first, only filled action with its icon before the label, and that Edit and danger-coloured Delete are in the More waypoint actions overflow menu. Expand the compact Location disclosure and confirm it shows the precise coordinates without Building or Floor rows, then confirm the note appears when set. Confirm Delete keeps the waypoint when cancelled and removes only that waypoint when confirmed.
- [ ] At 390 × 844 with reduced motion, note the map camera, then open details from a marker: confirm the sheet covers 60% of the screen including the navigation pill, the waypoint is focused once above the sheet, and panning afterwards is not overridden. Switch to a different marker's details, then close with Back; confirm the original More page, detent, map centre, zoom, bearing and pitch return exactly and focus lands on the control that opened details. Reopen, choose Navigate and confirm it goes to Plan without restoring the camera. Repeat the reduced-motion check and confirm focus and return jump without animating, then repeat at 1280 × 800 and confirm desktop details show the same actions and disclosure. Open details from a marker while Plan is active, focus Navigate and press Enter; confirm focus moves into Plan, the destination is correct, and the same marker and a different marker each reopen details afterwards.
- [ ] In Add and Edit forms, confirm Marker style starts collapsed with the current preview. Expand it with touch and keyboard, choose a different colour and icon, confirm the preview updates, save, reopen Edit, and confirm the saved choices remain selected.
- [ ] In Add and Edit, open Category and confirm its current value is selected for search, existing categories appear, typing alone does not change the draft, and pointer or Arrow/Enter explicitly chooses an existing option or Create result (including with no matches). Escape, outside press and Tab away restore the prior selection. Check the connected overlay at 390 × 844 with the software keyboard and at 1280 × 800 in all supported themes.
- [ ] Change a form field, then use Cancel and shared Back separately: each opens a modal with Keep editing and Discard changes. Keep editing restores the form; Escape also keeps editing. Discard returns a new waypoint to the collection and an edited waypoint to its prior details/list page. Confirm unchanged drafts close without a prompt and Save creates/updates only after explicit activation.
- [ ] After saving or changing a place, confirm the success message is small, appears at the bottom of the More panel, and clears after about seven seconds. Confirm waypoint-limit and write-problem messages remain visible near the related controls.
- [ ] Open Categories, search the list, and verify Selected and All categories groups. Use the category name/count/chevron to open only that category's places; verify the checkbox changes only pending marker visibility. Select a category row and confirm it shows that waypoint on the map; open details from the map marker and confirm the name, category, note, and location are shown.
- [ ] Confirm the collapsed Categories summary is unchanged. When expanded, confirm there is one Categories heading, with the search field directly below it.
- [ ] Change visibility, open a category, then return to Categories. Confirm the draft remains checked/unchecked as staged, Cancel discards it, and Done applies it. When any category is hidden, confirm Show all selects every category; Cancel discards the draft and Done shows all category markers. Clear selections and verify no category markers remain after Done.
- [ ] Back from category details returns to that category; Back to categories returns to the picker. Back from marker-opened details restores the previous More page and sheet position without changing the map camera, selected stop, or selected route.
- [ ] On mobile, open Waypoint list options and press Escape with focus on the trigger and then on a menu item. Confirm only the menu closes, focus returns to the trigger, and the sheet stays at the same detent.
- [ ] Open the list overflow menu and confirm Edit list and Clear all are available there. Confirm Clear all asks for confirmation and is disabled while search is active. In unfiltered All places Edit list, drag one waypoint by its handle within an expanded category to an exact row position and across categories to a row or collapsed heading. Confirm a collapsed heading appends, expanding a group and hovering the upper or lower half of a row inserts before or after that row respectively, and a dotted outline and highlight mark the destination row or category. Confirm a place dropped into another category keeps the whole list rendered with no page error, focus returns to the moved place's handle when its old category disappears, and Undo restores the previous category and order. Confirm dragging from the row body does not reorder, the order persists after reopening, and remove buttons appear only during Edit list.
- [ ] Confirm reordering is disabled with an active search and in a category view, with the filter note shown. Clear the search or return to All places and confirm reorder handles are enabled again.
- [ ] With keyboard focus on a reorder handle, press Space or Enter to start, use Up/Down to preview and hear position announcements, then press Space or Enter to save. Confirm the grouped layout stays in place, the announcement counts only that category's places, and focus stays on that handle. Repeat with Escape and with a no-op move; confirm the order is unchanged and not saved. Confirm a failed or conflicted write reports that the new position could not be saved.
- [ ] Open a category's overflow menu and choose Rename category. Confirm the heading becomes a text field with the current name selected and Save and Cancel icon actions; typing replaces the name. Save a fresh name and confirm only the category text changes on its places, the list order is unchanged, the category heading keeps focus, and the confirmation names the new category. Repeat with Escape and with the Cancel icon; confirm the original name remains and focus returns to the heading.
- [ ] Rename a category to a name that already exists. Confirm a modal dialog appears before any write, names both categories, explains that the destination's places stay first and the renamed category's places are appended, and states "Shown on map after merging" or "Hidden on map after merging", with keyboard focus starting on Cancel. Confirm Merge categories appends the incoming places in saved order with their marker colours and icons intact, removes the emptied category, and announces the merged name and visibility. Repeat with one category hidden and with both hidden; confirm the merged category is visible unless both were hidden, and that the emptied name is gone from saved visibility. Cancel a merge and confirm nothing is written and focus returns to the original heading. Then make the visibility key unwritable (for example by denying storage for the site) and merge again: confirm the announcement still names the merged category but says the map visibility could not be saved, and does not claim the category is shown or hidden.
- [ ] In a category, search, edit a place from details, and remove it. Change its category and verify the derived category groups and counts update. Delete it and confirm only that Personal Waypoint and its marker are removed. Clear all waypoints and verify confirmation is required and Community Waypoints remain unchanged.
- [ ] Add enough categories and places to verify the picker list and places list scroll independently. Repeat at 390 × 844 and check keyboard focus, scrolling, and touch-sized controls.
- [ ] In two tabs, keep a draft open in the first tab, save a change in the second tab, then save the first draft. Confirm the latest saved values are shown, the draft is preserved, and a separate Replace saved version action is required before overwriting. Repeat if the latest value changes again before replacement.
- [ ] With malformed/unsupported storage and with rejected records, verify there is no write before the user confirms reset or explicitly keeps readable records and discards rejected ones.
- [ ] Repeat the edit conflict review at 390 × 844. Check keyboard focus, scrolling, and touch-sized controls.

## Map marker family (#670)

- [ ] Show two saved waypoints in different categories. Confirm both pins share one teardrop outline, keep their saved colour and icon, and their tips sit on their coordinates (a pin near a route line should point at it, not float above or below).
- [ ] Open one waypoint from its map pin. Confirm only that pin grows modestly and gains a soft halo while the other pin keeps its normal size and no halo, and that opening details does not move the map. Repeat with reduced motion enabled and confirm the halo still shows without animating.
- [ ] Within 30 m of a stop and a route, drag the placement pin while adjusting a waypoint's location. Confirm the pin keeps its crosshair and the map pan/drag updates the chosen coordinate by the same distance the pin moved. Place it on an existing saved pin's coordinate and confirm both tips land on the same map point.
- [ ] Choose a venue from Explore and confirm the selected marker is the same teardrop family with a location glyph, that it is announced as `Selected location: <venue>`, and that no duplicate popup appears.
- [ ] Confirm Current location (the blue target marker), bus stops and live buses keep their existing round or vehicle marker types and that none of them shows a teardrop.
- [ ] Repeat the marker checks at 390 × 844, 360 × 740 and 1280 × 800 in System, Light, Dark, NUS, Matcha and Sakura. Confirm pin fill, edge, glyph and halo colours follow the theme and that no pin colour is hard-coded.

## Journey endpoint markers (#671)

- [ ] Set a destination and an origin that is not Current location, then show a visible Current location dot at least 20 m away. Confirm the origin is a plain grey circle with no A/B label and the destination is a red pin with a dark centre. Zoom in and out several steps and confirm both stay on their own coordinates.
- [ ] Stand within 20 m of the origin (or set the origin from Current location) and confirm the origin circle disappears while the blue dot remains, the destination stays visible, and the trip card still names the same origin. Move the fix beyond 20 m and confirm the circle returns at the captured origin coordinate. Nothing in the Path or trip card changes.
- [ ] Hide the Current location dot, then deny location or wait for the fix to go stale, and confirm the origin circle is shown again each time.
- [ ] Clear the origin and confirm the destination marker is untouched, then set the deleted endpoint as the destination instead and confirm origin suppression never depends on which role the destination holds.
- [ ] Confirm the markers keep `Origin: <label>` and `Destination: <label>` accessible names, and that no marker displays `A` or `B`.
- [ ] Repeat at 390 × 844, 360 × 740 and 1280 × 800 in System, Light, Dark, NUS, Matcha and Sakura. Confirm the grey circle, red pin and dark centre stay legible against each basemap and that the legend swatches match the map markers.

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
