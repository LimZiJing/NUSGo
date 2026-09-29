# Issue Labels

NavUS uses lowercase, colon-delimited GitHub labels. GitHub labels are flat; the prefix is a naming convention, not a nested hierarchy. Use `:` consistently rather than mixing it with `/` or unprefixed names.

Every open issue MUST have exactly one `type:*` label, exactly one `status:*` label, and one or more useful `area:*` labels. `quality:*` and `priority:*` labels are optional.

## Type labels

| Label | Meaning |
|---|---|
| `type:bug` | Existing behavior is incorrect or broken |
| `type:feature` | User-facing capability or presentation change |
| `type:task` | Implementation, infrastructure, testing, or release work |
| `type:epic` | Parent or coordination issue with child work |
| `type:research` | Investigation or contract validation |
| `type:docs` | Documentation-only change |

## Status labels

Use exactly one status label on every open issue.

| Label | Meaning |
|---|---|
| `status:triage` | Maintainer still needs to evaluate the issue |
| `status:needs-info` | Waiting for information from the reporter or stakeholder |
| `status:ready-agent` | Fully specified and ready for an agent; no unresolved blocker |
| `status:ready-human` | Requires human implementation or decision |
| `status:blocked` | An unresolved dependency prevents useful work |
| `status:in-progress` | Active implementation or investigation is evidenced by ownership, a branch, commits, or an issue update |
| `status:wontfix` | The issue will not be actioned |
| `status:duplicate` | The issue is covered by another issue |
| `status:invalid` | The issue is not actionable or does not belong in this repository |

`status:wontfix`, `status:duplicate`, and `status:invalid` are normally terminal dispositions and may be used when closing an issue.

## Area labels

Use one or more areas, but keep the set small and meaningful.

| Label | Meaning |
|---|---|
| `area:ui` | Shared presentation, controls, interaction, or accessibility |
| `area:mobile` | Mobile-specific behavior or layout |
| `area:desktop` | Desktop-specific behavior or layout |
| `area:responsive` | Behavior spanning viewport layouts or breakpoints |
| `area:explore` | Venue search, venue details, or route browsing |
| `area:stops` | Shuttle-stop browsing and stop details |
| `area:plan` | Trip endpoints and Recommended Journey presentation |
| `area:map` | Map rendering, markers, route lines, or camera behavior |
| `area:journey` | Journey planning, ranking, or leg construction |
| `area:transit-data` | Canonical routes, stops, services, or geometry data |
| `area:live-data` | Live shuttle arrivals, timing, or provider data |
| `area:infrastructure` | Servers, environments, credentials, or external boundaries |
| `area:release` | Release gates, deployment, or release evidence |

UI belongs under `area:ui`; it is not a `type:*` label. Add `area:mobile`, `area:desktop`, or `area:responsive` when the viewport scope matters.

## Optional quality and priority labels

Use these only when they materially affect the issue:

- `quality:accessibility`
- `quality:regression`
- `quality:verification`
- `priority:critical`, `priority:high`, `priority:normal`, or `priority:low` — use at most one

Do not infer priority from age, issue number, or author. Add it only after maintainer agreement.

## Triage rules

- Do not use the old unprefixed labels (`bug`, `enhancement`, `mobile`, `needs-triage`, or `ready-for-agent`) on new issues.
- Do not use `wayfinder:*` labels for new issues. Use the `type:*`, `status:*`, and `area:*` namespaces instead.
- When an issue says `Blocked by`, confirm the dependency is unresolved before using `status:blocked`. Remove the blocked status when the dependency is complete or waived.
- Use native GitHub parent/sub-issue and dependency relationships where available; do not create labels that merely say `parent` or `child`.
- Keep labels orthogonal: type describes what the issue is, status describes workflow state, and area describes where the work belongs.
- Before deleting legacy labels, update any saved searches or automation that still filters on them.
