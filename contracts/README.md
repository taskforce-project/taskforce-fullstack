# Harness contracts

The contracts that the parts of the harness share. They are written before the code (R16 of the v2 specification,
`taskforce-docs/v1/road_to_v2/Specification_V2_Harnais.md`), and each side proves it follows them by running the same
cases.

| Contract | Files | Read by | Proved by |
| --- | --- | --- | --- |
| Rules bundle, `taskforce-rules/1` | `rules/taskforce-rules-1.schema.json`, `rules/default.rules.json` | the server publishes it and judges its own tools with it, the runner applies it to the agent's actions | `rules/cases.json`: the same actions must get the same decision, and the same bundle the same digest, on both sides |
| Evidence file, `taskforce-evidence/1` | `evidence/taskforce-evidence-1.schema.json` | the server writes the chain, anyone can check an export | `evidence/chain-cases.json`: the same events must give the same hashes on both sides |
| Agent adapter | `agent/adapter.md` | the runner, one adapter per agent | the adapter tests in `taskforce-runner` |
| Mission step, `taskforce-mission-steps/1` | `mission-steps/cases.json` | the server gives the step of each mission to the workflow view (`MissionSteps`), the screen draws the steps of one mission (`frontend/lib/delivery/mission-sequence.ts`) | the same cases: the same status, timeline and requests must give the same step on both sides |
| Process, `taskforce-process/1` | `process/README.md` (the BPMN 2.0 subset, the `tf:` extension), `process/taskforce-process-1.xsd`, `process/integrate-a-module.bpmn` | the server exports and imports it; any BPMN modeler opens it | `ProcessContractTest` (the XSD, the round trip, the subset frozen on E20) and `frontend/lib/process/bpmn-moddle.test.ts` (bpmn-moddle reads and rewrites it) |

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
   it. Enumerated conditions (`action`, `repoVisibility`, `sensitivity`) match by equality. A threshold (`over`) is
   read last: when the rule's other conditions match and its fact is missing or isn't a number, the threshold counts
   as exceeded.
3. Of the matching rules, `deny` beats `ask`, which beats `allow`. The decision names the rule that won; among rules of
   the same effect, the first in the bundle wins.
4. No matching rule: the action is unknown and the decision is `ask` (invariant 3). Nothing else is implied.
5. No model, no network, no clock: the same bundle and the same facts always give the same decision (invariant 1).
   One tool call may be described by several sets of facts (a compound command, one set per part): the strictest
   decision wins, the first one among equals. A call with no facts at all (an internal tool of the agent, with no
   effect outside its session) is allowed, with no rule.
6. The bundle's `digest` is `sha256:` followed by the hex SHA-256 of the canonical JSON (see below) of the bundle
   without its `digest` field and without any member whose value is `null`, at every level. The runner recomputes it
   and refuses a bundle that does not match: no mission starts without rules. The case `issued` of `cases.json` is a
   bundle in the form the server issues it, replayed on both sides.
7. Each rule names who answers for it (`owner`, R2 and invariant 8): a person, never a role (R32 replaced the generic
   `workspace-owner` with a named person) and never an email. The bundle names them by their opaque id in the
   workspace, `who:` and 32 hex digits, the id the evidence record names them by (People, below): TaskForce's table
   is answered for by the owner of the workspace, a company rule by the person who added it. A version of a layer
   stored before 1.18 named its author by email, and never changes: the server names them by their id when it issues
   the bundle, and gives that layer the digest of its rules named the same way, so that no digest of the bundle
   confirms an email. `who:unknown` names no one, a person TaskForce cannot find any more; `workspace-owner` is only
   the placeholder of `default.rules.json`. The owner never changes a decision.

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

### Canonical JSON and RFC 8785

On every value TaskForce writes, the canonical JSON above is RFC 8785 (JSON Canonicalization Scheme): a standard JCS
library finds the same bytes, hence the same hashes. The two cases of `chain-cases.json` named "RFC 8785" are the
examples of the RFC, replayed on both sides. Compared on the cases an evidence file holds:

| Case | RFC 8785 | TaskForce |
| --- | --- | --- |
| Object keys | Sorted by UTF-16 code units | Same |
| Strings | `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`, other controls as lowercase `\u00xx`, the rest as is | Same |
| `true`, `false`, `null`, arrays, nesting, no whitespace | | Same |
| Integers within ±(2^53−1) | ECMAScript number form: the digits | Same |
| A lone surrogate | Refused: not I-JSON | Never written: the server writes U+FFFD in its place when an event comes in (`EvidenceIntake`). A file written before 1.18 may hold one, escaped as `JSON.stringify` does, and still checks |
| An integer beyond ±(2^53−1) | Written as the double it rounds to | Never written: it comes in as a string |
| A decimal number | ECMAScript number form | Never written: it comes in as a string; an event holding one cannot be checked |

### The header comes from the chain

The export's `mission` is not written beside the chain: `mission.started` carries `mission` (the id), `workspace`,
`project`, `issue`, `requestedBy`, `agent` (`kind`, the `model` chosen), `rules` (`version`, `digest`), `runner`,
`runnerFacts` and `taskforce`, and the last `note` of kind `agent` gives the model that really ran and the agent's
`version`. Anyone rebuilds the header from the events and compares (`EvidenceHeader` in Java, `headerOf` in
`taskforce-runner`): a covered field that differs, or that the header lacks, fails. A file opened before 1.18 covers
only part of its header; the verifier says which fields are not covered, and its `requestedBy` is null.

### People

A person enters the chain by an opaque id, `who:` and 32 hex digits, drawn the first time, one per person and
workspace: the same in every mission of a workspace, and nothing links the ids of one person from a workspace to
another. The prefix is the record's own, and the rules bundle uses it for the owner of each rule (rule 7 above):
where the live rules need a member, they name them `person:<id>`, which the record never does. The id names
`requestedBy`, `accountable`, `request.reporter`, the `author` of each rules layer, the `owner` of each rule, the
person a request is `asked` of, and the actor of each gesture. A `note` of kind `person` introduces each one in a
dossier, once: `person`, and `email` and `name` as texts kept beside the chain. A GitHub account that merges the pull
request enters the same
way, by the text of its login. When an account is purged, its email and name are erased in every dossier, with their
salt, and a `note` of kind `erased` (`person`, `texts`, `reason: account-deleted`) says so; the id stays in the
chains, linked to no one. So is the login of its merges, whatever its case, when TaskForce knows it as the account's
(the login of a GitHub connection the account made); a dossier that holds only that login gets the note without
`person`. A chain written before 1.18 named people by their email (its `mission.started` has no
`accountable`): those events cannot change without breaking the chain. When the account of a person it names is
purged (its current email, whatever its case), the record gets a `note` of kind `erased` with `legacy: true`, the `events` that keep the email and the
`reason`, naming no one, then a late seal (below). TaskForce hides the emails of such a record when it shows it (the
page, the Markdown export), and only an owner or admin of the workspace exports its JSON or its seal, which carry them.
The rules bundle names the `owner` of each rule by their opaque id already, and the record introduces each owner by
their note. Where the live rules name a member by their account, `person:<id>` among the `approvers` of a rule and as
the `ref` of a person's layer, the copy of the bundle the record keeps names them by their opaque id too, each
introduced by its note (a person TaskForce no longer knows is `who:unknown`). A rule stays that of a named person
until their name is erased; then the `erased` note says when.

### What the file carries besides the chain

- `rules`: the rules bundle the mission received (`taskforce-rules/1`), each person in it by their opaque id (above).
  When no rule of the bundle or of its layers names a member among its approvers, and no layer is a person's, it is
  the bundle the runner received, member for member: its digest is the one the runner checked at claim time, the one
  the mission notes, and the one `mission.started` holds. Otherwise the copy names those members by their id, and its
  digest, the one `mission.started` holds, is computed on the copy, as is each layer's, on that layer's rules named
  the same way: none confirms an email or an account once erased. Anyone judges each `action.decided` of kind
  `decision` again with the `facts` it keeps.
- `texts`: the texts kept beside the chain, by their hash, each as `{ "salt": ..., "text": ... }`. The hash is `sha256:`
  and the SHA-256 of the UTF-8 bytes of the salt (32 hex digits, drawn for this text) followed by the text: a short
  text, erased, cannot be confirmed by guessing it. The chain holds only `{ "sha256": ..., "chars": ... }` for the
  request's title and description, the brief, what the agent says, its summary, the lines of the checklist, and the
  email, name or login of a person. Every text the file keeps must be named by the chain. A text can be erased with
  its salt: its hash stays, the chain still holds, and a `human.decision` of kind `erased` says who and when.
- `seal`: the last seal (below).

### What the runner reports

The runner's facts (its tests, the agent and its model, the numbers of its events) come from the computer where the
agent works, under the same user: they are worth what that computer is worth, whatever the custody of the key. When a
runner takes the mission, `mission.started` says so with `runnerFacts: "agent-machine"`, and the verifier repeats it.
A `test.result` lists in `definitionChanged` what changed of what defines how the tests run: the files of the branch
(`package.json` and the scripts its commands run, `pom.xml`, `mvnw` and `.mvn/`, Gradle's files and wrapper,
`pyproject.toml`, `setup.cfg`, `tox.ini`, `pytest.ini`, `conftest.py`, `noxfile.py`, Jest, Vitest and Playwright
configurations, Makefiles, a script the command names, and the like), and `taskforce:test-command` when the project's
test command in TaskForce is no longer the one the runner ran. The result then only says that the agent's version of
the tests passes. `definitions` lists the files of that kind the runner found, changed or not: it is the list
TaskForce looks for, so "none of these files changed", never "the tests are the same". The `note` of kind `agent` gives
the model the configuration asked for (`configured`), each model the answers named (`served`), and who serves it
(`provider`: `anthropic`, `amazon-bedrock`, `google-vertex`, or `another-endpoint`), as the configuration said when
the agent was launched (`providerFrom: launch-configuration`): the runner's environment, then the `env` of Claude
Code's user settings and of the organization's managed settings files, where Claude Code reads them
(`managed-settings.json` and the `*.json` of `managed-settings.d/` next to it, in `C:\Program Files\ClaudeCode`,
`/Library/Application Support/ClaudeCode` or `/etc/claude-code`, as https://code.claude.com/docs/en/managed-settings
describes). The repository's settings are not read: the runner launches Claude Code without them. What the runner
cannot read is listed rather than guessed (`providerUnread`): the Windows registry policy or macOS managed preferences,
and the settings Anthropic's server pushes; any of them may name another provider.

### Gaps and the cap

The runner numbers its events (`n`: 1, 2, 3...) and sends a batch again until it gets through. The server keeps the
last number it received: a number already received is dropped, a number that skips first leaves a `note` of kind
`gap` (`from`, `to`). At the end, the runner says how many events it numbered; the ones that never came are marked too.
A runner that stops answering leaves a `gap` with `to: null`: any event after `from - 1` may be missing.

A dossier keeps 10,000 events of what the mission gives rise to: what comes from the agent's computer (actors `agent`,
`rule`, `runner`) and what the server writes because of it (a `gap`, a request for approval, its expiry). The next one
becomes a `limit.reached` written by the server (`max`, `stopped`), and TaskForce stops the mission, so that nothing
goes on without being written. A reserve of 1,000 more keeps only what the server and people write, and nothing else:
`mission.ended`, the people's gestures (`human.decision`), the `limit.reached` itself, the notes of kind `person`,
`checklist`, `witness`, `erased` and `late-seal`, and the `gap` of a lost runner. A text is kept beside the chain only
with the event that names it: an event the cap drops leaves none.

A fact longer than 4,000 characters (a long command) arrives cut, its end replaced by `[TaskForce cut this text here:
N characters in all]`. The rules judged the whole fact: a decision whose facts were cut is not judged again, and the
verifier says how many.

### Seal

No format of TaskForce's own (E34): the seal is an in-toto Statement v1 whose subject is the head of the chain
(`taskforce-mission-<id>`, `sha256` digest of the root), with predicate type
`https://taskforce-project.fr/contracts/taskforce-evidence/1` and the predicate `{ format, mission, root, seq,
sealedAt, key: { id, algorithm, publicKey, custody, kept }, late }` (`late` only on a late seal, below). The payload is the canonical JSON of the statement. It is
signed in Ed25519 over the DSSE pre-authentication encoding, `DSSEv1 <len> application/vnd.in-toto+json <len>
<payload>` (lengths in bytes), and kept in a DSSE envelope: `{ payload (base64), payloadType, signatures: [{ keyid, sig
(base64) }] }`. The key id is `sha256:` and the SHA-256 of the public key in SubjectPublicKeyInfo DER. The server seals
at the end of the mission, and again after each later gesture; `GET .../evidence?format=dsse` gives the envelope alone.

A record whose mission ended before TaskForce sealed records is sealed once, when the server starts: a `note` of kind
`late-seal` says so at the end of its chain, with the date, and the seal's predicate carries `late: true`. A late seal
proves the chain as it was on `sealedAt`, not what happened before; every later seal of that record is late too. The
verifier accepts it with `--key`, and its first line says "Sealed late, on ...".

`custody` says where the private key lives: `same-machine` (the default, and always in the desktop app) when an agent
may run on the machine that holds it, `separate-machine` when the operator declares that none does. A seal proves that
the key saw this chain up to `seq`; it proves nothing more than the custody of its key. The statement's subject is the
root it names: a verifier refuses a seal whose `subject[0].digest.sha256` is not `predicate.root` without its prefix.
`kept` says whether the key outlives a restart: by default the server keeps it in a file of its data volume, as the
desktop app does (`SELF_HOSTING.md`); a key drawn at start, because that file cannot be written, says `kept: false`.

The file carries the public key of its seal, so a seal checked with that key alone proves nothing: anyone who rewrites
a record can seal it again with a key of their own. Check a seal against the key the operator publishes, which a
member of the workspace also reads at `GET /api/workspaces/{slug}/delivery/evidence/key` (the key that seals today,
and the keys that sealed before, with the dates they were used):

```bash
npm run verify -- evidence-run-42.json --key sha256:<the key id the operator publishes>
```

With `--key`, a record without a seal, or sealed by another key, fails. Without it, the seal is only a warning, and the
first line of the output says that anyone can make it. Or check the signature with OpenSSL alone: write the PAE bytes to a file, the signature (`sig`, base64-decoded) to another, and the public
key (`publicKey`, base64-decoded, as DER) to a third, then
`openssl pkeyutl -verify -pubin -keyform DER -inkey key.der -rawin -in pae.bin -sigfile sig.bin`.

### Witness

At the end of the mission, the server writes the sealed head in the mission's pull request, then keeps a `note` of kind
`witness` (`root`, `seq`, `key`, `pullRequest`, `comment`, or `written: false` and its `reason`). GitHub dates the
comment: a chain rewritten afterwards no longer holds that head. The comment carries the head and the id of the key
that sealed it (`key`), from the desktop app too: compare the key id you are given with the one in the comment, which
the operator does not hold alone. It never names a workspace, a mission number, a person or a host. It links the
verification page only when GitHub says the repository is private, never from the desktop app or to the machine
itself: the link is `<the instance's address>/verify/<id>`, where `id` is an opaque, random id of the record (128
bits), and the page asks for a sign-in and checks access as any other. `pageLinked`, and `pageLeftOut` (`desktop-app`,
`turned-off` when the operator sets `witness-link: false`, `local-address`, `visibility-unknown`, `public-repository`,
`internal-repository`). Before posting, and before each new attempt, the server looks for any sealed head of the record
among the comments that the account of its token wrote (`user.login`, read once): someone who quotes the head does not
count, and a comment is never edited. A list it cannot read whole (an answer it cannot read, more than 1,000 comments)
is a failure, and it does not post. When GitHub does not say whether it wrote the comment (no answer in time, an error
on its side), the server does not post again at once: a regular pass looks for it later, so a reply lost after the
comment was written should not make a second one. A witness that GitHub prevents is tried again by that pass during the
seven days after the end, looking first each time; then the pass looks once more, and gives up. The record keeps at most
two `witness` notes: the first failure (`written: false`, `retrying: true` and the `reason`), then the outcome, written
or given up (`written: false`, `abandoned: true`). A note that cannot be kept ends the attempts. A mission without a pull
request gets one `witness` note, with `written: false` and the reason. `example-mission.json` is the export of a whole mission, sealed by a key
drawn for it; both sides check it.

## Mission steps: two codes, one set of cases

A mission goes through five steps: `understand`, `plan`, `do`, `check`, `handover`. The screen draws them from a
mission's timeline, and the server gives the current one with each mission of a project, so that the workflow view
does not read every timeline. Here the rules are written twice, in TypeScript (`missionSequence`, the step marked
`current`) and in Java (`MissionSteps.current`), and `mission-steps/cases.json` keeps them together: the frontend's
`mission-sequence.test.ts` and the server's `MissionStepsContractTest` replay every case. A rule changed on one side
only fails one of them; a new rule comes with its case.
