# Settings bundle impact

Measured 2026-11-17 for the Settings Astryx slice in issue #687.

## Method

Each revision used `VITE_API_ORIGIN=https://api.nusgo.invalid npm run build` with the same installed toolchain (Vite 8.2.2). Totals sum all `.js` and `.css` files in `frontend/dist/assets`, including the MapLibre worker and Tooltip chunk. Gzip sizes use Node's `zlib.gzipSync`; `kB` is decimal (1,000 bytes).

| Build | Revision | JavaScript raw | JavaScript gzip | CSS raw | CSS gzip |
| --- | --- | ---: | ---: | ---: | ---: |
| Before Astryx pilot | `fcb27d0` | 2,629,462 B (2,629.46 kB) | 749,126 B (749.13 kB) | 274,835 B (274.84 kB) | 41,004 B (41.00 kB) |
| Current `main` | `4a5d803` | 2,815,126 B (2,815.13 kB) | 809,619 B (809.62 kB) | 555,412 B (555.41 kB) | 85,413 B (85.41 kB) |
| Settings working tree | based on `4a5d803` | 3,018,320 B (3,018.32 kB) | 874,060 B (874.06 kB) | 556,985 B (556.99 kB) | 85,662 B (85.66 kB) |

## Deltas

| Comparison | JavaScript raw | JavaScript gzip | CSS raw | CSS gzip | Total gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| Settings slice: current `main` → Settings | +203,194 B (+203.19 kB) | +64,441 B (+64.44 kB) | +1,573 B (+1.57 kB) | +249 B (+0.25 kB) | **+64.69 kB** |
| Cumulative: before Astryx pilot → Settings | +388,858 B (+388.86 kB) | +124,934 B (+124.93 kB) | +282,150 B (+282.15 kB) | +44,658 B (+44.66 kB) | **+169.59 kB** |

PR #683 recorded a +102.61 kB gzip pilot delta from matched pre-rebase builds. That report used Vite's app-entry JavaScript and CSS figures. The cumulative figures above rebuild the pre-pilot revision and current Settings tree with the same current toolchain, and include every emitted JavaScript asset; the current-main baseline measures the pilot at +104.90 kB gzip on this basis.

## Theme styling

The Settings scope maps Astryx control properties to existing NUSGo tokens in `.settings-content` (text, accent, surface, border, shadow, and radius). It does not change the theme palettes or add hard-coded theme colors. The bridge lets the same controls follow the active NUS, Matcha, Sakura, Light, Dark, or Rainroom palette.
