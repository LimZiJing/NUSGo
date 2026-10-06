# Shared UI assets

## `icons/`

Use this folder for functional UI icons. Import icons from `./icons`; do not import `lucide-react` directly from feature or control modules. The wrappers keep decorative accessibility defaults and give the application stable, human-readable names for its icon choices.

## `brand-assets/`

Use this folder for static product and external brand SVGs, such as the NavUS favicon, NUSMods logo, and social icons. Brand assets are not interchangeable with functional UI icons and should not be added to the Lucide wrapper module.
