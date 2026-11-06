# Surface layering baseline (#629)

Evidence record for [issue #629](https://github.com/LimZiJing/NUSGo/issues/629) "Evaluate visible layering between light and dark theme surfaces". It starts from the **before** capture and measurement, then records the settled token values and the matching **after** capture. Only theme tokens, the backgrounds of the navigation column, mobile sheets and mobile tab bar, and the fills of five waypoint-list controls changed; no application behaviour changed.

## Run

- Application revision `8d0e242d` (local `main`) for the before capture; `d1629e66` for the after capture (see "After captures"). Worktree `t3-06c72209`.
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

## Settled values

The page surface has to be painted by something for any of this to be visible. The desktop navigation column, its scroll container, the mobile sheets and the mobile tab-bar backdrop now paint `--surface` instead of `--surface-raised`, so the page layer is the recessed one and cards sit above it.

| Theme | Token | Before | After | Card on column |
|---|---|---|---|---|
| light | `--surface` | `#fff` | `#f1f5f9` | 1.10 |
| light | `--surface-card` | `#f7f8fb` | `#fff` | 1.10 |
| light | `--surface-subtle` | `#f1f5f9` | `#e4eaf1` | — |
| light | `--surface-faint` | `#f7f8fb` | `#fafbfd` | 1.06 |
| light | `--surface-segmented-control` | `#e8eef5` | `#dfe5ee` | 1.16 on the column |
| light | `--control-border` | 50% mix | 55% mix | 3.41 |
| dark | `--surface-card` | `#272934` | `#2a2c37` | 1.29 |
| dark | `--control-border` | 35% mix | 45% mix | 3.24 on the card |
| nus | `--surface-card` | `#fbefe1` | `#fffaf4` | 1.05 |
| matcha | `--surface-card` | `#e0e6d6` | `#f0f2e7` | 1.12 |
| sakura | `--surface-card` | `#ead8df` | `#f4e7eb` | 1.17 |

Five waypoint-list controls (seven declarations) also moved from `--surface` to `--surface-card` so their fills stay distinct from the panel; see the regression note under "After captures".

Cards had to move with the column. Against the new column, the old card values land at 1.03 (nus), 1.01 (matcha) and 1.03 (sakura) — effectively invisible. In the three palettes `--surface-raised` was already the lightest layer, so aligning `--surface-card` to it keeps the on-screen card colour close to what it was and fixes the recessed-card anomaly recorded under "Measured token contrast" above.

Light `--surface-faint` also moved, `#f7f8fb` → `#fafbfd`. The old value was the old light `--surface-card`; against the new column it would have read as card-weight fill rather than a faint wash. `#fafbfd` sits 1.06 off the column, between `--surface-muted` (1.05) and `--surface-raised` (1.10), which is where a faint wash belongs.

Values left alone:

- **Dark `--surface-raised` stays `#1f2028`.** The #629 proposal moved it to `#1c1d25`, which lowers raised/surface from 1.10 to 1.07 — nearly the light-mode defect this issue fixes.
- **#623's dark `--border-subtle` stays `#24252b`.** It improves against the new card (1.06 → 1.10) but is still the weakest edge in the app. It belongs with #623.
- **Light `--surface-muted` keeps `#f8fafc`.** It was already within 1.05 of white, so moving the column changed it by less than its existing subtlety.

Consequences recorded for review:

- Light `--control-border` at 50% would have resolved to `#888f98` on `#f1f5f9` — **2.98:1**, failing the 3:1 check in `theme-tokens.test.ts`. That is why the mix fraction moved to 55%; see [controls.md](../ui/controls.md).
- The dark card change also pushed dark `--control-border` further below the 3:1 that WCAG 1.4.11 asks of a control boundary. At the 35% mix it sat **2.45:1** against the old card and **2.35:1** against the new one; the existing test only compared the border to `--surface`, where it measured 3.03, so nothing caught it. The mix is now 45%, reaching 3.24:1 on the card, 3.78 on `--surface-raised`, 4.18 on `--surface` and 3.06 on `--surface-control`. `theme-tokens.test.ts` now checks `--control-border` against `--surface-card` as well as `--surface`, and that new assertion fails on the old 35% value.
- Light `--surface-subtle` had to move because its old value was `#f1f5f9` — the new page surface. Leaving it would have made the hover/focus fill identical to the page.
- Light `--surface-segmented-control` had to move for the same reason: at `#e8eef5` the Find venue / Bus routes container sat 1.07 from the new column and disappeared into it. `#dfe5ee` restores 1.16 against the column and 1.27 for the selected pill.
- Dark `--surface-control` now sits 1.06 against the card (was 1.10), the same distance `--border-subtle` has. Not changed here.

## After captures

`docs/qa/screenshots/issue-629-after/<theme>-<view>.jpg`, same 25 views, viewport, themes and JPEG quality as the baseline set.

- **Gathered on commit `d1629e66`** — the working tree that became that commit, with the dark `--control-border` fix applied and nothing else changed — on 2026-11-06T11:22:15Z. Commits after it in this branch touch only this document and these images, so the captures represent the reviewed code.
- `measurements.json` in that directory records the computed value of the surface tokens each capture sampled, read from `getComputedStyle` at capture time. Plain hex tokens come back as written; `--control-border` comes back as its `color-mix()` expression, since a custom property computes to its specified value.

**What the captures show.** All five themes changed. Measured from the rendered pixels in the left panel:

| Theme / view | Backdrop before | Backdrop after | Card before | Card after |
|---|---|---|---|---|
| light / more | `#ffffff` | `#f1f4f9` | `#f7f8fc` | `#ffffff` |
| dark / more | `#202028` | `#16171c` | `#272935` | `#2a2c38` |
| light / stops | `#f7f8fc` | `#ffffff` | — | — |
| dark / stops | `#272935` | `#2a2c38` | — | — |

In light, the page and card colours have **swapped**: what used to be the backdrop is now the card, and vice versa. That is the intended inversion — the page recedes, cards come forward.

**Why the column had to change.** Before this change, light `--surface` was not painted anywhere. It was declared in `light.css` and consumed by `.more-panel-surface` (`more-panel.css:57`) and `body` (`tokens.css:63`), but a higher-precedence rule replaced the background on both. Verified by overriding `--surface` to `#ff0000`: **0.00%** of pixels changed in all four views at 1440 × 900 and 390 × 844, against **14.22%** for the same override on `--surface-card`. The control proves the method detects change, so the zero was a real absence. That is what the column, sheet and tab-bar changes fix.

Desktop and mobile were both re-checked after the change: mobile light sheet `rgb(241,245,249)` under `rgb(255,255,255)` cards (1.10), mobile dark sheet `rgb(22,23,29)` under `rgb(42,44,55)` cards (1.29).

**Regression found on the waypoints list.** `--surface` is also the fill on five controls in `personal-waypoints.css`, across seven declarations: the saved-list search field (`.personal-waypoint-list-search .search-field` and its `input`), the saved-list actions trigger (`.personal-waypoint-list-actions-trigger`), the category visibility trigger (`.personal-waypoint-visibility-trigger`), the category search field (`.personal-waypoint-category-search .search-field` and its `input`), and the selected-location row (`.personal-waypoint-selected-location`). They sit inside the navigation panel, so repointing the panel from `--surface-raised` to `--surface` made each control's fill identical to the panel behind it. Measured live with a seeded waypoint in all five themes: every one of them reported the same computed background as `.more-panel-surface`. Only the 1px `--border-card` edge remained, and that got weaker too — sakura fell to **1.077** border-to-panel.

All seven declarations now use `--surface-card`, which is what a form control on a page should sit on and what `.personal-waypoint-form input` alongside them already used. Field-fill-to-panel after the fix: light 1.096, dark 1.289, nus 1.052, matcha 1.118, sakura 1.173 — matching or beating the pre-change values in every theme.

This slipped through the 25-image set because it captures Explore, Stops, Plan and More only. Settings, Appearance, the waypoint add/saved flows and search results have no captures.

**Why this set was re-captured, and what that showed.** The set in this directory has been re-run twice, both times because the images no longer matched the code:

1. The first after-capture set was taken before the waypoints control fix landed.
2. The second was taken before the dark `--control-border` mix moved from 35% to 45%.

Re-running the same harness at `d1629e66` and diffing consecutive sets separates code differences from run-to-run noise:

- The navigation column — the region these changes actually repaint — is **pixel-identical** in Explore, Plan and More across all five themes (0.000% of pixels changed, max channel delta 2, i.e. JPEG rounding only). Neither the waypoint control fills nor the dark control border appear in these views, which is exactly why those fixes were missed by the capture set.
- Stops differs inside the column, by 2.9–4.4% between the first and second set and 0.5–0.8% between the second and third, because the arrival rows are live and tick between runs.
- The map area differs by up to 2.6% in light and about 0.25% in the other four themes. MapLibre drops and re-places labels depending on which ones fit, so label positions are not stable between runs; the contrast between light and dark here is how differently the basemap palettes trigger that collision handling, not a surface change.

Treat the surfaces as the thing these images record. Basemap label placement and live arrival times are not evidence.

## Not verified

- Mobile and tablet viewports for the **screenshot set** — the 25 captures are desktop only, as in the baseline. The mobile sheet and tab-bar surfaces were checked by reading computed styles from the running app at 390 × 844, not by capture.
- **Settings, Appearance, the waypoint add/saved flows and search results are not in the capture set.** This mattered: the waypoint list and the Appearance theme select both had defects that the 25 images could not show, and both were found by reading computed styles from the running app instead. Settings and Appearance were spot-checked by eye after the change and looked acceptable; the border measurement that caught the dark control border was a separate, numeric check. Other panels were not systematically re-checked, and a by-eye spot check should not be read as covering them.
- Physical display gamma, hardware colour profile, and OS-level night-light shifts. Contrast was computed from token values, not sampled from rendered pixels.
- Hover, pressed, focus, and selected control surfaces. Those belong to #617, which also changes surface tokens.
- The map basemap itself. Basemap colours come from `basemap-theme.ts` palettes, not these tokens, so the map images show only how map-adjacent chrome reads against them.

## Reproducing

The capture script is **not committed**. It drove headless Chromium against the running development server (`npm run servers:start`, `http://127.0.0.1:22188/`) at 1440 × 900 with `prefers-reduced-motion: reduce`, and it:

- sealed `navus:theme-preference:v1` in `localStorage` with an init script, so the real `data-theme` mechanism applied;
- waited for `.maplibregl-canvas` and 3 s of tile paint before the first capture;
- asserted the applied `data-theme` matched the requested theme before every screenshot;
- clicked the `Explore`, `Stops`, `Plan` and `More` buttons by accessible name, parked the pointer at the bottom-left corner of the viewport so no control sat in its hover state, and waited 700 ms for panel transitions;
- wrote JPEGs at quality 80 and recorded the computed surface tokens per capture in `measurements.json`.

`playwright` (1.65.0, browser build `chromium-1254`) is not declared in any `package.json`, so the script ran against a checkout that already had it installed ad hoc. It is not committed for that reason: adding a browser-capture tool means adding `playwright` and its browser download to a clean checkout, which is a dependency decision rather than something to slip in with a theme fix.

The committed JPEGs and `measurements.json` are the record of what the script produced. Token contrast figures in this document come from token values; the before/after backdrop and card colours in "After captures" were sampled from the rendered pixels.

Both capture sets were produced by the same script. The after set was re-run and replaced once, after the waypoints fix described above landed; the version in the repository is the later run.

Because the script is not committed, the images cannot be regenerated from this branch alone. If a later change touches any surface token or the background of the navigation column, the mobile sheets or the tab bar, these captures become stale and should be marked as such in the PR rather than assumed to still apply.
