# Agent adapter contract

Every agent the runner can drive (Claude Code today, the internal loop with a local model next, then Codex, Cursor,
Gemini CLI) plugs in through one adapter. The adapter knows the agent; the runner owns the sandbox, the rules and the
evidence. The TypeScript types will live in `taskforce-runner/src/adapters/types.ts`, with the second adapter; until
then, the Claude Code adapter is `taskforce-runner/src/agent.ts` and `approvals.ts` (below).

## What an adapter declares

| Field | Meaning |
| --- | --- |
| `kind` | `claude-code`, `internal`, `codex`, `cursor`, `gemini` or `copilot` (the evidence file uses the same names) |
| `governance` | What the harness holds for this agent (specification §10.2): `complete` (every action goes through the gate, a person can be asked), `internal` (TaskForce runs the loop), `partial` (allow or deny only, no ask without a screen), `boundaries` (only the request and the result) |
| `check()` | Says whether the agent can run on this computer: installed, version, signed in. It never starts work |

## What the runner gives an adapter for one mission

| Input | Meaning |
| --- | --- |
| `mission` | The request (title, description, acceptance checks), the sandbox folder, the model chosen for the task, the time and turn limits |
| `gate` | `decide(facts)`, the local rules (contracts/README.md): `allow`, `ask` or `deny`, with the rule that decided. Deterministic, no network |
| `ask` | `request(facts, summary)`, for a decision of `ask`: resolves with the person's decision, or `deny` when the shared waiting time runs out |
| `events` | `emit(event)`: one numbered event per fact worth keeping (actions, decisions, sources read, results). The runner writes it to disk first, then sends it |
| `signal` | Aborted when the mission must stop (time, turns, cost, or a person's stop) |

## What an adapter must do

1. Describe every action as facts before it runs, call `gate.decide`, and obey the decision. With `ask`, call `ask.request`
   and wait. An adapter that cannot hold an action until a decision (a `partial` agent) refuses it instead.
2. Never give the agent a secret, a token of the company's tools, or the rules file to edit (invariants 1 and 6).
3. Report every action through `events`, including those the gate allowed without asking (R7').
4. Return an outcome: `done` (with what the agent says it did), `failed` (with the cause), or `stopped` (with the
   limit that was reached). The runner, not the adapter, runs the checks and decides what leaves the sandbox.

## Claude Code today

Claude Code is the first `complete` adapter. Two HTTP hooks hold the gate. The runner serves them on 127.0.0.1, behind
a token that is random for each run (`taskforce-runner/src/approvals.ts`):

| Hook | When | What the runner answers |
| --- | --- | --- |
| `PreToolUse` | Before every tool call | The rules' decision: `allow` or `deny`, naming the rule and its reason. For `ask` it gives no decision |
| `PermissionRequest` | An action with no decision, not allowed in advance | The person's decision in TaskForce, or `deny` when the wait runs out |

- Nothing is allowed in advance (no `--allowedTools`), so every `ask` reaches `PermissionRequest`: in headless mode, an
  `ask` from `PreToolUse` would end as a refusal, and an action allowed in advance would skip a rule that asks. A
  person can still allow tools in advance on their own computer (`agent.extraAllowedTools`); a rule that denies blocks
  those tools anyway.
- Both hooks use `onFailure: "block"`: if the runner does not answer, the action is blocked instead of let through.
  Claude Code 2.1.295 is the first version with it, according to its changelog, and the runner checks the version
  before each mission.
- The facts come from the tool call (`taskforce-runner/src/harness/facts.ts`):
  - files: `file.read`, `file.search`, `file.write`, with the path relative to the copy, links followed;
  - commands: split on `&&`, `||`, `;`, `|`, `&` and new lines outside quotes, each part judged alone, the strictest
    decision wins; `git commit` is `git.commit`, any other command is `shell`;
  - TaskForce MCP tools: one action each (`issue.read`, `comment.create`...);
  - web: `web.search` and `web.fetch`;
  - internal tools of the agent (`TodoWrite`, `Task`, `ToolSearch`...): no facts, allowed. The actions of a subagent
    go through the hook themselves.
- What cannot be bounded can be denied or asked by a rule, never allowed. That covers a path outside the copy or
  inside `.git` (a hook written there would run at the next commit), a search pattern that leaves the copy, and a
  command with a substitution, a redirection to a file, `--output`, or an argument naming a path outside the copy
  (`npm test --prefix ../elsewhere`, `--outDir=../../x`: an allowed name doing its work elsewhere). The commit message form that Claude Code uses
  (`"$(cat <<'EOF' ... EOF)"`, quoted delimiter) is plain text and is read as such.
- Not described yet, so always asked: the `PowerShell` tool, and any tool this list does not name.

## Proved by

The adapter tests in `taskforce-runner`: a scripted agent replays fixed sequences of actions; the decisions must follow
`contracts/rules/cases.json`, and the emitted events must chain as `contracts/evidence/chain-cases.json` says.
