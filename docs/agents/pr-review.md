# Pull request review

How a pull request gets from opened to merged. Coding rules are in [coding-standards.md](coding-standards.md); this file covers who reviews what. It applies to every maintainer and to any AI agent reviewing on a maintainer's behalf.

## The rule

No pull request is approved or merged without an explicit go-ahead from a human maintainer who is not the PR's author. Clean AI review findings, green CI, or an agent's own judgement do not count as that go-ahead.

An AI agent reviewing for a maintainer MUST NOT submit an `APPROVE` or `REQUEST_CHANGES` review, dismiss a review, merge, or enable auto-merge on its own. It comments and reports back to its human. Once that human has given the go-ahead on the PR, the human, or their agent on their instruction, may approve and merge.

## Three gates

### 1. Design, before code

The issue must have agreed design decisions before implementation starts when the change:

- adds or changes a domain concept in `CONTEXT.md`;
- changes a shared type in `shared/src/**/types.ts` or a data file's schema in `frontend/public/data/`;
- adds or reshapes a top-level UI element (a new control in a sheet, a new tab or segmented choice);
- matches anything in [Decisions that need a human](coding-standards.md#decisions-that-need-a-human).

Agreement means a maintainer other than the implementer has confirmed the design on the issue or in an ADR. The PR links to it. Good code cannot fix a design that was never agreed.

### 2. AI code review (comments only)

AI review checks three things and reports findings as comments:

| Axis | Question |
| --- | --- |
| Standards | Does the code follow `coding-standards.md` and avoid common code smells? |
| Spec | Does it do what the issue asked, no more and no less? |
| Maintainability | Will the next similar change be easy? For example: does adding another kind of place mean editing one spot or ten? Are there optional fields that only some records use, or `if (x.field)` checks used to tell kinds apart? |

On each new push, AI review re-checks its own earlier findings, resolves its own comment threads once they are fixed, and says when nothing is left. It never resolves other people's threads or dismisses their reviews; a human's "changes requested" stays until that person clears it.

AI review also lists **Design questions for the maintainer**: choices it noticed but must not decide, such as a new optional field on a shared type, a new parallel category system, or a UI control that uses a lot of screen space. It asks these and does not resolve them.

The agent gives its human a short brief per PR: a plain-words summary, a verdict (ready for go-ahead, needs changes, design question open, or waiting on someone's change request), and local test steps for visual changes.

### 3. Human go-ahead

What the reviewing maintainer needs depends on the kind of change:

- **Visual change** (anything a user can see): the reviewing maintainer tests it on a local dev server before the go-ahead. The PR gives the exact steps: which page, which viewport, what to tap, and what should happen.
- **Logic, data or backend change**: the PR opens with a plain-words summary of at most three sentences that a non-engineer could follow: what was wrong or missing, what changes, and what could break. The reviewer should not need to read a long description to decide.
- **Both**: provide both.

The go-ahead is a comment from that maintainer on the PR, for example "go ahead". Only then may the PR be approved and merged. A push after the go-ahead needs a fresh go-ahead.

## Testing a PR locally

From the shared checkout:

```sh
git fetch origin pull/<n>/head:pr-<n>
git worktree add ../NavUS-pr-<n> pr-<n>
cd ../NavUS-pr-<n>
npm run servers:start
```

Run `npm run servers:stop` when done. Remove the worktree after the PR is merged or closed.

## PR descriptions

Use the [pull request template](../../.github/pull_request_template.md). Keep it short: the plain-words summary and the test steps are the parts the reviewer reads. Implementation detail belongs in commit bodies.
