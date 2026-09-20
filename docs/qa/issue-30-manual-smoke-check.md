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

## Mobile: 390 × 844

- [ ] Trip endpoints remain in a separate compact top card.
- [ ] The contextual panel is a persistent, non-modal bottom sheet capped at about half the viewport.
- [ ] The bottom sheet respects the safe-area inset, scrolls internally, and has no drag affordance or gesture requirement.
- [ ] There is enough map space between the top card and bottom sheet for pan and zoom interaction.
- [ ] Venue search receives focus when opened; venue-detail heading receives focus after selection; route select receives focus when shuttle mode opens, or the Back fallback receives focus until routes become available.
- [ ] Back, Escape, and Close restore focus to the control that initiated the current view, with no focus left on removed content.
- [ ] Trip endpoint search, selection, swap, clear, and validation remain usable.

## Live resize across 600px

- [ ] Resize the browser across 600px in both directions without reloading.
- [ ] The layout changes from desktop persistent panel positioning to the mobile top-card/bottom-sheet arrangement at the breakpoint.
- [ ] No overlay covers the other control, traps focus, or leaves the map unavailable for interaction.
