# Personal waypoint placement UX

## Scope

This review uses the `personal-waypoint-details` branch as its baseline. Its placement panel presents a map action, two coordinate fields, `Apply coordinates`, `Use map centre`, `Cancel`, and `Continue` at once. The current copy explains tap and drag, but the manual-entry controls take equal visual weight. This is a design recommendation, not a usability study.

## What established guidance suggests

- **Keep the map as the main surface.** Apple's Maps guidance says maps should remain interactive, that non-interactive overlays can get in the way, and that selected features should be clearly distinguished. Keep the pin and surrounding map visible; make the placement panel compact and ensure it reads clearly over the map. [Apple Human Interface Guidelines: Maps](https://developer.apple.com/design/human-interface-guidelines/maps)
- **Progressively reveal the less common path.** GOV.UK recommends a Details disclosure to help people scan when it contains information only some users need, and cautions against hiding information most users need. Because this flow already describes tapping or dragging the pin as the main action, treat manual coordinate entry as the secondary path; confirm that assumption with user observation before removing its prominence permanently. [GOV.UK Design System: Details](https://design-system.service.gov.uk/components/details/)
- **Keep the coordinate inputs accessible when revealed.** GOV.UK advises visible, short, direct labels above inputs and warns against using placeholder text as a label. Keep explicit `Latitude` and `Longitude` labels in the expanded section. [GOV.UK Design System: Text input](https://design-system.service.gov.uk/components/text-input/); [W3C WAI: Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- **Give the next step one clear primary action.** GOV.UK recommends one default button for a page's main call to action; multiple main actions dilute the choice. Keep `Continue` as the only primary button and style `Cancel` as secondary. Move `Apply coordinates` and `Use map centre` next to the coordinate controls, or keep `Use map centre` as a low-emphasis shortcut if users rely on it. [GOV.UK Design System: Button](https://design-system.service.gov.uk/components/button/)
- **Support more than dragging.** WCAG 2.2 says dragging functionality must also work with a single pointer without dragging, unless dragging is essential. Keep map tapping as a pin-placement option and keep the coordinate fields as a precision/accessibility alternative. [WCAG 2.2, SC 2.5.7: Dragging Movements](https://www.w3.org/TR/WCAG22/#dragging-movements)
- **Preserve clear labels, focus, and targets.** WCAG requires visible keyboard focus and a minimum 24 × 24 CSS pixel target in applicable cases; NUSGo's coding standards set a higher 36px control minimum. Keep the existing focus treatment and 36px control floor. If a map tap or pin drop changes the selected location without moving focus, announce the settled location in a status message rather than announcing every drag movement. [WCAG 2.2, SC 2.4.7: Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible); [SC 2.5.8: Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum); [SC 4.1.3: Status Messages](https://www.w3.org/TR/WCAG22/#status-messages)

## Recommended compact layout

1. Heading: **Set location**.
2. One short instruction: **Tap the map or move the pin.**
3. A compact selected-coordinate readout so the location remains reviewable.
4. One disclosure: **Enter coordinates**, containing visible latitude and longitude labels and `Apply coordinates`. Keep `Use map centre` beside the selected-location summary as a low-emphasis shortcut only if users rely on it; the concept retains it from the current flow, but its value should be checked in use.
5. A stable footer with secondary `Cancel` and primary `Continue`.

Use the existing semantic theme tokens, surface, border, accent, and control styles from the branch so the panel still feels native to NUSGo. Avoid extra explanatory paragraphs, duplicate coordinate summaries, or multiple visually-primary controls. The copy and field order are consistent with the branch's existing WGS84 latitude/longitude flow.

## Sources

- Apple, [Maps — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/maps)
- GOV.UK Design System, [Details](https://design-system.service.gov.uk/components/details/), [Text input](https://design-system.service.gov.uk/components/text-input/), and [Button](https://design-system.service.gov.uk/components/button/)
- W3C Web Accessibility Initiative, [Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
