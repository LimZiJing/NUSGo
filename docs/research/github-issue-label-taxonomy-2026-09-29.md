# NavUS GitHub issue and label review

Date: 2026-09-29
Repository: [LimZiJing/NavUS](https://github.com/LimZiJing/NavUS)
Scope: open GitHub issues, repository labels, issue bodies, comments, assignees, and milestones. The 12 open issues were relabeled; no issue bodies, comments, assignments, milestones, or pull requests were changed.

## Executive summary

The current labels should be standardized. The repository mixed GitHub defaults (`enhancement`, `bug`, `accessibility`), unprefixed workflow and area labels (`ready-for-agent`, `needs-triage`, `mobile`), and the project-specific `wayfinder:*` family. This made it hard to distinguish issue kind, product area, and workflow state. The 12 open issues have now been migrated to the prefixed scheme; the old labels remain configured in GitHub until saved searches and automation are checked.

The most important corrections are:

- Replace `enhancement`, `bug`, and `wayfinder:task` with a consistent `type:*` family.
- Replace `ready-for-agent`, `needs-triage`, and future workflow labels with a `status:*` family.
- Replace `mobile` with `area:mobile`; keep area labels separate from issue type and workflow state.
- Mark issues with explicit `Blocked by` dependencies as `status:blocked`, not `status:ready-agent`.
- Treat #87 as a parent coordination issue and #139 as an in-progress correctness issue; their current `bug`/`needs-triage` combinations are misleading.
- Add milestones or an equivalent planning mechanism later. All 12 open issues currently have no milestone, and only #151 has an assignee.

The canonical label vocabulary and cardinality rules are maintained in [`docs/agents/triage-labels.md`](../agents/triage-labels.md). This report records the evidence and migration decisions rather than maintaining a second copy of that policy.

## Current snapshot

The live repository label list is available at the [GitHub labels page](https://github.com/LimZiJing/NavUS/labels), and the issue set is visible in the [open issues view](https://github.com/LimZiJing/NavUS/issues?q=is%3Aissue%20is%3Aopen).

- 12 open issues were returned.
- 17 labels exist: 10 standard GitHub labels, 5 `wayfinder:*`/workflow labels, `mobile`, and `needs-triage`.
- `enhancement` appears on 7 open issues; `ready-for-agent` on 7; `mobile` on 6; `bug` on 2; `wayfinder:task` on 4; and `needs-triage` on 2.
- 11 of 12 open issues are unassigned.
- All 12 open issues have no milestone.
- Four open issues have comments. The comments provide material status context for #139, #87, #103, and #18.

The repository guidance documents the prefixed taxonomy in [`docs/agents/triage-labels.md`](../agents/triage-labels.md). The GitHub workflow guidance in [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) directs Codex to use the authenticated GitHub integration for API actions. That standard has been applied to all 12 open issues.

## Proposed prefixed taxonomy

Use the canonical labels in [`docs/agents/triage-labels.md`](../agents/triage-labels.md). The migration below records how the previous labels map to that standard.

### Migration map

| Current label | Proposed replacement | Notes |
|---|---|---|
| `bug` | `type:bug` | Preserve the issue kind, but put it in the `type:` namespace. |
| `enhancement` | `type:feature` | Use `type:task` instead when the issue is primarily testing, release, infrastructure, or coordination work. |
| `wayfinder:task` | `type:task` | The current label is meaningful to the agent workflow but is not self-explanatory as a NavUS issue type. |
| `wayfinder:research` | `type:research` | Retain the meaning without coupling labels to the Wayfinder skill name. |
| `wayfinder:prototype` | `type:feature` or `type:research` | Choose `type:feature` when implementation is intended; choose `type:research` when the output is investigation or a decision. |
| `wayfinder:grilling` | `type:research` or `status:triage` | Use `type:research` for a decision investigation; use `status:triage` when no issue kind has been decided. |
| `wayfinder:map` | No direct replacement; use `type:epic` plus relevant `area:*` | A map is a coordination container, not an issue kind. Prefer native parent/sub-issue relationships when available. |
| `ready-for-agent` | `status:ready-agent` | Same operational meaning, now namespaced. |
| `needs-triage` | `status:triage` | Same operational meaning, now namespaced. |
| `mobile` | `area:mobile` | Area labels should be namespaced and should not imply readiness. |
| `accessibility` | `quality:accessibility` | Quality concern, not issue type. |
| `wontfix`, `duplicate`, `invalid` | `status:wontfix`, `status:duplicate`, `status:invalid` | Apply only when that disposition is actually decided. |

Do not create prefixed duplicates while old labels remain in active use indefinitely. A migration should create the replacement labels, relabel open issues, update [`docs/agents/triage-labels.md`](../agents/triage-labels.md), then retire the old labels after checking saved searches and automation.

## Per-issue recommendations

These are the labels now applied to the open issues. `status:blocked` is used where an unresolved dependency prevents useful work. `status:ready-agent` means the issue is specified and has no stated blocker; it does not mean it is currently assigned.

| Issue | Current labels | Recommended labels | Reason |
|---|---|---|---|
| [#157](https://github.com/LimZiJing/NavUS/issues/157) Share Explore, Stops, and Plan between mobile sheets and desktop side column | `enhancement`, `ready-for-agent` | `type:feature`, `status:ready-agent`, `area:responsive` | Cross-breakpoint shared presentation; no explicit blocker. |
| [#151](https://github.com/LimZiJing/NavUS/issues/151) Restyle the mobile Explore / Stops / Plan navigation | `enhancement`, `ready-for-agent`, `mobile` | `type:feature`, `status:ready-agent`, `area:mobile`, `quality:accessibility` | Mobile presentation work with explicit selected-state, focus, and target-size requirements; assigned to `ewonglh`. |
| [#139](https://github.com/LimZiJing/NavUS/issues/139) Fix remaining Journey planner correctness after edge-case routing work | `bug`, `wayfinder:task`, `needs-triage` | `type:bug`, `status:in-progress`, `area:journey`, `area:live-data`, `quality:regression` | The body describes correctness failures, and the comment records implementation and passing checks. `status:triage` is stale. |
| [#138](https://github.com/LimZiJing/NavUS/issues/138) Compact mobile Stops controls and content | `enhancement`, `ready-for-agent`, `mobile` | `type:feature`, `status:blocked`, `area:mobile`, `area:stops` | Explicitly blocked by #135. |
| [#137](https://github.com/LimZiJing/NavUS/issues/137) Compact mobile Plan controls and journey content | `enhancement`, `ready-for-agent`, `mobile` | `type:feature`, `status:blocked`, `area:mobile`, `area:plan` | Explicitly blocked by #135. |
| [#136](https://github.com/LimZiJing/NavUS/issues/136) Compact mobile Explore controls and content | `enhancement`, `ready-for-agent`, `mobile` | `type:feature`, `status:blocked`, `area:mobile`, `area:explore` | Explicitly blocked by #135. |
| [#135](https://github.com/LimZiJing/NavUS/issues/135) Add three mobile sheet states for map and search flows | `enhancement`, `ready-for-agent`, `mobile` | `type:feature`, `status:ready-agent`, `area:mobile`, `area:responsive` | Its listed blockers #119 and #120 are both closed as completed, so the current `ready-for-agent` label is appropriate. |
| [#103](https://github.com/LimZiJing/NavUS/issues/103) Add complete shuttle timing regression and release checks | `wayfinder:task` | `type:task`, `status:blocked`, `area:release`, `area:journey`, `quality:verification` | Testing/release evidence rather than a feature; its body names several prerequisite issues and the comment adds #139 regressions. |
| [#102](https://github.com/LimZiJing/NavUS/issues/102) Verify live shuttle data and release boundary | `wayfinder:task` | `type:task`, `status:blocked`, `area:live-data`, `area:release` | Release-gate and infrastructure verification work with explicit dependencies. |
| [#87](https://github.com/LimZiJing/NavUS/issues/87) Parent: shuttle timing reliability and transfer estimates | `bug`, `needs-triage` | `type:epic`, `status:in-progress`, `area:live-data`, `area:journey` | The body explicitly assigns implementation to child issues, and the comment confirms it is a parent coordination issue. `type:bug` and `status:triage` obscure that role. |
| [#23](https://github.com/LimZiJing/NavUS/issues/23) Provision a private live-data test environment | `wayfinder:task` | `type:task`, `status:ready-agent`, `area:live-data`, `area:infrastructure` | Environment setup with a #25 dependency that is now closed, plus secret-handling constraints. |
| [#18](https://github.com/LimZiJing/NavUS/issues/18) Complete shuttle-stop contextual flow | `enhancement`, `ready-for-agent`, `mobile` | `type:feature`, `status:ready-agent`, `area:stops`, `area:responsive`, `quality:accessibility` | The body covers shared desktop/mobile contextual behavior, not mobile alone; it has no current blocker and includes keyboard/focus acceptance criteria. |

## Recommended operating rules

1. Use the canonical rules in [`docs/agents/triage-labels.md`](../agents/triage-labels.md).
2. Keep parent coordination issues as `type:epic`; do not label them `type:bug` merely because the workstream originated from a bug report. #87 is the current example.
3. Add milestones for release slices or use a maintained project view. Labels should describe the issue, not replace scheduling metadata.
4. Update saved searches or automation that filter on the old labels before retiring those old repository labels.

## Evidence and limitations

The findings are based on the live GitHub label list, the 12 open issue records, the issue bodies, and comments on #139, #103, #87, and #18, read on 2026-09-29. Referenced dependency states were also checked: #119, #120, #89, #25, #101, #104, and #66 are closed as completed; #135, #23, #102, #103, and #139 remain open. The 12 open issues were relabeled through the authenticated GitHub integration; no issue bodies, comments, assignments, milestones, or pull requests were changed. Priority values, label colors, and whether to use native GitHub issue types or parent/sub-issue relationships remain separate maintainer decisions.
