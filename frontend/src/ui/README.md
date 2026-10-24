# Shared UI assets

## `icons/`

Use this folder for functional UI icons. Import icons from `./icons`; do not import `lucide-react` directly from feature or control modules. The wrappers keep decorative accessibility defaults and give the application stable, human-readable names for its icon choices.

## `brand-assets/`

Use this folder for static product and external brand SVGs, such as the NUSGo favicon, NUSMods logo, and social icons. Brand assets are not interchangeable with functional UI icons and should not be added to the Lucide wrapper module.

## Buttons, chips, and pills

`Button`, `IconButton`, `MenuItem`, `Chip`, and `Pill` are the shared interactive and status primitives. Build screen-specific controls on them (as `NavigateButton`, `GhostBackButton`, `RouteChip`, and `InfoPill` do) rather than styling bare `button` elements. Pass `className` for layout only. See [docs/ui/controls.md](../../../docs/ui/controls.md) for variants, sizes, states, tokens, and the migration checklist.
