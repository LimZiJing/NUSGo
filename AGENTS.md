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

- Use `npm run servers:start` to start or reuse this worktree's managed development group; inspect `npm run servers:status` before starting additional services. Use `npm run servers:stop` when the group is no longer needed. Run temporary previews with `npm run servers:preview -- --port <port> -- node <check-script>` so owned processes are stopped when the check ends. Do not launch Vite or backend servers directly for agent work. See [managed local servers](docs/local-services.md#managed-worktree-servers).
- Inspect repository status before editing and preserve unrelated user changes.
- Keep the shared checkout on local `main`. Unless the user explicitly requests otherwise, create a fresh managed worktree from local `main` for each ticket and implement it on one direct, descriptive branch there; do not use a `codex/` prefix or reuse a worktree from another ticket.
- After a ticket's pull request is accepted and merged, archive or remove its worktree, then run `git worktree prune` to clear stale metadata. Do not clean up worktrees for active tasks or open pull requests.
- Use Conventional Commits. Do not create WIP, fixup, temporary, or checkpoint commits, and do not amend or rewrite a commit after reporting it.
- Do not commit node_modules, dist, generated caches, temporary files, secrets, .env files, credentials, or machine-specific output.
- Do not add a dependency unless the current requirement needs it and existing capabilities are insufficient.
- Keep external data validated at its boundary and preserve the project’s canonical sources of truth.
- Run and report the exact results of `npm test`, `npm run lint`, `npm run build`, and `git diff --check` when available and applicable. UI or map changes SHOULD include targeted local-browser smoke testing for affected behavior. Full responsive and keyboard testing is required only when those behaviors change materially or before a release. If browser testing is unavailable, document what was not verified and why.
- Before installing dependencies in a worktree, read `docs/agents/workflow.md` section 2.
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

## Astryx guidance scope

This project is a Vite/React app with NUSGo-owned controls and theme tokens. The generated Astryx block below is reference material for explicit Astryx evaluation tasks. Follow this guide, `docs/ui/controls.md`, and `docs/agents/coding-standards.md` for ordinary NUSGo implementation. Do not apply Astryx's template, layout, styling, or theme rules to existing screens unless a task specifically authorizes that migration.

<!-- ASTRYX:START -->
Astryx v0.7.16 · 174 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- THEMES: palettes and custom colors go through the theme, never :root overrides. To make or change a theme (colors, fonts, corners, spacing, a look from a picture), prefer the experimental theme editor over hand-written theme files: `astryx experimental theme editor new <name> --like neutral`, then `editor set <name> <thing> <value>` or `editor how "<what you want>"`; wire it with `astryx theme add <name>`; after each change look at it with `astryx experimental theme editor show <name> --png` and open the PNGs it writes (changes nothing in the app); a theme change is not done until you have looked at the pictures. In code, extend an imported theme to customize it; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
