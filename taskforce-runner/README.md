# taskforce-runner

The **local** delegation runner of TaskForce (ADR-013). It connects the "Claude Code" choice of the assignee menu to
the Claude Code installed on your machine.

```
TaskForce : issue -> Assignee -> Claude Code             run QUEUED
runner    : claim -> git worktree -> claude -p + MCP server of the instance (delegated session)
          -> live timeline and approvals in TaskForce -> commits -> push + pull request -> result posted
TaskForce : run DONE (summary + pull request link), issue in "In review by AI"
```

The TaskForce server cannot reach your machine, so the runner comes to fetch the work ("pull" model). It never
merges anything: the decision stays human.

## What the agent may do

| Where | Rights |
|---|---|
| Repository | An **isolated worktree** on a new branch `tf/<key>-<title>-r<run>`. Your checkout and your current branch are never touched. |
| Machine | Each action is judged before it runs by the **rules of the task**, which TaskForce sends with it (default table in [`contracts/rules`](../contracts/rules/default.rules.json)). By default: reading and editing the copy, local commits and `git status/diff/log/show/add` run freely; the web, publishing, messages, payments and **anything the table does not know** wait for **your approval in TaskForce**, on the issue: Allow or Deny. No answer within 10 minutes means denied. The agent does not run the repository's scripts (`npm`, `yarn` or `pnpm` test and run): while your computer is not isolated, they would run whatever the agent wrote, so the **runner runs the project's test command itself, after the agent** (below). A path outside the copy or in `.git`, a command substitution, a redirection to a file, or an argument naming a path outside the copy is never allowed by a rule: it is asked or denied. `git push` and `gh` are always refused: the runner pushes and opens the pull request itself, after the agent. A mission on a public repository does not start for now (decided on 28/10/2026, until the runner's tests have been tried). The settings of the cloned repository (`.claude/settings*.json`: hooks, API URL) are ignored (`--setting-sources user`): only yours and the runner's apply. |
| TaskForce | Through the MCP server of the instance, **as the person who delegated**, with their rights as a ceiling, narrowed to: the run's workspace for reading, the issues of the run's project for writing, never a deletion. |
| GitHub | Nothing. The **runner** pushes the branch and opens the pull request, after the agent, each by the rules of the task. By default the agent's branch goes to a private repository without asking; a public repository, or a visibility `gh` cannot tell, waits for your approval in TaskForce. Refused or not approved, the commits stay on the local branch. |

The text of an issue or a note is written by other people. The brief presents it to the agent as task data, never
as an instruction, and the scope above bounds what an instruction slipped into that text could obtain.

While the agent works, the issue shows its **live timeline** (each tool call, each failure, each denial) and the
**approval requests**. Only the person who delegated can answer them: the action runs on their machine. TaskForce
notifies them when an approval is needed, and when the run finishes or fails.

### Tasks without a repository (non-code)

TaskForce is not only for code. When the project has **no** linked repository, the task runs in "repo-less" mode:
Claude Code works in a throwaway folder (`<home>/scratch/run-<id>`), and **delivers its work as a comment** on the
issue (`add_comment`), without git, branch or pull request. The delegated scope is the same. To accept code tasks
only, set `acceptRepoless: false` in `runner.config.json`.

## Install

Requirements: Node 20+, `git`, `gh` signed in (`gh auth status`), **Claude Code 2.1.295 or later**
(`npm install -g @anthropic-ai/claude-code`, then run `claude` once to sign in), and a TaskForce instance with the
local runner enabled (`DELIVERY_LOCAL_RUNNER_ENABLED=true`, the default in dev).

1. **Runner identity.** In TaskForce, open **Settings > Agents > Local runner** and set up your runner. TaskForce
   creates your machine identity and shows, once, the `.env` file to save as `taskforce-runner/.env`. The runner only
   picks up the tasks **you** delegate.

2. **Get the runner:**

   ```bash
   git clone --depth 1 https://github.com/taskforce-project/taskforce-fullstack.git
   cd taskforce-fullstack/taskforce-runner && npm install
   ```

3. **Repositories: nothing to declare.** A repository is created or linked in TaskForce, on the project (section
   "Code repository", GitHub connected in one click). On the first task, the runner clones it with your `gh` (so your
   rights, private repositories included) into `~/.taskforce-runner/repos/<owner>/<name>`, then reuses that clone.
   Declare a repository in `runner.config.json` only to work in a checkout you already have, or to give it `setup`
   commands.

4. **Check, then start:**

   ```bash
   npm run check     # token, git, gh, claude version, repositories: each link, without claiming anything
   npm run dev       # listening; Ctrl+C exits after the current run
   npm run once      # handles at most one run, then exits
   ```

## Configuration (`runner.config.json`)

| Key | Default | Role |
|---|---|---|
| `repos["owner/name"]` | (none) | `path` (absolute), `baseBranch` (`main`), `setup` (commands run before the agent, each an array of arguments, e.g. `[["npm", "ci"]]`: a new worktree has no dependencies). |
| `autoClone` | `true` | A repository that is not declared is cloned on demand into the runner's folder. `false` = declared repositories only. |
| `pollSeconds` | 5 | How often the runner asks for work. |
| `push` / `openPullRequest` | `true` / `true` | `push: false`: nothing leaves the machine, the work stays on a local branch. |
| `keepWorktree` | `false` | Keep the worktree after a success. A failed run always keeps it (the only trace of the work). |
| `acceptRepoless` | `true` | Accept tasks of projects **without a repository** (delivered as a comment). |
| `agent.auth` | `subscription` | See below. |
| `agent.model` | `null` | `null` = the model chosen when delegating. |
| `agent.maxTurns` / `agent.timeoutMinutes` | 60 / 45 | Agent bounds. The duration is also capped by the lifetime of the session token. |
| `agent.approvalTimeoutMinutes` | 10 | How long an action waits for your answer in TaskForce (60 at most). Then it is denied. |
| `agent.attribution` | `false` | `false` = no "Co-Authored-By: Claude" in the agent's commits. |
| `agent.extraAllowedTools` | `[]` | Tools you allow in advance on this computer, e.g. `["Bash(mvn test *)"]`: they skip the rules that ask, never one that denies. |

## Subscription or API key

The choice belongs to the person running the runner:

- `agent.auth: "subscription"`: Claude Code runs with **their** claude.ai login, on **their** machine. An ambient
  `ANTHROPIC_API_KEY` is removed from the agent's environment, otherwise Claude Code would prefer it and bill the API
  account without warning.
- `agent.auth: "api-key"`: `ANTHROPIC_API_KEY`, billed per use.

**What Anthropic's terms say** (the "Legal and compliance" page of Claude Code, read on 20/09/2026; read it again
before any commercial use, this is not legal advice):

- Each person may sign in to the **unmodified** Claude Code binary with **their own** subscription, including when a
  platform runs Claude Code for them. That is what the runner does: it starts the person's Claude Code, and
  TaskForce never sees their Claude credentials.
- A product may not offer the claude.ai login in its own application, nor collect, store or relay its users' Claude
  credentials or tokens, nor pay for, resell or broker their usage: each person signs in themselves and is billed for
  their own usage.
- The binary must not be modified, and none of its authentication methods removed or restricted.
- Building Claude Code into an offering requires accepting Anthropic's Commercial Terms. A product may say in text
  that it runs Claude Code, not make it a feature name or use the logo without permission.

The details are in ADR-013.

## Test the chain without using Claude

`test/fixtures/stub-agent` (`.cmd` on Windows) runs instead of `claude`: it has three actions judged by the rules
through the real `PreToolUse` hook, goes through the **real** MCP server of the instance in a delegated session, reads
and comments the issue, checks that what must be refused is refused, asks for one approval through the real
`PermissionRequest` hook, then leaves a commit. Point `agent.command` to it. Never in production.

```bash
npm test          # unit tests: rules and facts, branch names, config, tool boundary, live timeline, approvals, result parsing
```

## The project's tests, run after the agent

In the project's settings, next to its repository, "Tests after an agent's work" holds the project's test command
(`npm test`, `npm run lint && npm test`...). Once the agent is done and its work committed, the runner runs it in the
copy, at most 15 minutes, and the result goes to the issue, the pull request and the record of the run.

It runs on your computer, with the code of the branch, the agent's included: the first time, and whenever the command
changes, TaskForce asks you before running it. Your answer is kept on this computer
(`~/.taskforce-runner/approved-tests.json`), per repository and per exact command. Leave the command empty to run no
tests.

## Check the record of a run

Under a finished run, TaskForce offers "Download the record", in JSON or Markdown: every action, the rule that
judged it, every decision asked of you and your answer, what left the computer. The JSON file follows
[`contracts/evidence`](../contracts/evidence/taskforce-evidence-1.schema.json) and is checked without TaskForce, by
recomputing every hash:

```bash
npm run verify -- evidence-run-42.json
```

## Troubleshooting

- **`claude`: "The specified executable is not a valid application for this OS platform"** (Windows, right after
  `npm install -g @anthropic-ai/claude-code`). The npm package is a wrapper: `bin/claude.exe` is a placeholder that
  the install script replaces with the native binary, shipped in an optional package. If that package did not
  arrive, run `npm install -g @anthropic-ai/claude-code` again; `claude --version` must print a version number.
- **`npm run check`** says which link is missing: machine token, `git`, `gh`, `claude` (and its version),
  repositories.
- **Versions.** The options the runner passes to `claude -p` (`--permission-mode manual`, `--permission-prompts none`,
  the HTTP `PermissionRequest` hook, `--setting-sources user`) were checked against Claude Code 2.1.293. The
  `PreToolUse` hook that applies the rules needs `onFailure: "block"`, which came with 2.1.295: the runner refuses an
  older Claude Code before each task (update it with `npm install -g @anthropic-ai/claude-code`).
- A failed run keeps its worktree in `~/.taskforce-runner/worktrees/run-<id>`: it is the trace of what the agent did.
  The failure message shows on the issue and in the "AI Workflows" panel.

## Revoke a runner

In **Settings > Agents > Local runner**, "Regenerate secret" replaces the secret: a runner started with the old one
stops working. An administrator can also disable the `tf-runner-*` client in Keycloak. A token already issued stays
valid until it expires (lifetime of the realm's access tokens, shown by `npm run check`).
