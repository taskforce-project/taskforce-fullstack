# Harness contracts

The contracts that the parts of the harness share. They are written before the code (R16 of the v2 specification,
`taskforce-docs/v1/road_to_v2/Specification_V2_Harnais.md`), and each side proves it follows them by running the same
cases.

| Contract | Files | Read by | Proved by |
| --- | --- | --- | --- |
| Rules bundle, `taskforce-rules/1` | `rules/taskforce-rules-1.schema.json`, `rules/default.rules.json` | the server publishes it and judges its own tools with it, the runner applies it to the agent's actions | `rules/cases.json`: the same actions must get the same decision on both sides |
| Evidence file, `taskforce-evidence/1` | `evidence/taskforce-evidence-1.schema.json` | the server writes the chain, anyone can check an export | `evidence/chain-cases.json`: the same events must give the same hashes on both sides |
| Agent adapter | `agent/adapter.md` | the runner, one adapter per agent | the adapter tests in `taskforce-runner` |

## One engine for both sides

The rules engine and the evidence chain are written once, in Java, in `backend/tf-api`
(`core/harness`: `RulesEngine`, `Glob`, `RulesDigest`, `CanonicalJson`, `EvidenceChain`). The runner runs the same
code, compiled to JavaScript by TeaVM: `backend/rules-engine-js` builds `taskforce-runner/src/harness/engine/rules-engine.js`
and its TypeScript declarations, which are committed so that the runner needs no JDK. A rule, a glob or a hash cannot
mean one thing on the server and another in the runner (R90, decided on 02/11/2026).

"Both sides" above are therefore the Java engine and its compiled module: the server's tests replay the cases in Java,
the runner's tests replay them against the compiled module, which also catches a mistake of the compiler. The CI
compiles the module again from the Java sources and refuses a difference with the committed file
(`.github/workflows/rules-engine.yml`). What turns a tool call into facts stays the runner's own code
(`taskforce-runner/src/harness/facts.ts`), as the agent adapter says.

## Rules: how a decision is made

1. An action is described by facts: `action` (from the list in the schema), and when they apply `tool`, `command`,
   `path`, `branch`, `repoVisibility`, `server`, `sensitivity`.
2. A rule matches when every condition in its `when` matches. Text conditions are globs, matched against the whole
   value: `*` matches any run of characters but `/`, `**` any run of characters, `{a,b}` one of its comma-separated
   alternatives (no nesting), and every other character itself. A missing fact never matches a condition that needs
   it. Enumerated conditions (`action`, `repoVisibility`, `sensitivity`) match by equality.
3. Of the matching rules, `deny` beats `ask`, which beats `allow`. The decision names the rule that won; among rules of
   the same effect, the first in the bundle wins.
4. No matching rule: the action is unknown and the decision is `ask` (invariant 3). Nothing else is implied.
5. No model, no network, no clock: the same bundle and the same facts always give the same decision (invariant 1).
   One tool call may be described by several sets of facts (a compound command, one set per part): the strictest
   decision wins, the first one among equals. A call with no facts at all (an internal tool of the agent, with no
   effect outside its session) is allowed, with no rule.
6. The bundle's `digest` is `sha256:` followed by the hex SHA-256 of the canonical JSON (see below) of the bundle
   without its `digest` field and without any member whose value is `null`, at every level. The runner recomputes it
   and refuses a bundle that does not match: no mission starts without rules.

## Evidence: how the chain is built

1. Each event has `seq` (1, 2, 3...), `at`, `type`, `actor` and `data`, plus `prev` and `hash`.
2. `prev` is the `hash` of the previous event; for the first event it is `sha256:` followed by 64 zeros.
3. `hash` is `sha256:` followed by the hex SHA-256 of `prev`, a line feed, then the canonical JSON of the event without
   its `hash` field.
4. Canonical JSON: object keys sorted by their UTF-16 code units (Java's `String.compareTo`), no whitespace, `true`,
   `false`, `null`, integers only (events never carry decimal numbers), and strings escaped exactly as ECMAScript's
   `JSON.stringify` does: `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t` as two-character escapes, any other code unit below
   0x20 and any lone surrogate as `\u` with four lowercase hex digits, everything else as is.
5. The file's `root` is the `hash` of its last event. Changing or removing any event changes `root`.
