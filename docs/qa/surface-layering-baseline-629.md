# Surface layering baseline (#629)

Baseline capture for [issue #629](https://github.com/LimZiJing/NUSGo/issues/629) "Evaluate visible layering between light and dark theme surfaces". This records the **before** state only. It does not change application behaviour, and it does not choose the new token values.

## Run

- Application revision `8d0e242d` (local `main`), worktree `t3-06c72209`.
- Local Vite development server from `npm run servers:start` at `http://127.0.0.1:22188/`.
- Headless Chromium 1254 (`playwright` 1.65.0) at 1440 × 900, device pixel ratio 1, `prefers-reduced-motion: reduce`.
- Each of the 25 captures used a fresh browser context with `navus:theme-preference:v1` seeded before navigation, so every theme used the real `data-theme` mechanism rather than a page-level override. The applied `data-theme` was asserted before each screenshot; all 25 matched the requested theme.
- Zero page errors across all 25 runs. The backend was running, so Stops showed live arrival rows.

## Captures

`docs/qa/screenshots/issue-629-baseline/<theme>-<view>.jpg`, 1440 × 900, JPEG quality 80.

| View | What is in frame |
|---|---|
| `explore` | Explore panel in its empty search state beside the full map |
| `stops` | Stops list with live arrival rows, several cards expanded |
| `plan` | Plan panel in its empty trip state beside the full map |
| `more` | More landing view with its destination rows |
| `map` | The `.map-shell` element only, at 1438 × 900 |

Themes: `light`, `dark`, `nus`, `matcha`, `sakura`. That is 5 themes × 5 views = 25 images, 5.7 MB total.

## Measured token contrast

Ratios computed from `frontend/src/ui/styles/shared/themes/*.css`. WCAG contrast is the conventional measure here, but these are **non-text** surface-to-surface comparisons, so the 3:1 and 4.5:1 thresholds do not apply to them. They are recorded only to make the differences comparable.

| Theme | `--surface` | `--surface-raised` | `--surface-card` | raised/surface | card/surface | raised/card | border-subtle/card |
|---|---|---|---|---|---|---|---|
| light | `#fff` | `#fff` | `#f7f8fb` | 1.00 | 1.06 | 1.06 | 1.16 |
| dark | `#16171d` | `#1f2028` | `#272934` | 1.10 | 1.24 | 1.12 | 1.06 |
| nus | `#fff3e7` | `#fffaf4` | `#fbefe1` | 1.05 | 1.04 | 1.09 | 1.15 |
| matcha | `#e1e7d6` | `#f0f2e7` | `#e0e6d6` | 1.12 | 1.01 | 1.13 | 1.12 |
| sakura | `#e9d4db` | `#f4e7eb` | `#ead8df` | 1.17 | 1.03 | 1.14 | 1.14 |

The issue's two headline findings are confirmed:

- Light has `raised` at exactly `1.00` against `surface` — identical `#fff`. Every raised surface is separated from the page only by its border and shadow.
- Dark has `raised` at `1.10` against `surface`.

Two findings the issue did not record:

- In matcha and sakura, **`card` loses to `surface`** at 1.01 and 1.03, while `raised` wins at 1.12 and 1.17. Card and raised layers therefore sit on opposite sides of the page surface, not above it in one direction.
- Dark `--border-subtle` is the weakest of the five at 1.06 against the card. That is the same token #623 reports for departure dividers, so #629 and #623 should be evaluated together.

## Proposal arithmetic (for the maintainer's decision)

Evaluated from the proposed values in #629, so the visual trade-offs are visible before anything is changed:

| Proposal | ratio |
|---|---|
| light `raised #fff` / `surface #f1f5f9` | 1.10 |
| light `card #f7f8fb` / `surface #f1f5f9` | 1.03 |
| dark `raised #1c1d25` / `surface #16171d` | 1.07 |
| dark `card #2a2c37` / `surface #16171d` | 1.29 |
| dark `raised #1c1d25` / `card #2a2c37` | 1.21 |
| dark border `#24252b` / card `#2a2c37` | 1.10 |
| dark border `#363944` / card `#2a2c37` | 1.21 |
| dark border `#3a3d4a` / card `#2a2c37` | 1.29 |

Two things to decide before choosing values:

1. The light proposal raises `raised/surface` from 1.00 to 1.10 but leaves `card/surface` at 1.03, so cards would remain nearly flush with the page while raised surfaces step forward. If cards are meant to read as layers, `--surface-card` needs its own value.
2. The dark proposal moves `raised` closer to `surface` (1.10 → 1.07) for a stronger `card/surface` step (1.24 → 1.29). That is a real trade, not a uniform gain, and it is the part most worth confirming against the screenshots.

## Not verified

- Mobile and tablet viewports. The issue scopes this to desktop surface layering, but a chosen value affects the mobile sheets.
- Physical display gamma, hardware colour profile, and OS-level night-light shifts. Contrast was computed from token values, not sampled from rendered pixels.
- Hover, pressed, focus, and selected control surfaces. Those belong to #617, which also changes surface tokens.
- The map basemap itself. Basemap colours come from `basemap-theme.ts` palettes, not these tokens, so the map images show only how map-adjacent chrome reads against them.

## Reproducing

The capture script is not committed. It drove Playwright against the running development server, sealed the theme preference in `localStorage` with an init script, asserted `data-theme`, clicked the `Explore`, `Stops`, `Plan`, and `More` buttons by accessible name, and wrote JPEGs at quality 80. Re-run it against a later revision to produce the matching **after** set.
