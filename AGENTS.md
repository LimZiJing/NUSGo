# NavUS Agent Guide

## Read before work

Read these documents before changing the repository:

1. PROJECT_CONTEXT.md for the product, stack, current implementation, and roadmap.
2. CONTEXT.md for the domain glossary.
3. docs/agents/coding-standards.md for engineering and handoff rules.
4. docs/agents/issue-tracker.md and docs/agents/triage-labels.md for GitHub issue workflow.

Task-specific user instructions take precedence over this guidance. If two repository documents conflict, use the authority described in the coding standards and call out the conflict in the handoff.

## Mandatory repository rules

- Inspect repository status before editing and preserve unrelated user changes.
- Keep main stable. Use one direct, descriptive branch per coherent feature or larger refactor; do not use a codex/ prefix.
- Do not commit node_modules, dist, generated caches, secrets, .env files, credentials, or machine-specific output.
- Do not add a dependency unless the current requirement needs it and existing capabilities are insufficient.
- Keep external data validated at its boundary and preserve the project’s canonical sources of truth.
- Run the applicable project checks before handoff and report their exact results.
- Do not push, force-push, open a pull request, or make other external changes unless the task explicitly authorizes it.

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
