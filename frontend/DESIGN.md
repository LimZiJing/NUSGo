---
name: NUSGo
description: Warm, approachable campus wayfinding for finding places and planning bus-and-walking journeys.
colors:
  light-accent: "#1d4ed8"
  dark-accent: "#60a5fa"
  nus-accent: "#bb4a00"
  nus-brand-blue: "#003d7c"
  nus-brand-orange: "#ef7c00"
  matcha-accent: "#3b6347"
  sakura-accent: "#963b56"
  rainroom-accent: "#f28a24"
  rainroom-lamplight: "#f28a24"
  rainroom-amber: "#e8b466"
  rainroom-slate: "#152a40"
  rainroom-wood: "#845638"
  rainroom-dark-oak: "#4a3427"
  rainroom-moss: "#586b50"
  rainroom-pine: "#5f7b59"
  rainroom-surface: "#0c1924"
  rainroom-surface-raised: "#122330"
  rainroom-surface-step: "#263a46"
typography:
  display:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "56px"
    fontWeight: 500
    letterSpacing: "-1.68px"
  display-compact:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "36px"
    fontWeight: 500
    letterSpacing: "-1.68px"
  headline:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: "118%"
    letterSpacing: "-0.24px"
  headline-compact:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "118%"
    letterSpacing: "-0.24px"
  body:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "145%"
    letterSpacing: "0.18px"
  body-compact:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "145%"
    letterSpacing: "0.18px"
  control:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "1.2"
  control-large:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "1.2"
  chip:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "1"
  label:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.3"
  navigation:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.2"
  navigation-selected:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "1.2"
rounded:
  sm: "4px"
  status: "5px"
  panel: "6px"
  md: "8px"
  control: "10px"
  card: "10px"
  lg: "12px"
  timeline: "14px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
components:
  button-primary:
    backgroundColor: "var(--accent)"
    textColor: "var(--text-inverse)"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "36px"
  button-primary-large:
    backgroundColor: "var(--accent)"
    textColor: "var(--text-inverse)"
    typography: "{typography.control-large}"
    rounded: "{rounded.lg}"
    padding: "4px 12px"
    height: "44px"
  button-secondary:
    backgroundColor: "var(--surface-control)"
    textColor: "var(--text-primary)"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "var(--accent)"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "36px"
  search-field:
    backgroundColor: "var(--surface-raised)"
    textColor: "var(--text-primary)"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "8px 46px 8px 40px"
    height: "36px"
  chip-selected:
    backgroundColor: "var(--accent)"
    textColor: "var(--text-inverse)"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  status-pill-success:
    backgroundColor: "var(--status-success-surface)"
    textColor: "var(--status-success)"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  navigation-selected:
    backgroundColor: "var(--accent-soft)"
    textColor: "var(--text-contrast)"
    typography: "{typography.navigation-selected}"
    rounded: "{rounded.pill}"
    height: "44px"
  stop-card:
    backgroundColor: "var(--surface-card)"
    textColor: "var(--text-strong)"
    rounded: "{rounded.card}"
    padding: "0"
---

# Design System: NUSGo

## Overview

**Creative North Star: "The Quiet Wayfinder"**

NUSGo is warm, approachable, and grounded in the campus it helps people navigate. The shared map remains the main spatial reference; Explore, Stops, and Plan place focused workflows over it so people can keep their bearings while searching, checking arrivals, or planning a trip. Familiar system typography, soft tonal surfaces, and rounded controls make the interface welcoming without taking attention away from places and routes.

The same control and status language carries across Light, Dark, NUS, Matcha, Sakura, and Rainroom. Soft shadows give panels and floating controls structural separation from the map. Official route colors appear in route-specific contexts; the wider network stays neutral.

**Key Characteristics:**
- The map carries campus geography while panels carry the current workflow.
- Theme-aware surfaces and accents preserve the same control language across all six palettes.
- Rounded controls and softly separated cards keep dense transit information approachable.
- Route color stays contextual to the selected route.

## Colors

The interface offers six named themes that share semantic accent, surface, text, border, and status roles. System preference resolves to Light or Dark. The frontmatter records the theme accent values; shared components use semantic CSS variables so the selected theme remains in control. Rainroom uses deep slate-blue surfaces for a gloomy blue-hour mood. Lamplight orange is the primary color for actions, focus, and selected controls. Amber and walnut form the two-layer wood-toned navigation selection, framed by a 2px dark-oak rim; lamplight supplies the orange edge glow. Workflow sheets stay cool slate-blue, moss remains in small status accents, and pine adds one short accent at the panel seam. Rain streaks keep their slow falling motion while droplet highlights fade in place; reduced-motion settings keep the atmosphere still. Avoid tiled botanical or woodgrain illustrations. Glass-like blur stays on floating navigation and controls, and decorative motion respects reduced-motion preferences.

### Primary
The Light and Dark themes use blue accents. NUS uses an orange accent with a blue-and-orange palette; Matcha uses green; Sakura uses rose. Rainroom uses lamplight orange for primary actions, focus, and selected generic chips.

### Secondary
Rainroom pairs amber and walnut on the selected navigation pill and panel seams. Official bus-route colors remain separate from the theme palette and appear on the selected route.

### Neutral
Surfaces, text, control borders, and dividers shift with the selected theme. Keep these roles semantic with the existing surface, text, and border variables rather than hard-coding a single palette into shared components.

### Named Rules
**The Theme Role Rule.** Shared controls use semantic color roles; the selected theme supplies their values.

## Typography

- **Display Font:** system-ui, Segoe UI, Roboto, sans-serif
- **Body Font:** system-ui, Segoe UI, Roboto, sans-serif
- **Label/Mono Font:** No separate mono family.

**Character:** A familiar system sans keeps place names and arrival information direct and easy to scan. The same family serves headings and controls, with weight and scale creating hierarchy.

### Hierarchy
- **Display:** Main application headings; the compact variant applies at narrower widths.
- **Headline:** Section headings and view titles, with a compact variant for smaller screens.
- **Body:** Explanatory and supporting copy.
- **Control:** Button, input, and menu labels.
- **Label:** Compact status and secondary labels.

## Layout

The desktop map fills the page beside a persistent left navigation column. The column is 360px wide from 769px upward and holds the Explore, Stops, and Plan navigation above the active workflow panel.

At 768px and below, the shared map remains behind a bottom navigation pill and movable workflow sheets. Sheets use collapsed, partial, and full positions; the full position remains above the tab bar so navigation stays available. The map’s visible area and controls account for the active sheet, safe areas, and attribution. Content scrolls within the active panel.

Use the 4px spacing rhythm from the frontmatter. Keep related controls grouped, and allow long stop, venue, and route content to scroll without covering the map controls.

## Elevation & Depth

Depth is soft and structural. The desktop navigation column, bottom tab pill, floating lists, and mobile sheets use theme-aware shadows to separate them from the map. Stop cards use a fine border with a low shadow; select menus use a stronger shadow and a translucent backdrop. Keep shadows tied to these boundaries rather than adding lift to every control.

**The Map Separation Rule.** Use elevation to clarify which surface sits above the map, while keeping routine controls visually quiet.

## Shapes

The form language uses small rounded corners for search fields, rounded rectangles for buttons and cards, and capsule shapes for chips, status pills, and navigation. The frontmatter radius scale is authoritative. Neutral control borders define unselected controls; selected states use the theme accent or a route-specific color where appropriate.

## Components

### Buttons
- **Primary:** The main action uses the theme accent and inverse text.
- **Secondary:** The everyday control uses a neutral control surface and a visible border.
- **Ghost:** Text-first actions stay unfilled at rest and receive a soft accent tint on hover and focus.
- **Icon buttons:** Keep a square target and a meaningful accessible name.
- **States:** Enabled controls have hover, active, and visible-focus states. Hover darkening applies only on devices that support hover; reduced-motion settings suppress transforms.

### Chips and Pills
- **Chips:** Selectable pills use a neutral bordered surface when unselected and an accent or route-color fill when selected.
- **Pills:** Non-interactive status labels use a muted neutral or semantic success/error treatment. A dot may reinforce a status, but text carries its meaning.
- **Segmented controls:** Use a tonal container with a raised selected option.

### Cards and Containers
Stop cards use the theme’s card surface, a fine border, and a low shadow. Keep card rows compact and align the location name, live status, favourite action, and disclosure control.

### Inputs and Fields
Search fields use a leading search icon, a themed surface, and a visible focus treatment. Keep the text flexible and reserve room for the clear action. Select menus float above surrounding content and follow the trigger as the page scrolls.

### Navigation
Explore, Stops, and Plan use a three-item icon-and-label navigation. The selected tab receives a soft accent surface and stronger text. Desktop navigation sits above the persistent workflow panel; mobile navigation is a centered pill along the lower edge.

### Mobile Sheet
Mobile sheets overlay the shared map and move between collapsed, partial, and full positions. Preserve independent state per tab, keep the bottom tab bar reachable, and allow the sheet content to scroll independently.

**The State Clarity Rule.** Selection and status remain clear in text and accessible state; color reinforces the meaning.

## Do's and Don'ts

### Do:
- **Do** use the semantic theme variables for shared surfaces, text, borders, accents, and status colors.
- **Do** reserve official route colors for route-specific display, especially the selected route.
- **Do** keep map attribution visible.
- **Do** expose selected states and status meaning through text or accessible semantics as well as color.
- **Do** preserve NUSGo’s independent identity and accurate source attribution.

### Don't:
- **Don't** hard-code one theme’s accent into shared controls.
- **Don't** color the full network with route colors when no route is selected.
- **Don't** rely on color alone to communicate selection or status.
- **Don't** imply that NUSGo is an official NUS service.
