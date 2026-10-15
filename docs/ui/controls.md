# Interface controls

This is the specification for NavUS buttons, chips, and pills. Vocabulary is defined in `CONTEXT.md`; this document owns the variants, sizes, states, tokens, and migration plan. The React primitives live in `frontend/src/ui/`; their styles live in `frontend/src/ui/styles/shared/controls/`.

## Primitives

| Component | Use for | Notes |
| --- | --- | --- |
| `Button` | Actions with a visible label | Variants `primary`, `secondary` (default), `ghost`. Optional leading `icon` and `trailingIcon`. Always `type="button"`. Also accepts `title`, `expanded` and `controls` (`aria-expanded`, `aria-controls`) for disclosure triggers, and `busy` (`aria-busy`). |
| `IconButton` | Actions shown as an icon only | `label` is required and becomes `aria-label`. Square at control height. Also accepts variant `plain`: no box at rest, on hover or when pressed (hover only dims the icon; focus keeps the ring), for icon toggles such as a favourite star and for dismiss icons. The caller changes the icon to show a pressed state. |
| `MenuItem` | A row inside a menu or popover | Ghost row: full width, left-aligned, tinted on hover and focus, no border. |
| `Chip` | An interactive, selectable choice | Toggles announce state through `aria-pressed`. `RouteChip` is a route-specific wrapper that supplies the official route colour as the chip tone. |
| `Pill` | A non-interactive status label | Tones `neutral` and `success`, optional leading dot. `InfoPill` is built on it. |

`NavigateButton` is a primary `Button` with the navigation icon. `GhostBackButton` is a ghost `Button` with the left arrow; it keeps its compact back-link geometry in `ghost-back-button.css` until Stops and Explore migrate.

Props are platform-neutral. `className` is for layout only (alignment, flex sizing); it must never change the look. The look comes from `variant`, `size`, state, and tokens.

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

- **Hover** darkens the control by 15% (`filter: brightness(0.85)`, the repo's existing treatment) only inside `@media (hover: hover)`, so touch devices never show a stuck hover. Ghost buttons and menu items tint their background with `--accent-soft` instead (menu items also on focus-visible).
- **Active** scales down slightly (not with reduced motion).
- **Focus-visible** draws the shared 2px accent outline offset by 2px (`--focus-outline`, `--focus-ring-offset`). Menu items draw it inset.
- **Disabled** uses `--text-muted` on `--surface-control` at reduced opacity and does not react to hover or press. Disabled controls are exempt from WCAG contrast requirements, so they have no 3:1 rule.
- **Selected** is expressed as `aria-pressed="true"`: accent border with `--accent-soft` fill for primary and secondary `Button`; a pressed ghost button (an icon toggle such as the favourite star) draws no box, so the caller must change the icon to show the state; for `Chip`, a solid accent fill with inverse text, or the chip tone (such as a route colour) when one is supplied.

Do not rely on colour alone: selection is always exposed through `aria-pressed`.

### Tokens

Defined in `frontend/src/ui/styles/shared/tokens.css`; colours come from the per-theme tokens in the four theme files (Light, Dark, Matcha, Sakura). The one new colour token, `--control-border`, is defined in each theme file.

| Token | Value | Purpose |
| --- | --- | --- |
| `--control-height-sm` / `--control-height-lg` | 36px / 44px | Control heights |
| `--radius-control` / `--radius-control-lg` | 10px / 12px (`--radius-lg`) | Button and menu item corners; the large size uses the second |
| `--control-border` | Per theme: `color-mix` of `--text-primary` into `--surface` (Light 50%, Dark 35%, Matcha 57%, Sakura 55%) | Border of secondary buttons and unselected chips |
| `--radius-pill` | 999px | Chips and pills |
| `--font-size-control` / `--font-size-control-lg` | 14px / 16px | Control text by size |
| `--font-size-label` | 12px | Pill text |
| `--focus-ring-width`, `--focus-ring-offset`, `--focus-outline` | 2px, 2px, 2px solid accent | Focus outline |
| `--sans` | system stack | The only font family for controls |

### Why `--control-border` exists

A neutral control sits on a similar neutral surface, so its border is what marks the control's boundary. WCAG 1.4.11 asks for 3:1 against the adjacent colour, and the older `--border-control` falls short of that. `--control-border` mixes the primary text colour into the surface, which scales with each theme, and the percentages above were chosen so it reaches at least 3:1 against `--surface` in all four themes. `theme-tokens.test.ts` checks this, plus: `--text-primary` on `--surface-control` (4.5:1), `--text-inverse` on `--accent` (4.5:1), and `--accent` on `--surface` (3:1 for the primary fill boundary, 4.5:1 for the ghost label). If a theme edit breaks a ratio, adjust the token rather than the threshold.

`--focus-ring` already exists as a per-theme colour used by older controls and is unchanged. The mobile sheet handle keeps its own focus tint; that is a documented exception.

## Documented exceptions

Every interactive control is at least 36px tall and wide (`--control-height-sm`). The only exception is the mobile sheet grab bar:

- **Mobile sheet handle**: the handle row is 24px tall at the partial and full detents, which meets the WCAG 2.2 AA target-size minimum (2.5.8) but not the 36px standard. This keeps the space between the grab bar and the sheet content tight (10px above and below the bar). The handle is full width, and a swipe anywhere on the sheet also moves it. Its keyboard focus uses a background tint instead of a ring (see above). Do not extend this exception to other controls.

## Gallery

Run the dev server and open `/?gallery` for a one-page review of every variant, size, and state, in Light, Dark, Matcha, and Sakura side by side. Each theme is its own embedded page (`/?gallery&frame=light`, `dark`, `matcha`, `sakura`) so it uses the real `data-theme` mechanism; the gallery sets `data-theme` directly because `ui/theme.ts` only models Light and Dark. Hover, active, and focus-visible are forced with a `data-state` attribute in `frontend/src/ui/gallery/gallery.css`; disabled and selected are real attributes. The gallery is loaded lazily behind `import.meta.env.DEV`, so production builds contain neither it nor its CSS. Update the gallery whenever a primitive gains a variant, size, or state.

## Lint rule: no bare `button` selectors

`npm run lint` also runs `node frontend/scripts/lint-css.mjs`, which reads every `.css` file under `frontend/src` and fails on a stylesheet that styles a bare `button` element. Bare `button` rules in a feature stylesheet collide with shared classes of equal specificity (the cause of the grey Navigate button on Stops), so styles belong on classes.

**Definition.** The check splits each rule's selector list into complex selectors and each of those into compound selectors (runs of simple selectors with no combinator). A compound selector is a *bare button* when its type is `button` and it has no class (`.x`), id (`#x`), or attribute selector (`[x]`) on that same compound. Pseudo-classes and pseudo-elements give no identity, so `button:hover`, `button:disabled`, and `button:where(:not(.route-chip))` are bare. A `button` anywhere in a selector counts, whether it is the subject or a descendant or child (`.panel button`, `.panel > button`). The arguments of `:is()`, `:where()`, and `:has()` are checked the same way; `:not(button)` is not a styling of a button and is allowed. Comments and strings are ignored.

Allowed: `.button`, `button.primary`, `.panel button.primary`, `button[type='submit']`, `.navigate-button:hover`. Flagged: `button`, `.panel button`, `button:hover`, `.panel :is(button, a)`.

**Allowlist.** Existing offenders are listed in `frontend/scripts/bare-button-allowlist.mjs` as a count of bare selectors per stylesheet. It is a ratchet: a file may not exceed its count, and when a migration removes selectors the count must be lowered (or the entry deleted) in the same change, so the list only shrinks. The goal is an empty allowlist once every screen has migrated. Detection logic is unit-tested in `frontend/scripts/css-bare-button.test.mjs`.

## Migration checklist

Each item is one small pull request, and each lowers the matching counts in the lint allowlist. Screens keep their feature stylesheets until they migrate; those stylesheets still style bare `button` elements and are the reason the primitives raise specificity only where a compatibility file says so.

- [ ] Stops (also remove `ghost-back-button.css` and the `.stop-opposite` rule in `navigate-button.css`)
- [x] Explore
- [x] Plan
- [x] Map controls (the theme, locate and fit-routes buttons keep their Base UI Button and overlay styling; only a dead `.location-control-popover button` rule was removed)
- [x] Sheet (the mobile tab bar items keep a bespoke pill style on the `navigation-tab` class, and the sheet handle keeps its own drag-handle styling and 24px row, because neither is a standard button; only the generic `.main-navigation button` selectors were replaced)
- [x] Popovers (the endpoint locate button is a plain `IconButton`; search result rows keep their own classes because they are rich multi-line rows)
- [x] Menus (the Plan trip-actions `Clear all` row is a `MenuItem` and its ellipsis trigger is a plain `IconButton`)

Known leftovers until then: `RouteChip` in its compact size keeps its current 24px height (the Chip `sm` size is 36px) and `InfoPill` keeps its 10px compact metrics, both to avoid visual change on screens that are not yet migrated. Map popup route chips are plain elements that still use the `route-chip` class.
