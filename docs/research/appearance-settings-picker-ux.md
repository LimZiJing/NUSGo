# Appearance settings picker research

Date: 2026-11-03

## Question

How should NUSGo present the `Other themes` choices so the Appearance section has clearer divisions, stays compact, and can grow without a long list of theme cards?

## Findings

- Apple recommends a pop-up button for a flat list of mutually exclusive choices. After selection, the menu closes and the trigger can show the selected value. Pop-up buttons save space when the choices do not need to remain visible. [Apple Human Interface Guidelines: Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons)
- Apple describes segmented controls as a linear group of related choices, with each segment acting as a button. That fits the three immediate modes (`System`, `Light`, and `Dark`), which are short and useful to compare at a glance. [Apple Human Interface Guidelines: Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)
- Material 3's implementation guidance describes menus as temporary surfaces that appear after interaction, use one option per row, and take less space than always-visible radio choices. Its dropdown menu anatomy includes a container, list rows, and optional dividers or leading/trailing elements. [Material Components for Android: Menus](https://github.com/material-components/material-components-android/blob/master/docs/components/Menu.md)
- W3C's listbox pattern supports single-choice option lists. It distinguishes keyboard focus from the selected value, recommends a clear accessible name, and specifies arrow-key navigation; Home/End are strongly recommended when there are more than five options, with type-ahead recommended especially beyond seven. [WAI-ARIA APG: Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
- NUSGo already specifies a `Select` control that opens a floating list anchored to its trigger, shows a check on the selected option, supports keyboard navigation, and closes on selection, Escape, Tab, or outside click. [NUSGo UI controls](../ui/controls.md#select)

## Recommendation

Use the existing three-choice segmented control for `System`, `Light`, and `Dark`. Redesign `Other themes` as a single full-width dropdown trigger that shows the selected palette's swatch and name, or `Choose` when one of the three immediate modes is active. Open its options in an anchored menu with one palette per row, a check on the selected value, and a distinct focus state. Keep the menu temporary so adding palettes does not make the section taller at rest.

Give `Theme`, `Other themes`, and `Minute format` clear visual divisions inside one Appearance card: consistent side padding, heading size, control height, and thin theme-aware separators. Keep the existing no-subtext direction. Reuse the app's Select/menu behavior and tokens, adding only the swatch rendering needed by theme choices.

The recommendation to keep the three immediate modes segmented while moving the expandable palette collection into a popup is an inference from the cited platform guidance and the current NUSGo control specification. It also matches the supplied redesign reference more closely than the current always-visible list.
