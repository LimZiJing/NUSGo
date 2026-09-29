# Codex Workflow

This document defines the default collaboration lifecycle for NavUS implementation, investigation, and documentation tasks. It complements the engineering rules in `AGENTS.md` and `docs/agents/coding-standards.md`.

## 1. Start with one coherent outcome

- Keep one issue, pull request, or investigation as the task's primary outcome.
- State the acceptance criteria, scope boundaries, required checks, and external actions that are authorized.
- If the objective changes materially, start a fresh task and carry forward a short handoff instead of accumulating unrelated work in one conversation.

## 2. Perform a bounded preflight

Before discovery or editing, confirm:

- repository path, branch, and worktree;
- current status and unrelated changes;
- relevant issue, ADR, glossary, and project-status guidance;
- available package manager, runtime, browser, or other task-specific tools;
- whether pushing, issue updates, or pull-request creation is authorized.

Keep the shared checkout on local `main`. Unless the user explicitly requests otherwise, create a fresh managed worktree from local `main` for each ticket and use a dedicated descriptive branch in that worktree. Do not implement tickets in the shared checkout or reuse another ticket's worktree.

If an environment command fails, diagnose the path, permission, runtime, or process-lifecycle cause before retrying it. Start long-lived development servers with a known port and an explicit cleanup path.

## 3. Inspect within an output budget

Prefer targeted reads and summaries over whole-tree inspection:

- limit searches to relevant repository paths;
- exclude `.git`, `node_modules`, `dist`, caches, and worktrees unless they are the subject of the task;
- use `git diff --stat`, `git show --stat`, `--name-only`, `--jq`, and bounded output when full content is unnecessary;
- inspect images with the available image tools instead of converting them to base64 text;
- do not dump generated files or framework internals without a specific question that requires them.

## 4. Implement the smallest coherent change

Preserve unrelated user changes, keep one canonical source of truth, and avoid speculative dependencies or automation. Group edits around the acceptance criteria and keep unrelated cleanup out of the task.

## 5. Verify in two loops

During implementation, use targeted tests or checks that provide fast feedback. After the coherent change is complete, run and report the applicable final gates:

- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

UI and map changes also need targeted browser or smoke verification. Full responsive and keyboard verification is required when those behaviors change materially or before release. If a check is unavailable or not applicable, record why instead of silently substituting another check.

Do not repeat a full verification suite after every small edit unless the change or failure diagnosis requires it.

## 6. Delegate intentionally

Do not delegate trivial discovery or isolated checks. When parallel work is useful, prefer one narrowly scoped implementation agent and, for substantial changes, one narrowly scoped review agent. Give each agent exact files, acceptance criteria, constraints, and a concise result format. The main task owns integration and final verification.

## 7. Handoff and close

At the end of every issue, review `CONTEXT.md` against the completed work. Update it in the same pull request when stable domain or product vocabulary changed. If no update is needed, state `CONTEXT.md reviewed; no update needed` in the handoff or pull request. Keep changing implementation status in `docs/project-status.md`.

Finish with a concise record of:

- what changed and what stayed out of scope;
- exact checks and their results;
- browser or manual verification performed and limitations;
- issue, branch, commit, and pull-request references;
- follow-up work that should become a separate task.

After the associated pull request is accepted and merged, archive or remove the ticket's worktree and run `git worktree prune` to clear stale metadata. Leave worktrees for active tasks and open pull requests in place.

Once the outcome is complete, stop the task. Do not keep unrelated follow-ups in the same conversation.

## Efficiency signals

Use task history to watch turns, action calls, shell processes, failed actions, context compactions, delegated work, unusually large outputs, and repeated full-check runs. These are diagnostic signals, not substitutes for correctness. As practical warning signs, investigate more than one context compaction, repeated environment failures, unexplained 100-plus-action turns, or unbounded command output.
