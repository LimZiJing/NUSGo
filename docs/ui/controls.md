# Interface controls

This is the spec for NavUS buttons, chips, and pills (issue #333). Vocabulary is defined in `CONTEXT.md`; this document owns the variants, sizes, states, tokens, and migration plan. The React primitives live in `frontend/src/ui/`; their styles live in `frontend/src/ui/styles/shared/controls/`.

## Primitives

| Component | Use for | Notes |
| --- | --- | --- |
| `Button` | Actions with a visible label | Variants `primary`, `secondary` (default), `ghost`. Optional leading `icon`. Always `type="button"`. |
| `IconButton` | Actions shown as an icon only | `label` is required and becomes `aria-label`. Square at control height. |
| `MenuItem` | A row inside a menu or popover | Ghost row: full width, left-aligned, tinted on hover and focus, no border. |
| `Chip` | An interactive, selectable choice | Toggles announce state through `aria-pressed`. `RouteChip` is a route-specific wrapper that supplies the official route colour as the chip tone. |
| `Pill` | A non-interactive status label | Tones `neutral` and `success`, optional leading dot. `InfoPill` is built on it. |

`NavigateButton` is a primary `Button` with the navigation icon. `GhostBackButton` is a ghost `Button` with the left arrow; it keeps its compact back-link geometry in `ghost-back-button.css` until Stops and Explore migrate.

Props are platform-neutral. `className` is for layout only (alignment, flex sizing); it must never change the look. The look comes from `variant`, `size`, state, and tokens.

### Variants

- **Primary**: accent fill with inverse text. One per view for the main action.
- **Secondary**: neutral surface with a control border. The default.
- **Ghost**: no border or fill; text only, with a background tint on hover.

### Sizes

| Size | Height | Font | Use |
| --- | --- | --- | --- |
| `sm` (default) | `--control-height-sm`, 36px | 14px | Everyday controls. 36px is the app-wide touch-target minimum. |
| `lg` | `--control-height-lg`, 44px | 16px | Prominent or thumb-first actions. |

`--control-height-md` (40px) stays in `tokens.css` for existing styles but is not a primitive size.

### States

Every primitive supports: default, hover, active, focus-visible, disabled, and selected.

- **Hover** darkens the control by 15% (`filter: brightness(0.85)`, the repo's existing treatment) only inside `@media (hover: hover)`, so touch devices never show a stuck hover. Ghost buttons and menu items tint their background instead.
- **Active** scales down slightly (not with reduced motion).
- **Focus-visible** draws the shared 2px accent outline offset by 2px (`--focus-outline`, `--focus-ring-offset`). Menu items draw it inset.
- **Disabled** uses `--text-muted` on `--surface-control` and does not react to hover or press.
- **Selected** is expressed as `aria-pressed="true"`: accent border with `--accent-soft` fill for `Button`, and the chip tone (or accent) for `Chip`.

Do not rely on colour alone: selection is always exposed through `aria-pressed`.

### Tokens

Defined in `frontend/src/ui/styles/shared/tokens.css`; colours come from the existing per-theme tokens, so Light and Dark need no extra work.

| Token | Value | Purpose |
| --- | --- | --- |
| `--control-height-sm` / `--control-height-lg` | 36px / 44px | Control heights |
| `--radius-control` | 8px (`--radius-md`) | Button and menu item corners |
| `--radius-pill` | 999px | Chips and pills |
| `--font-size-control` / `--font-size-control-lg` | 14px / 16px | Control text by size |
| `--font-size-label` | 12px | Pill text |
| `--focus-ring-width`, `--focus-ring-offset`, `--focus-outline` | 2px, 2px, 2px solid accent | Focus outline |
| `--sans` | system stack | The only font family for controls |

`--focus-ring` already exists as a per-theme colour used by older controls and is unchanged. The mobile sheet handle keeps its own focus tint; that is a documented exception.

## Gallery

Run the dev server and open `/?gallery` for a one-page review of every variant, size, and state, in Light and Dark side by side. Each theme is its own embedded page (`/?gallery&frame=light` and `frame=dark`) so it uses the real `data-theme` mechanism. Hover, active, and focus-visible are forced with a `data-state` attribute in `frontend/src/ui/gallery/gallery.css`; disabled and selected are real attributes. The gallery is loaded lazily behind `import.meta.env.DEV`, so production builds contain neither it nor its CSS. Update the gallery whenever a primitive gains a variant, size, or state.

## Lint rule: no bare `button` selectors

`npm run lint` also runs `node frontend/scripts/lint-css.mjs`, which reads every `.css` file under `frontend/src` and fails on a stylesheet that styles a bare `button` element. Bare `button` rules in a feature stylesheet collide with shared classes of equal specificity (the cause of the grey Navigate button on Stops), so styles belong on classes.

**Definition.** The check splits each rule's selector list into complex selectors and each of those into compound selectors (runs of simple selectors with no combinator). A compound selector is a *bare button* when its type is `button` and it has no class (`.x`), id (`#x`), or attribute selector (`[x]`) on that same compound. Pseudo-classes and pseudo-elements give no identity, so `button:hover`, `button:disabled`, and `button:where(:not(.route-chip))` are bare. A `button` anywhere in a selector counts, whether it is the subject or a descendant or child (`.panel button`, `.panel > button`). The arguments of `:is()`, `:where()`, and `:has()` are checked the same way; `:not(button)` is not a styling of a button and is allowed. Comments and strings are ignored.

Allowed: `.button`, `button.primary`, `.panel button.primary`, `button[type='submit']`, `.navigate-button:hover`. Flagged: `button`, `.panel button`, `button:hover`, `.panel :is(button, a)`.

**Allowlist.** Existing offenders are listed in `frontend/scripts/bare-button-allowlist.mjs` as a count of bare selectors per stylesheet. It is a ratchet: a file may not exceed its count, and when a migration removes selectors the count must be lowered (or the entry deleted) in the same change, so the list only shrinks. The goal is an empty allowlist once every screen has migrated. Detection logic is unit-tested in `frontend/scripts/css-bare-button.test.mjs`.

## Migration checklist

Each item is one small pull request, and each lowers the matching counts in the lint allowlist. Screens keep their feature stylesheets until they migrate; those stylesheets still style bare `button` elements and are the reason the primitives raise specificity only where a compatibility file says so.

- [ ] Stops (also remove `ghost-back-button.css` and the `.stop-opposite` rule in `navigate-button.css`)
- [ ] Explore
- [ ] Plan
- [ ] Map controls
- [ ] Sheet
- [ ] Popovers
- [ ] Menus (including the Plan trip-actions `Clear all` row, which becomes a `MenuItem`)

Known leftovers until then: `RouteChip` in its compact size keeps its current 24px height (the Chip `sm` size is 36px) and `InfoPill` keeps its 10px compact metrics, both to avoid visual change on screens that are not yet migrated. Map popup route chips are plain elements that still use the `route-chip` class.
