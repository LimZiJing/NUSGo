#!/usr/bin/env node
// PreToolUse hook: blocks file edits made in the shared checkout so work happens in a
// linked worktree. Set NAVUS_ALLOW_SHARED_EDITS=1 to bypass deliberately.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

if (process.env.NAVUS_ALLOW_SHARED_EDITS === "1") process.exit(0);

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!target) process.exit(0);

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

try {
  const dir = dirname(resolve(input.cwd ?? process.cwd(), target));
  const top = resolve(git(dir, "rev-parse", "--show-toplevel"));
  const shared = dirname(resolve(git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir")));
  if (top !== shared) process.exit(0);
  console.error(
    `Blocked: ${target} is in the shared checkout (${shared}). Create a fresh worktree from local main ` +
      "(git worktree add .claude/worktrees/<ticket> -b <branch> main), then make the change there. " +
      "See docs/agents/workflow.md. Set NAVUS_ALLOW_SHARED_EDITS=1 only if the user asked for it.",
  );
  process.exit(2);
} catch {
  process.exit(0); // not a git path (e.g. scratchpad): allow
}
