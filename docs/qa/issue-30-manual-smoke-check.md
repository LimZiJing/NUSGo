# Issue #30 manual smoke check

Run these checks in Windows Chrome and Edge after starting the local Vite app. Leave each box unchecked until the browser check is actually performed.

## Desktop: 1440 × 900

- [ ] The trip endpoint controls remain a compact card above the persistent contextual panel.
- [ ] The contextual panel remains visible and usable while the map remains available for pan and zoom.
- [ ] Venue search, venue detail, shuttle route selection, Back, Close, Escape, and map-click behavior work.
- [ ] Selecting a venue flies the map to the venue and keeps its selected marker visible without a duplicate popup.
- [ ] Route selection updates the map camera/content and the selected route details.
- [ ] A venue-load failure still leaves shuttle browsing available.
- [ ] Keyboard focus is visible, sequential, and returns to the initiating control after Back, Escape, and Close.

## Mobile: 390 × 844 (mobile layout through 768px)

- [ ] The map fills the viewport beneath the separate trip card and contextual bottom sheet.
- [ ] Trip endpoints start as a collapsed Plan trip card with origin → destination or missing prompts.
- [ ] Plan trip expands and collapses only through its explicit control; its accessible name keeps full endpoint names.
- [ ] Expanding Plan trip minimizes the contextual sheet to an actionable labelled header.
- [ ] Activating the contextual header restores the sheet, collapses Plan trip, and leaves focus on safe current content.
- [ ] A map-triggered contextual change reveals the sheet without losing contextual state.
- [ ] The contextual panel is a persistent, non-modal bottom sheet capped at about half the viewport and sized to its content.
- [ ] The bottom sheet respects the safe-area inset, scrolls internally, and has no drag affordance or gesture requirement.
- [ ] There is enough map space between the top card and bottom sheet for pan and zoom interaction.
- [ ] Map navigation controls and attribution remain usable without overlapping either surface; the full legend is hidden.
- [ ] Venue search receives focus when opened; venue-detail heading receives focus after selection; route select receives focus when shuttle mode opens, or the Back fallback receives focus until routes become available.
- [ ] Back, Escape, and Close restore focus to the control that initiated the current view, with no focus left on removed content.
- [ ] Trip endpoint search, selection, swap, clear, and validation remain usable.

## Breakpoint resize across 768px / 769px

- [ ] Resize the browser across 768px and 769px in both directions without reloading.
- [ ] At 768px the layout remains the mobile full-viewport map with top card and bottom sheet; at 769px it uses the desktop persistent overlay layout.
- [ ] Route camera fitting uses mobile overlay padding at 768px and desktop side padding at 769px.
- [ ] No overlay covers the other control, traps focus, or leaves the map unavailable for interaction.

## Edge headless/device-emulation evidence (2026-09-20)

The following facts were verified in Edge headless/device emulation at 320 × 568, 390 × 844, 504 × 1137, 768 × 900, 568 × 320 (short landscape), 769 × 900, and 1440 × 900. The manual checks above remain intentionally unchecked.

- The shell produced no outer horizontal overflow or secondary viewport scrollbar after the containing-block sizing fix.
- Mobile map gaps remained usable, including a minimum 84px gap in short landscape; navigation controls and attribution stayed within the viewport.
- The mobile legend was hidden; the collapsed Plan trip layout and content-sized contextual sheet rendered.
- Expanding Plan trip minimized the contextual sheet; restoring it from its labelled header returned the sheet and focus.
- The 768/769 breakpoint sizing and focus transition behavior passed.
- The contextual venue input measured 44px in the mobile layout.

Chrome, a real software keyboard, and the full manual pointer/keyboard smoke remain unverified. External basemap and glyph loading was inconsistent in headless runs, so this evidence does not claim complete map-data QA.
