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

## Agent skills

- Issue tracker: docs/agents/issue-tracker.md
- Triage labels: docs/agents/triage-labels.md
- Domain guidance: docs/agents/domain.md
