# Interface controls

This is the specification for NUSGo buttons, chips, and pills. Vocabulary is defined in `CONTEXT.md`; this document owns the variants, sizes, states, tokens, and migration plan. The React primitives live in `frontend/src/ui/`; their styles live in `frontend/src/ui/styles/shared/controls/`.

## Primitives

| Component | Use for | Notes |
| --- | --- | --- |
| `Button` | Actions with a visible label | Variants `primary`, `secondary` (default), `ghost`. Use `label` with optional leading `icon` and `trailingIcon` for a standard centered control, or `children` for a rich row whose content owns its alignment and layout. `type` defaults to `button` and supports `submit` and `reset`; a native form submit button can rely on the form `onSubmit` handler without a click callback. Native button attributes and pointer handlers are forwarded to the underlying button. Also accepts `title`, `expanded` and `controls` (`aria-expanded`, `aria-controls`) for disclosure triggers, and `busy` (`aria-busy`). |
| `IconButton` | Actions shown as an icon only | `label` is required and becomes `aria-label`. Square at control height. Also accepts variant `plain`: no box at rest, on hover or when pressed (hover only dims the icon; focus keeps the ring), for icon toggles such as a favourite star and for dismiss icons. The caller changes the icon to show a pressed state. |
| `BackButton` | Back navigation | `mode="header"` composes a plain `IconButton`; `mode="inline"` shows a compact arrow and label; `mode="label-only"` keeps a label-only ghost action. |
| `MenuItem` | A row inside a menu or popover | Ghost row: full width, left-aligned, tinted on hover and focus, no border. |
| `Chip` | An interactive, selectable choice | Toggles announce state through `aria-pressed`. `RouteChip` is a route-specific wrapper that supplies the official route colour as the chip tone. |
| `Pill` | A non-interactive status label | Tones `neutral` and `success`, optional leading dot. `InfoPill` is built on it. |
| `Select` | Choosing one value from a short list, such as a building | Labelled dropdown with a `listbox`. See [Select](#select). |

`NavigateButton` is a primary `Button` with the navigation icon. `BackButton` uses the shared `IconButton` or `Button` for header, inline and label-only back actions. Inline mode keeps the existing compact arrow-and-label geometry.

Props are platform-neutral. `className` is for layout. Shared variants and tokens own a control's appearance; documented feature surfaces below keep local styling to preserve established layouts.

### Variants

- **Primary**: solid accent fill with inverse text. One per view for the main action.
- **Secondary**: neutral `--surface-control` fill, primary text, and a 1px `--control-border`. The default, and the look of `IconButton`. It is deliberately not accent-tinted.
- **Ghost**: no border or fill; accent-coloured label, with an `--accent-soft` background tint on hover and focus.

`Chip` is pill-shaped: unselected it uses the secondary look (`--surface-control`, primary text, `--control-border`); selected it is a solid accent fill with inverse text. `Pill` uses `--surface-muted` with `--text-muted` at 12px, weight 500, and no border; its `success` tone keeps the success tokens. `RouteChip` stays route-coloured.

### Sizes

| Size | Height | Font | Use |
| --- | --- | --- | --- |
| `sm` (default) | `--control-height-sm`, 36px | 14px, weight 500 | Everyday controls, radius 10px. 36px is the app-wide touch-target minimum. |
| `lg` | `--control-height-lg`, 44px | 16px, weight 600 | Prominent or thumb-first actions, radius 12px. |

`--control-height-md` (40px) stays in `tokens.css` for existing styles but is not a primitive size.

### States

Every primitive supports: default, hover, active, focus-visible, disabled, and selected.

- **Hover** appears only inside `@media (hover: hover)`. Secondary buttons, chips and controls that use the native fallback use `--surface-control-hover`; primary buttons use `--accent-hover`; ghost buttons and menu items use `--accent-soft`; plain icon buttons dim their icon.
- **Active** scales down slightly (not with reduced motion).
- **Focus-visible** draws the shared 2px accent outline offset by 2px (`--focus-outline`, `--focus-ring-offset`). Menu items draw it inset.
- **Disabled** uses `--text-muted` on `--surface-control` at reduced opacity and does not react to hover or press. Disabled controls are exempt from WCAG contrast requirements, so they have no 3:1 rule.
- **Selected** is expressed as `aria-pressed="true"`: `Button` uses `--accent-selected`, a neutral border, primary text and an accent icon. Plain icon buttons keep their transparent surface and use the icon to reinforce state. `Chip` keeps its solid accent fill with inverse text, or its supplied route tone.

Do not rely on colour alone: selection is always exposed through `aria-pressed`.

### Tokens

Defined in `frontend/src/ui/styles/shared/tokens.css`; theme-dependent colours come from five theme files (Light, Dark, NUS, Matcha, Sakura). Shared map roles and reusable shadow/ring values are also named in `tokens.css`.

| Token | Value | Purpose |
| --- | --- | --- |
| `--control-height-sm` / `--control-height-lg` | 36px / 44px | Control heights |
| `--radius-control` / `--radius-control-lg` | 10px / 12px (`--radius-lg`) | Button and menu item corners; the large size uses the second |
| `--control-border` | Per theme: `color-mix` of `--text-primary` into `--surface` (Light 50%, Dark 35%, NUS 58%, Matcha 65%, Sakura 65%) | Neutral border of secondary controls and selected buttons |
| `--accent-selected` | 26% theme accent mixed into `--surface-control` | Fill for selected buttons and open Selects |
| `--surface-control-hover` | 11% theme primary text mixed into `--surface-control` | Neutral hover surface for secondary controls and chips |
| `--radius-pill` | 999px | Chips and pills |
| `--font-size-control` / `--font-size-control-lg` | 14px / 16px | Control text by size |
| `--font-size-label` | 12px | Pill text |
| `--focus-ring-width`, `--focus-ring-offset`, `--focus-outline` | 2px, 2px, 2px solid accent | Focus outline |
| `--sans` | system stack | The only font family for controls |

### Why `--control-border` exists

A neutral control sits on a similar neutral surface, so its border is what marks the control's boundary. WCAG 1.4.11 asks for 3:1 against the adjacent colour, and the older `--border-control` falls short of that. `--control-border` mixes the primary text colour into the surface, which scales with each theme, and the percentages are chosen so it reaches at least 3:1 against `--surface` in all five themes. `theme-tokens.test.ts` also checks primary text on `--accent-selected` and `--surface-control-hover` (4.5:1), and accent icons on the selected fill (3:1). If a theme edit breaks a ratio, adjust the token rather than the threshold.

`--focus-ring` already exists as a per-theme colour used by older controls and is unchanged. The mobile sheet handle keeps its own focus tint; that is a documented exception.

## Select

`Select` (`frontend/src/ui/select.tsx`, styles in `controls/select.css`) is a themed replacement for the native `<select>`. Props: `label` (visible above the trigger and used as the listbox name), `value`, `options` (`{ value, label, leading? }[]`), `onChange(value)`, and optional `placeholder`, `size` (`sm` or `lg`), `checkPosition` (`start` or `end`, default `start`), `hideLabel`, `id`, and `className` (layout only). `leading` is decorative content shown before an option label and is hidden from assistive technology.

- The trigger is a `button` with `aria-haspopup="listbox"` and `aria-expanded`. It uses a field look: `--border-control` and `--surface-raised` at rest, with a 36px `sm` or 44px `lg` minimum height and one line with ellipsis. Open state adds an accent border and `--accent-selected` fill, and flips the chevron. If the current value has no matching option, `placeholder` supplies the displayed trigger text without adding a selectable option.
- The list floats over the page in a **portal** on `document.body`, fixed to the trigger and as wide as it. It never pushes content down, and scroll containers and the mobile bottom sheet cannot clip it. It opens below the trigger, or above when there is more room there, is capped at 14rem (less when the viewport is short) and scrolls inside itself, and follows the trigger through scrolls and resizes.
- The selected option has primary text on `--accent-selected` and an accent check icon at `checkPosition`. An unselected active option has an `--accent-soft` tint, so selection remains visible as keyboard or pointer highlight moves.
- `onChange` fires only when the value changes. Selecting closes the list and returns focus to the trigger.

Keyboard: Enter, Space or ArrowDown on the trigger opens the list with the selected option active. ArrowUp and ArrowDown move the active option, Home and End jump to the first and last. Enter or Space selects it. Escape closes without selecting and returns focus. Tab, or a click outside, closes the list.

## Documented exceptions

Every new interactive control is at least 36px tall and wide (`--control-height-sm`). The mobile sheet grab bar is the only approved compact target:

- **Mobile sheet handle**: the handle row is 24px tall at the partial and full detents, which meets the WCAG 2.2 AA target-size minimum (2.5.8) but not the 36px standard. This keeps the space between the grab bar and the sheet content tight (10px above and below the bar). The handle is full width, and a swipe anywhere on the sheet also moves it. Its keyboard focus uses a background tint instead of a ring (see above). Do not extend this exception to other controls.
- **Existing undersized controls**: inline `BackButton` has a 23px target, compact `RouteChip` has a 24px target, and Plan search filter chips have a 28px target. These are known shortfalls for #304 to track; its follow-up inventory should include all three before the issue closes. This migration preserves their current appearance, and they are not models for new controls.
- **Locally styled control surfaces**: Explore result cards, nearby-stop rows and route timeline stops; Plan journey summaries, origin and destination rows, search results and filter chips; More destination rows; Stops disclosure rows; Personal Waypoint appearance, visibility and category triggers; and selectable copy in the shared `SavedListRow` use named local classes for their established layout and appearance while composing `Button` or `Chip` for shared interaction and state behavior. Their colors use theme tokens. Keep these styles in the owning feature or shared-row stylesheet; remove stale overrides that are shadowed by shared state rules; make intended local hover colors explicit; do not add shared variants for a one-off surface.

## Gallery

Run the dev server and open `/?gallery` for a one-page review of every variant, size, and state, in Light, Dark, NUS, Matcha, and Sakura side by side. Each theme is its own embedded page (`/?gallery&frame=light`, `dark`, `nus`, `matcha`, `sakura`) so it uses the real `data-theme` mechanism; the gallery sets `data-theme` directly because `ui/theme.ts` only models Light and Dark. Hover, active, and focus-visible are forced with a `data-state` attribute in `frontend/src/ui/gallery/gallery.css`; disabled and selected are real attributes. The gallery is loaded lazily behind `import.meta.env.DEV`, so production builds contain neither it nor its CSS. Update the gallery whenever a primitive gains a variant, size, or state.

## Lint rule: no bare `button` selectors

`npm run lint` also runs `node frontend/scripts/lint-css.mjs`, which reads every `.css` file under `frontend/src` and fails on a stylesheet that styles a bare `button` element. Bare `button` rules in a feature stylesheet collide with shared classes of equal specificity (the cause of the grey Navigate button on Stops), so styles belong on classes.

**Definition.** The check splits each rule's selector list into complex selectors and each of those into compound selectors (runs of simple selectors with no combinator). A compound selector is a *bare button* when its type is `button` and it has no class (`.x`), id (`#x`), or attribute selector (`[x]`) on that same compound. Pseudo-classes and pseudo-elements give no identity, so `button:hover`, `button:disabled`, and `button:where(:not(.route-chip))` are bare. A `button` anywhere in a selector counts, whether it is the subject or a descendant or child (`.panel button`, `.panel > button`). The arguments of `:is()`, `:where()`, and `:has()` are checked the same way; `:not(button)` is not a styling of a button and is allowed. Comments and strings are ignored.

Allowed: `.button`, `button.primary`, `.panel button.primary`, `button[type='submit']`, `.navigate-button:hover`. Flagged: `button`, `.panel button`, `button:hover`, `.panel :is(button, a)`.

**Allowlist.** The only allowlisted selectors are the three global defaults in `base.css`. The focus rule still protects `.journey-test-time-toggle`, hover retains the existing treatment on `.navigation-tab`, `.more-entry-button` and the PWA install row, and tap-highlight keeps native buttons from flashing on touch. No feature stylesheet is allowlisted. Keep these defaults until each named consumer has an explicit equivalent. Detection logic is unit-tested in `frontend/scripts/css-bare-button.test.mjs`.

## Migration checklist

The feature control migration is complete: Explore, Plan, Stops, More, Waypoints and Live buses use the shared Button family for their action controls. The global native-button defaults remain documented above; compact map, route and status controls keep their existing semantic wrappers.

- [x] Stops (shared back navigation and feature action rows use the Button family)
- [x] Explore (uses the shared `BackButton`, `NavigateButton`, `RouteChip` and `InfoPill` wrappers)
- [x] Plan
- [x] Map controls (the theme, locate and fit-routes buttons keep their Base UI Button and overlay styling; only a dead `.location-control-popover button` rule was removed)
- [x] Sheet (the mobile tab bar items keep a bespoke pill style on the `navigation-tab` class, and the sheet handle keeps its own drag-handle styling and 24px row, because neither is a standard button; only the generic `.main-navigation button` selectors were replaced)
- [x] Popovers (the endpoint locate button is a plain `IconButton`; search result rows keep their own classes because they are rich multi-line rows)
- [x] Menus (the Plan trip-actions `Clear all` row is a `MenuItem` and its ellipsis trigger is a plain `IconButton`)
- [x] Saved lists (selectable row copy uses `Button`; row layout remains in `SavedListRow`)

`InfoPill` keeps its 10px metrics because it is non-interactive. Map popup route labels are non-interactive elements with the `route-chip` class.
