# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. In Codex, use the authenticated GitHub integration for GitHub API and pull-request actions. Use the `gh` CLI when the session is authenticated and a local CLI operation is appropriate.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply the complete label set**: use the GitHub issue update operation with the full `type:*`, `status:*`, and `area:*` set. When using the CLI, `gh issue edit <number> --add-label "..."` is additive, so remove obsolete labels separately.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from the Git remote.

Follow [`triage-labels.md`](triage-labels.md) for the canonical prefixed label vocabulary. Do not add unprefixed or `wayfinder:*` labels to new issues.

## Pull requests as a triage surface

PRs as a request surface: no.
