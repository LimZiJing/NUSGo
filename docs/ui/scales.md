# Type, radius and spacing scales

This is the specification for the shared design scales. Interface controls have their own spec in [controls.md](controls.md). All tokens live in `frontend/src/ui/styles/shared/tokens.css`; feature stylesheets should use them instead of literal values.

## Font family

Use `var(--sans)` for all text (`font: 600 14px/1.2 var(--sans)`). Do not write `system-ui, sans-serif` in a rule. `type-scale.test.ts` fails if any stylesheet other than `tokens.css` mentions `system-ui`.

## Font size

| Token | Size | Typical use |
| --- | --- | --- |
| `--font-size-xs` | 12px | Smallest text: pills, captions, tab labels, map labels |
| `--font-size-sm` | 13px | Secondary lines and detail text |
| `--font-size-md` | 14px | Body text and everyday controls |
| `--font-size-lg` | 16px | Prominent controls, section titles on mobile |
| `--font-size-xl` | 18px | Panel titles |
| `--font-size-2xl` | 20px | Larger titles |
| `--font-size-3xl` | 24px | Stop and venue headings |

- **12px is the minimum.** Nothing is set below 12px. This is a product decision for legibility on small screens; WCAG 2.2 has no minimum text size (it requires text to resize to 200%, SC 1.4.4).
- Display sizes above 24px (30, 36 and 56px today) keep literal values until a use shows they need a token.
- `--font-size-control`, `--font-size-control-lg` and `--font-size-label` are aliases for `md`, `lg` and `xs`, kept so the interface controls keep their names.
- Line height stays with the rule (`font: 600 14px/1.2 ...`); there is no line-height scale.

## Radius

| Token | Size |
| --- | --- |
| `--radius-sm` | 4px |
| `--radius-status` | 5px |
| `--radius-panel` | 6px |
| `--radius-md` | 8px |
| `--radius-card`, `--radius-control` | 10px |
| `--radius-lg`, `--radius-control-lg` | 12px |
| `--radius-timeline` | 14px |
| `--radius-pill` | 999px |

- Off-scale radii snap to the nearest existing token; there are no new radius tokens. A nested shape uses a smaller radius than its container (the segmented control's 10px option holds an 8px indicator).

## Spacing

| Token | Size |
| --- | --- |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |

- Spacing sits on a 4px grid. Off-grid values move to the nearest step when the shift is 2px or less: 5px becomes 4px; 7px and 9px become 8px; 11px becomes 12px.
- When a value is exactly between two steps (6px, 14px), padding rounds up so touch targets do not shrink, and gaps, margins and offsets round down so dense mobile layouts do not grow.
- 10px is not migrated yet, and values inside `calc()` keep their literals.

## Migration

Font sizes are on the scale in every stylesheet. Off-scale values moved to the nearest step: 10px and 11px became 12px, 15px and 17px became 16px, and 23px became 24px. `type-scale.test.ts` fails on a literal `font` or `font-size` of 24px or less outside `tokens.css`. Radius and spacing follow the rules in their sections above.
