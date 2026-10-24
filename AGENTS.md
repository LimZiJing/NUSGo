# NUSGo Agent Guide

## Read before work

Before exploring or changing the repository, read the relevant repository guidance:

1. `CONTEXT.md` for the domain and product glossary and canonical terminology.
2. `docs/project-status.md` when the product, stack, current implementation, limitations, or roadmap matters.
3. `docs/agents/domain.md` for the single-context layout and ADR guidance; read relevant ADRs under `docs/adr/` when that directory exists.
4. `docs/agents/architecture.md` for target module ownership and dependency direction.
5. `docs/agents/coding-standards.md` for engineering, verification, and handoff rules.
6. `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` for GitHub issue workflow and labels.
7. `docs/agents/workflow.md` for the standard Codex task lifecycle and efficiency guardrails.
8. `docs/agents/task-template.md` for the reusable task kickoff prompt.

Keep the document responsibilities distinct: `CONTEXT.md` owns stable domain and product vocabulary, `docs/project-status.md` owns changing implementation status, and this file owns agent behavior.

Use `docs/agents/workflow.md` for the collaboration lifecycle and `docs/agents/task-template.md` for task kickoff structure; keep their guidance linked rather than duplicated here.

Task-specific user instructions take precedence over this guidance. If two repository documents conflict, use the authority described in the coding standards and call out the conflict in the handoff.

## Mandatory repository rules

- Inspect repository status before editing and preserve unrelated user changes.
- Keep the shared checkout on local `main`. Unless the user explicitly requests otherwise, create a fresh managed worktree from local `main` for each ticket and implement it on one direct, descriptive branch there; do not use a `codex/` prefix or reuse a worktree from another ticket.
- After a ticket's pull request is accepted and merged, archive or remove its worktree, then run `git worktree prune` to clear stale metadata. Do not clean up worktrees for active tasks or open pull requests.
- Use Conventional Commits. Do not create WIP, fixup, temporary, or checkpoint commits, and do not amend or rewrite a commit after reporting it.
- Do not commit node_modules, dist, generated caches, temporary files, secrets, .env files, credentials, or machine-specific output.
- Do not add a dependency unless the current requirement needs it and existing capabilities are insufficient.
- Keep external data validated at its boundary and preserve the project’s canonical sources of truth.
- Run and report the exact results of `npm test`, `npm run lint`, `npm run build`, and `git diff --check` when available and applicable. UI or map changes SHOULD include targeted local-browser smoke testing for affected behavior. Full responsive and keyboard testing is required only when those behaviors change materially or before a release. If browser testing is unavailable, document what was not verified and why.
- Do not push, force-push, open a pull request, or make other external changes unless the task explicitly authorizes it.

## GitHub issue workflow

Issues and specs live in GitHub Issues, and pull requests are not a request surface for this repository. In Codex, use the authenticated GitHub integration for GitHub API and pull-request actions. Use `gh` CLI only when the session is authenticated and a local CLI operation is appropriate. Follow `docs/agents/issue-tracker.md` for the exact commands and conventions.

Use the configured triage vocabulary in `docs/agents/triage-labels.md` when triaging issues.

## Repository-local skills

The selected Matt Pocock skills are installed under `.agents/skills/` and pinned in `skills-lock.json`. Treat them as reusable guidance, not application dependencies.

- Use `/setup-matt-pocock-skills` only when repository skill configuration needs to be checked or changed.
- Use `/grill-with-docs` to clarify a feature and record domain decisions.
- Use `/to-spec` to turn an agreed conversation into a GitHub issue/spec.
- Use `/to-tickets` to break a spec into dependent implementation tickets.
- Use `/implement` to execute a spec or ticket set.
- Use `/tdd` for test-first feature work or fixes.
- Use `/code-review` before committing substantial changes.
- Use `/codebase-design` when designing or deepening module boundaries.
- Use `/domain-modeling` when changing the domain glossary or recording an ADR.
- Use `/research` when investigating a question against primary sources and capturing findings in the repository.
- Use `/diagnosing-bugs` for difficult bugs or regressions.

Skills are reusable guidance, not application dependencies. Review their instructions and keep user intent and this file's repository rules authoritative.
