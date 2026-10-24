# NUSGo Coding Standards

This is the canonical guide to engineering practices for NUSGo. AGENTS.md contains the startup rules and links here. CONTEXT.md owns domain and product terminology; this document owns implementation and collaboration practices.

Use MUST for safety, correctness, and required checks. Use SHOULD for judgment-based guidance. A justified exception is acceptable when the reason is recorded in the code, issue, or pull request.

## Before changing code

- MUST inspect repository status and preserve unrelated user changes.
- MUST read the relevant project context, domain glossary, issue, and local guidance before editing.
- MUST identify the smallest coherent user or technical outcome before choosing files, abstractions, or dependencies.
- MUST keep unrelated cleanup, formatting, and refactoring out of feature work.
- MUST use the project’s domain vocabulary: keep routes, stops, services, markers, venues, and route geometry distinct.

## Branches, commits, and pull requests

- MUST keep main stable and work on a direct, descriptive branch for each coherent change. Branch names MUST NOT use a codex/ prefix.
- MUST use Conventional Commits. Each commit SHOULD represent one coherent, buildable step with its tests or documentation where appropriate.
- Commit headers MUST stay concise: use the Conventional Commit type and scope followed by a short imperative summary. Put rationale and implementation context in the commit body instead of making the header long.
- Non-trivial code, test, documentation, or configuration commits MUST include a body separated from the header by a blank line. The body SHOULD explain the intent, the important scope or user-visible behavior, and the verification performed; mention meaningful limitations or follow-up work when relevant.
- Commit bodies SHOULD be brief and factual. They are a durable change record, not a transcript of the implementation process or a duplicate of the full pull-request description.
- MUST NOT create WIP, fixup, temporary, or checkpoint commits.
- MUST NOT amend or rewrite a commit after reporting it to another agent or reviewer. Do not force-push.
- MUST preserve unrelated commits and user changes. Do not use broad staging or destructive Git commands to clean a worktree.
- A pull request MUST tell one coherent story. Include the linked issue, user-visible summary, scope boundaries, commit summary, exact check results, manual verification steps for affected UI, useful screenshots for visual changes, known risks, and follow-up work.
- There is no universal hard line or file limit. As a warning signal, reconsider splitting work around 10 files or 400 changed lines, with reasonable exceptions for data, fixtures, generated output explicitly required by the feature, or necessary migrations.
- If review reveals a broader improvement, include it only when required for correctness, safety, or the stated scope. Otherwise record a follow-up issue.

## Required verification

- MUST run and report npm test, npm run lint, npm run build, and git diff --check when those checks are available and applicable to the change.
- Every commit described as buildable MUST pass the applicable checks at that point in history.
- If a named script is unavailable on the intended base, report that fact rather than silently substituting another command. Add the script only when the current feature requires it.
- Automated checks are required for applicable changes. UI and map changes SHOULD include targeted local-browser smoke testing for affected interactions. Full responsive, keyboard, and map smoke testing MUST be completed before a release or when those behaviors change materially. If browser testing is unavailable, document the unverified areas and the environment blocker.

## Comments and documentation

- Comments SHOULD explain why a choice exists, a non-obvious invariant, an external constraint, a security consideration, or a deliberately surprising behavior.
- Do not comment obvious syntax, restate a function name, or use comments to compensate for unclear names and structure. Prefer a better name or smaller function when that communicates the behavior.
- Comments about external data SHOULD identify the source or reason when that information matters for future maintenance.
- TODO and FIXME comments MUST represent real follow-up work, include enough context to explain the intended change, and reference a tracking issue when possible. Remove stale comments.
- MUST update the relevant documentation in the same PR when behavior, architecture, data provenance, public interfaces, or non-obvious constraints change. Do not duplicate one rule across several documents.

## Formatting and linting

- Follow the existing project style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline structures.
- Break long signatures, calls, object literals, and expressions where it improves scanning. Do not impose an arbitrary line-length rule that is not supported by project tooling.
- Preserve existing formatting when editing nearby code. Avoid repository-wide reformatting.
- Scoped eslint --fix MAY be used when helpful, but the resulting diff MUST be inspected and unrelated changes removed.
- ESLint and TypeScript configuration are authoritative. Do not add Prettier or another formatter without a concrete consistency problem and an intentional review of the toolchain change.

## Design principles

### SLAP

Functions SHOULD operate at one level of abstraction. Orchestration functions describe the workflow; helpers perform individual details. Keep validation, transformation, I/O, DOM work, and MapLibre effects at clear boundaries. Use early returns when they make guard conditions easier to follow, but do not split code into tiny helpers solely to reduce line count.

### DRY

Deduplicate repeated domain knowledge or behavior. Small coincidental repetition MAY remain when extracting it would create indirection, premature generality, or coupling between unrelated concerns. Keep logic near its consumer until it has stable meaning, multiple meaningful consumers, or a need for independent testing.

### KISS

Prefer the simplest explicit design that meets the requirement. Add abstractions, dependencies, configuration, fallback behavior, or cleverness only when they solve a demonstrated problem. Do not design speculative extension points at the expense of the current workflow.

## TypeScript and data boundaries

- Prefer strict type safety. Use unknown for untrusted external payloads, narrow values with validators or type guards, avoid any, and limit assertions to boundaries that have already been validated.
- The desired direction is compiler-wide strict mode, but migrating the existing compiler configuration is separate work unless the current task explicitly includes it.
- Keep one canonical source of truth for domain data. Update types, representative fixtures, validation, metadata, and provenance together when a schema or source changes.
- Validate external and static payloads before they reach rendering, routing, or other side effects.
- Do not duplicate route metadata, colors, stop membership, or geometry facts in UI code when the validated transit model already owns them.

## Side effects and lifecycle

- Pure transformations and validators MUST remain free of I/O and mutation.
- Network requests, DOM operations, MapLibre operations, and lifecycle effects MUST be explicit at application boundaries or focused helpers.
- React render functions MUST NOT perform imperative map or DOM work. Use state for UI state and refs for imperative objects.
- Every listener, map layer, source, marker, popup, timer, and asynchronous operation added by a component MUST have a corresponding cleanup or cancellation path.
- Expected aborts and user-facing failures SHOULD be handled deliberately. Unexpected errors MUST NOT be silently swallowed.

## Errors, security, and dependencies

- Invalid transit or other safety-sensitive data MUST fail closed rather than produce misleading partial output.
- Show user-safe status messages and retain useful diagnostic logging. Do not expose raw internal errors when a clearer product state is possible.
- Never commit secrets, tokens, credentials, .env files, or unnecessary personal data. Do not log sensitive values.
- Prefer safe text rendering for external values. Do not introduce HTML injection through unchecked data.
- Add a dependency only when the current requirement needs it, existing capabilities are insufficient, and bundle, maintenance, security, and testing costs are understood. Update the lockfile with the manifest and explain meaningful impact in the PR.
- Do not commit node_modules, dist, caches, temporary files, or machine-specific output. Generated files belong in Git only when the feature explicitly requires them.

## Tests

- Test observable behavior at the highest practical seam. Do not couple tests to private implementation details when a user-visible or module-level behavior can be asserted instead.
- Co-locate tests with the module they exercise, use domain vocabulary in test names, and keep fixtures small and representative.
- Prefer deterministic offline tests. Mock at external boundaries rather than calling live map or data services from unit tests.
- Add regression coverage for discovered bugs and test both success and failure states when the behavior has meaningful failure modes.
- For UI changes, cover semantic output, keyboard behavior, accessibility announcements, and state transitions where practical. Automated tests do not replace targeted browser verification when the changed behavior depends on layout, focus, keyboard interaction, MapLibre rendering, or external map resources.

## UI, accessibility, and map code

- Prefer native semantic controls, visible focus, keyboard operation, and text alternatives for state changes.
- Do not rely on color alone to communicate route identity, selection, status, or errors.
- Prefer semantic class-based CSS, keep dynamic library styling localized, preserve responsive behavior, and avoid unexplained magic values.
- Style colours with the theme tokens in `frontend/src/ui/styles/shared/themes/` (`--text-*`, `--border-*`, `--surface-*`) and do not hard-code hex values in component CSS.
- Confirm a token exists in every theme file before using it. Prefer a token that works in all themes over a `:root[data-theme='dark']` override, and explain any theme-specific override in a one-line comment.
- Judge contrast against the surface the element sits on. In dark mode `--border-subtle` and `--surface-raised` are nearly the same colour, so use `--border-card` for card edges.
- Keep MapLibre imperative work in lifecycle-aware effects or focused helpers. Pair every event registration and map object creation with cleanup.
- Preserve the separation between a domain location and its map marker. Changing marker presentation MUST NOT silently mutate the underlying venue or transit model.

## Exceptions and maintenance

- A deviation MUST be the smallest justified exception and its reason MUST be recorded near the decision or in the PR.
- Do not rewrite all existing code to satisfy a new rule automatically. When touching a violating area, fix it if it is related to correctness, safety, or the current scope; record larger cleanup separately.
- Standards changes belong in a small dedicated PR, or in the same PR when the code change creates the new rule. Update links and remove obsolete duplication.
