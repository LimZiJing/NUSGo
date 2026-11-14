# Compact Community Waypoint details form

## Findings

- Group related controls with a `<fieldset>` and a short `<legend>` such as **Services**, **Colour**, **Items**, or **Prep**. Keep the DOM order the same as the visual order so keyboard and screen-reader navigation stay predictable. [GOV.UK fieldsets](https://design-system.service.gov.uk/components/fieldset/), [USWDS forms](https://designsystem.digital.gov/components/form/)
- Use checkboxes for multi-select fields such as Services, Items, and Prep. Keep each checkbox beside its own short label. GOV.UK and Carbon prefer vertically readable options; Carbon allows horizontal groups when the layout calls for them. Avoid making every choice a large bordered tile, which can clutter a dense panel. [GOV.UK checkboxes](https://design-system.service.gov.uk/components/checkboxes/), [Carbon checkbox guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/checkbox/guidelines), [USWDS checkbox tiles](https://designsystem.digital.gov/components/checkbox/)
- **Colour** is a single Yes/No answer, so radios are the standard control. GOV.UK allows two short radio options inline and says to stack them on small screens. Keep the group legend visible. [GOV.UK radios](https://design-system.service.gov.uk/components/radios/)
- The **More details (optional)** disclosure fits because these fields are optional and only relevant for two categories. Use a short descriptive summary and omit explanatory copy that repeats the labels or review process. Do not hide information most users need. [GOV.UK details](https://design-system.service.gov.uk/components/details/)
- Put Grayscale and Colour price inputs on one row when there is room, then stack them at narrow widths. An `S$` prefix communicates currency without a separate “Amounts in SGD” line. Keep the accessible labels clear about the data and unit because decorative prefixes are often hidden from screen readers. [USWDS input prefix/suffix](https://designsystem.digital.gov/components/input-prefix-suffix/)

## Recommendation for this panel

Remove the review helper sentence and the separate currency sentence. Use a simple two-column list for the short checkbox choices, with no tile around each option; keep native-sized checkboxes and labels together. Put the two Colour radios beside each other on wider panels and let them wrap on mobile. Keep the two price inputs side by side when they fit. Preserve fieldsets, legends, focus indicators, and readable spacing; compactness should come from removing repeated copy and empty vertical gaps, not shrinking controls or text.

If an editor must be able to clear a previously verified Colour value back to unknown, keep a clear/unknown path. A selected Yes/No radio cannot be deselected with the keyboard; GOV.UK notes that a radio group needs an explicit “I do not know” option when that answer is valid. [GOV.UK radios](https://design-system.service.gov.uk/components/radios/)
