# Rainroom theme effects: research note

## Recommendation

Keep the first redesign CSS- and SVG-led; no animation library is needed for a calm, decorative rain treatment. NUSGo already ships React and MapLibre, but no animation or particle library. The existing theme also uses CSS overlays around the map, which is a good fit for fixed, non-interactive ambience.

Build the mood as two distinct planes: rainy blue-gray for the map, and restrained wood warmth with a moss edge wash for navigation panels. Keep those warm/green hues on the panels so they do not blend into the blue map. Use dark blue surfaces for the main panel area, with wood and light limited to narrow edge details. This balance is a design interpretation of the supplied references, not a user-research finding.

## Effects and constraints

- **Rain and droplets:** author a few irregular SVG drop/rain patterns, then use CSS keyframes with varied delays and durations for gentle opacity changes and short, slow drift. A varied set of fixed cycles reads as intermittent rain without continuously creating JavaScript particles. Animate `opacity` and `transform`, which Chrome guidance identifies as compositor-friendly properties; profile before animating blur, shadows, or large painted regions. [Chrome: UI animation best practices](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/physics-based-easing)
- **Ripples:** use a small number of expanding SVG/CSS rings that fade out, rather than a full-screen wave distortion. Keep them slow, faint, and independent of map clicks so they do not imply a new map interaction.
- **Fog and greenery:** use a mostly static soft gradient or low-frequency SVG noise for fog. Keep the map blue-gray; place all leaf and wood cues on navigation sheets and panels only. In this design, use CSS color washes and seams as the primary nature cues; skip literal leaf artwork if it reads too photographic or distracts from sheet content.
- **Warm lights:** use a few static amber gradients at sheet corners or along the sheet seam, with at most a slow, low-amplitude opacity breathe. Keep the map, route, stop labels, selected states, and text free of light overlays.
- **Liquid-glass reference:** translate the idea into translucent panels with a restrained `backdrop-filter`, one fine highlight edge, and a grounding shadow. Apple places Liquid Glass in the functional layer for navigation and controls, recommends using it sparingly, and favors a more opaque material when text needs stronger legibility. Apply that guidance to NUSGo's floating navigation and map controls; keep dense content cards more solid. This is a web approximation inspired by the platform material, not Apple's native adaptive effect. [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Apple WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- **Fallbacks and accessibility:** give every translucent surface an opaque blue-charcoal background before `backdrop-filter`; MDN notes the effect needs a transparent or partially transparent foreground and may be unavailable on older devices or browsers. Under `prefers-reduced-motion: reduce`, stop continuous rain/ripple animation and show a static texture. [MDN: `backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter), [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion), [W3C: Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion)

## Library comparison

| Option | Useful when | Fit here |
|---|---|---|
| CSS keyframes + authored SVG | A handful of ambient loops, deterministic offsets, decorative ripple rings | **Recommended.** Smallest change; no new dependency or JS lifecycle. |
| Motion (`motion`) | React-driven sequences, SVG path animation, or state-linked choreography; it provides a declarative React API and timeline/stagger controls | Consider only if the design grows into coordinated transitions that CSS becomes awkward to maintain. [Motion for React](https://motion.dev/docs/react-motion-component), [Motion `animate()`](https://motion.dev/docs/animate) |
| GSAP | Complex, tightly controlled timelines or synchronized multi-part motion | Capable, but excessive for a few ambient loops. Its timeline, stagger, and match-media APIs are useful for richer choreography. [GSAP docs](https://gsap.com/docs/v3/) |
| tsParticles | A genuinely dense, continuously moving, canvas-based particle field with configurable counts and interactivity | Not recommended for the first pass. Its React setup adds a wrapper, engine, and feature bundle; the project docs also advise limiting particle count/FPS and identify performance as a concern. [tsParticles React guide](https://particles.js.org/guides/react), [tsParticles performance guidance](https://particles.js.org/guide/troubleshooting) |

No library reproduces Apple's native Liquid Glass material on the web; CSS blur and layered highlights can borrow its visual cues without claiming the same system behavior. Apple describes the native material as adaptive, responsive to content and interaction, and recommends reserving it for navigation rather than content-heavy surfaces. [Apple: Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)

## Greenery, wood, and café warmth on navigation surfaces

The user clarified that greenery and wood belong on navigation sheets and panels, not on the map. Keep the shared map treatment rainy blue-gray. The previous fern and woodgrain SVGs were attached to broad boxes with fixed-size image layers; their focal strokes were not tied to the sheet edge, so viewport changes and sheet crops could make them feel misplaced. This is a repository-specific reading of the previous CSS and assets, not a general rule against SVG. [`map.css`](../../frontend/src/ui/styles/shared/map.css)

| Treatment | How it anchors | Assessment |
|---|---|---|
| CSS edge wash and seam | Keep a solid panel base, then place a narrow moss-to-walnut wash or inset highlight on the panel's map-facing edge; clip it to the existing rounded box | **Best structural treatment.** It follows the actual sheet/panel dimensions without a standalone asset. CSS gradients are images painted in their element's image box; CSS background positioning and clipping keep the wash tied to the panel, including its rounded corners. [CSS Images 3: gradients](https://www.w3.org/TR/css-images-3/#gradients), [CSS Backgrounds 3: backgrounds and clipping](https://www.w3.org/TR/css-backgrounds-3/#background-clip) |
| Small organic raster side accent | One transparent PNG cutout of a leaf cluster or branch, placed once in a narrow edge strip on the sheet | **Optional, not used.** It can provide a more irregular silhouette than CSS, but the generated example felt too realistic for this interface. Use only if a more stylized asset is approved later. |
| Repeating fern/woodgrain art | Repeat or place a full decorative image over the panel/map field | **Avoid.** Repetition creates visible tile rhythm; a broad fixed-size illustration has no stable relationship to the panel edge as the sheet changes size or detent. Keep the raster single-use and edge-bound if retained. |

### Recommendation

Treat the map as the rainy window: retain its blue-gray look and keep all greenery off the map. Treat the navigation panel as the café interior: keep a solid deep-blue reading area, with a restrained moss edge wash and thin wood-toned seam. Keep the orange lamp glow low and localized; skip literal plant artwork for now. Do not lay translucent brown and green gradients across the blue map. Apple recommends stronger, more opaque materials where fine text needs legibility and using glass selectively for navigation, which supports keeping the panels' main reading area calm and substantial. [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

Attach the edge washes to the panel itself: the top edge of a mobile bottom sheet and the map-side edge of the desktop navigation panel. Let the same surrounding panel border/shadow establish the seam; do not position decoration against viewport or map-stage coordinates. Validate at desktop and mobile sizes and in each sheet detent, since the sheet's map-facing edge moves as its height changes.

## Suggested implementation order

1. Keep the map in rainy blue-gray; use a dark blue navigation surface with restrained moss and orange lamp accents.
2. Establish the panel's edge wash and wood-toned seam in CSS, tied to the panel box.
3. Remove repeating fern/woodgrain textures; add no literal plant asset unless a better-fitting illustration is selected later.
4. Add low-frequency CSS opacity/transform animation and sparse ripple rings; disable them for reduced-motion users.
5. Apply glass only to the floating navigation/control layer, with an opaque fallback and strong text contrast.
6. Compare at desktop and mobile sizes, including reduced motion and a browser without `backdrop-filter`; keep the existing layout and product behavior fixed.
