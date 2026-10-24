# Codex Task Kickoff Template

Copy and adapt this prompt when starting a NUSGo task.

```text
Goal:
- What single outcome should be achieved?

Acceptance criteria:
- What observable behavior or deliverable is required?
- Which tests, checks, or manual verification are required?

Scope:
- Which issue, pull request, branch, worktree, or modules are in scope?
- What is explicitly out of scope?

Constraints:
- Preserve unrelated user changes.
- Follow the repository guidance and domain vocabulary.
- Do not add dependencies unless the requirement needs one and existing capabilities are insufficient.
- Do not push, edit GitHub issues, create a pull request, or take other external actions unless explicitly authorized below.

Authorization:
- Local file changes: yes/no
- Commit: yes/no
- Push branch: yes/no
- Create or update GitHub issue: yes/no
- Create pull request: yes/no
- Merge or close anything: yes/no

Workflow:
1. Inspect status and establish the canonical repository path and worktree.
2. Read only the relevant project guidance, issue, ADRs, and source files.
3. Implement the smallest coherent change.
4. Use targeted checks while iterating.
5. Run the applicable final verification suite once the change is complete.
6. Follow the issue-completion `CONTEXT.md` review in `docs/agents/workflow.md`.
7. Report the result, checks, limitations, and follow-up work.

Delegation:
- Use no agents unless parallel work is genuinely useful.
- If delegating, limit the number of agents and give each an exact scope and concise response format.
```

For a follow-up task, include a short handoff with the previous task's branch, commit, completed checks, known limitations, and the next acceptance criterion.
