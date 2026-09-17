# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply labels**: `gh issue edit <number> --add-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from the Git remote.

## Pull requests as a triage surface

PRs as a request surface: no.
