# NavUS Agent Instructions

## Instruction scope

- Follow this file for repository-specific agent behavior.
- Treat explicit user instructions as higher priority than these guidelines.
- Preserve existing user changes; inspect `git status` before editing.

## Project context

Read `CONTEXT.md` before exploring or changing NavUS for the shared domain language. Read `docs/project-status.md` when current implementation details, limitations, or milestones matter.

Read the relevant files under `docs/agents/` for issue-tracker, domain-documentation, and triage conventions.

## Development workflow

- Keep `main` stable.
- Use a separate branch for each coherent feature or larger refactor.
- Do not use the `codex/` prefix for feature branches. Use names such as `venue-search`, `shuttle-route-layers`, or `live-arrivals`.
- Preserve unrelated work and do not reset, discard, or overwrite user changes.
- Commit coherent milestones with clear messages.
- Do not commit `node_modules`, `dist`, secrets, or local environment files.
- Do not install future dependencies until the feature requiring them is being implemented.
- Before committing, run `npm run lint` and `npm run build`.

## Architecture and routing principles

- MapLibre renders maps; it is not a routing engine.
- Do not implement A* or another routing algorithm from scratch unless existing options cannot support the required constraints.
- Prototype custom campus or indoor graphs with `ngraph.graph` and `ngraph.path` when a quick client-side routing prototype is appropriate.
- Evaluate a backend routing engine before committing to a permanent routing architecture.
- Model stairs, lifts, accessibility, shelter, indoor floors, and bus transfers as graph edges, costs, or routing profiles.

## GitHub issue workflow

Issues and specs live in GitHub Issues and should use the `gh` CLI. Follow `docs/agents/issue-tracker.md` for the exact commands and conventions.

Use the configured triage vocabulary in `docs/agents/triage-labels.md` when triaging issues.

## Repository-local skills

The selected Matt Pocock skills are installed under `.agents/skills/` and pinned in `skills-lock.json`.

- Use `/setup-matt-pocock-skills` only when repository skill configuration needs to be checked or changed.
- Use `/grill-with-docs` to clarify a feature and record domain decisions.
- Use `/to-spec` to turn an agreed conversation into a GitHub issue/spec.
- Use `/to-tickets` to break a spec into dependent implementation tickets.
- Use `/implement` to execute a spec or ticket set.
- Use `/tdd` for test-first feature work or fixes.
- Use `/code-review` before committing substantial changes.
- Use `/diagnosing-bugs` for difficult bugs or regressions.

Skills are reusable guidance, not application dependencies. Review their instructions and keep user intent and this file's repository rules authoritative.
