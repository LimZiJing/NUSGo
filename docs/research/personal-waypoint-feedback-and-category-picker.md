# Personal waypoint feedback and category picker guidance

Date: 2026-10-29

## Question

How should the My waypoints screen show a routine save confirmation, and how should the expanded category picker avoid repeating its title while remaining accessible?

## Findings

- The current PersonalWaypointsHome places one role=status paragraph directly below Add waypoint and combines save feedback, category-visibility feedback, and the waypoint-limit message. This gives unrelated messages one visual and semantic treatment. The app has no shared toast or snackbar component in frontend/src; Explore already uses a muted, extra-small success status style.
- W3C says status updates should be announced without moving focus and without unnecessarily interrupting the user. Routine successful-action feedback is a status; role=status has polite live-region behavior. Keep that role and do not use an assertive alert for “Waypoint saved.” [W3C: Understanding Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages), [W3C: ARIA22](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22.html).
- Material Design describes snackbars as short process updates, usually at the bottom of the UI, that should not interrupt the user; they may dismiss automatically or remain until the user acts. This is a better fit for a one-line save confirmation than a large banner in the main content flow. [Material Design 3: Snackbar](https://m3.material.io/components/snackbar/overview).
- The GOV.UK Design System reserves notification banners for information users need to know that is not directly related to their current task, advises using them sparingly, and says a single-line notification does not need a heading. That supports avoiding another prominent “success” section in this waypoint workflow. [GOV.UK: Notification banner](https://design-system.service.gov.uk/components/notification-banner/).
- W3C's disclosure pattern keeps one button as the show/hide control, exposes its state with aria-expanded, and optionally links it to the controlled content with aria-controls. It supports a single category header that changes presentation as the picker opens, without rendering a second “Categories” heading. [W3C APG: Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).

## Recommendation

1. Show “Waypoint saved.” as a compact, muted snackbar at the bottom of the active More panel, above any fixed bottom navigation. Keep it one line, without a prominent success banner, large type, or heading. Keep it in a pre-existing polite status region (role=status, with aria-atomic=true if the whole message should be announced); do not move focus. The app has no shared snackbar today, so keep this local to My waypoints and reuse the existing muted success styling as a visual token. Choose a short but readable dismissal period, or allow manual dismissal; the cited guidance supports either behavior but does not prescribe a duration.
2. Keep persistent constraints such as the waypoint limit next to Add waypoint as compact supporting text. Keep failures separate and visible according to their urgency. Do not concatenate these with the transient save confirmation.
3. Make the current Categories summary control the sole category heading/control in both states. Closed state retains its compact selected-count summary. Open state expands that same top area into “Categories” plus the selected count, followed immediately by category search; remove the duplicate inner heading/count. Keep Selected and All categories as the list-group labels. Keep a single keyboard-operable button with aria-expanded and aria-controls for the panel.

This separates temporary success feedback from persistent constraints and keeps the expanded picker on one clear heading while preserving its existing groups and actions.
