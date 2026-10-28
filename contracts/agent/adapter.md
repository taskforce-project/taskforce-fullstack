# Agent adapter contract

Every agent the runner can drive (Claude Code today, the internal loop with a local model next, then Codex, Cursor,
Gemini CLI) plugs in through one adapter. The adapter knows the agent; the runner owns the sandbox, the rules and the
evidence. The TypeScript types live in `taskforce-runner/src/adapters/types.ts`.

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

## Proved by

The adapter tests in `taskforce-runner`: a scripted agent replays fixed sequences of actions; the decisions must follow
`contracts/rules/cases.json`, and the emitted events must chain as `contracts/evidence/chain-cases.json` says.
