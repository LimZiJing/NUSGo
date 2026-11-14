# Community waypoint price prefix layout

## Findings

- Base UI `Input` renders a native input and lets the caller style it with `className` or `style`; its docs do not provide a built-in prefix slot. The prefix/input layout is therefore controlled by this form's wrapper CSS. [Base UI Input](https://base-ui.com/react/components/input)
- MUI documents a leading `InputAdornment` for prefixes and units. This is a common input-group pattern, but it does not guarantee a narrow adornment by itself; the containing layout still needs an explicit width strategy. [MUI Text Field adornments](https://mui.com/material-ui/react-text-field/#input-adornments), [MUI InputAdornment API](https://mui.com/material-ui/api/input-adornment/)
- CSS Grid's `max-content` track follows the largest intrinsic content contribution; it is not a width cap. `minmax(0, 1fr)` allows the value track to shrink to the available width. For a fixed, short prefix such as `S$`, a small explicit prefix track is the most predictable option. [MDN `grid-template-columns`](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-columns)
- A native `type="number"` may show stepper controls and is meant for values where incrementing/decrementing is useful. Those controls occupy part of the value area, especially in narrow fields. MDN recommends retaining the number type when the spinbutton behavior is useful; it describes `inputmode` alternatives for cases where it is not. [MDN number input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number)
- Base UI requires form controls to have accessible names. A decorative visible prefix can remain hidden from assistive technology if the input label or accessible name already says the value is in Singapore dollars. [Base UI Input usage guidelines](https://base-ui.com/react/components/input#usage-guidelines)

## Research recommendation and implementation decision

Keep the visible `S$` prefix, but cap its track at `1.25rem` with minimal horizontal padding and give the numeric input the remaining space with `minmax(0, 1fr)`. The measured `S$` text is about 16px at the current control font size, so this leaves room for the glyphs and divider while reclaiming about 5px from the former content-sized track. Keep `min-width: 0` on the grid, field, and input. Do not use `max-content` as the final width constraint: it follows intrinsic sizing instead of enforcing the compact limit this field needs.

The user reviewed this recommendation and asked to revert the fixed prefix cap. The implementation decision is to keep the prefix content-sized (`max-content`) and let the numeric input fill the remaining track. The fixed-width option remains the research recommendation, not the shipped design choice. Check the resulting proportions on both desktop and narrow mobile layouts.

Keep Grayscale and Colour side by side only when each input remains usable; stack them at narrow panel widths. The prefix rule should stay the same at every width. If the prefix still appears wide after this rule is active, inspect the computed `grid-template-columns` and loaded stylesheet first; the fixed track should render at its declared width.

Keep `type="number"` if the stepper is useful for price entry. Remove or customize it only if desktop/mobile checks show the spinner is reducing the editable area too much; changing input type affects validation and keyboard behavior, not just appearance. Preserve the existing currency-specific accessible name either way.
