# Processes: the model, the BPMN 2.0 subset and the `tf:` extension

A process is a versioned definition of steps (ADR-027, council sessions 24 and 25). Its reference form is TaskForce's
own model, as data, `taskforce-process/1`; BPMN 2.0 XML is how it is exported and imported. The interface shows and
edits a process in words, never with BPMN's notation. Nobody writes code, an expression or XML: a condition is a
sentence plus the step and the result it depends on, which code judges.

The code: `backend/tf-api/src/main/java/com/taskforce/tf_api/core/process` (`ProcessModel`, `ProcessValidator`,
`ProcessSubset`, `ProcessFingerprint`, `BpmnExport`, `BpmnImport`), with no database, Spring or model in it.

## The files here

| File | What it is | Proved by |
| --- | --- | --- |
| `integrate-a-module.bpmn` | The first default workflow, of software delivery ("integrate a module", E20), as TaskForce exports it. Open it in any BPMN modeler. | `ProcessContractTest`: it is the export of the model, valid for the BPMN 2.0 XSD and for `taskforce-process-1.xsd` |
| `round-trip/*.bpmn` | The same file as a modeler rewrites it: bpmn-moddle, the model library of bpmn.io under Camunda's modelers, and Camunda's Web Modeler (8.10) itself | `integrate-a-module.bpmn-moddle.bpmn` is written by `frontend/lib/process/bpmn-moddle.test.ts`; `integrate-a-module.camunda-web-modeler.bpmn` was opened in Camunda's Web Modeler and downloaded unchanged on 15/11/2026; `ProcessContractTest` imports each one and finds the same fingerprint |
| `taskforce-process-1.xsd` | The XML Schema of the `tf:` extension | the same contract test validates the export against it |

The default workflow itself lives with the backend, as a model:
`backend/tf-api/src/main/resources/process/defaults/integrate-a-module.json`. The output schema of a draft (what a model
writes when it proposes a process) is `backend/tf-api/src/main/resources/process/taskforce-process-draft-1.schema.json`.

After a wanted change of the export: run `ProcessContractTest` with `-Dprocess.contracts.write=true`, then the
bpmn-moddle test with `PROCESS_CONTRACTS_WRITE=1`, then `ProcessContractTest` again.

## The model

A process has a `key` (lowercase letters, digits and dashes, the key a rule layer of scope `process` names), a `name`,
a `description`, the default workflow it was `derivedFrom`, its `steps` and its `flows` (paths). Steps nest:

- the process holds its start, its ends, its stages (the columns of the view), the decisions and the paths in parallel
  between stages, and the deadline or failure path of a stage;
- a stage holds its start, its end and its steps;
- an agent zone holds agent steps only, with no path inside: the agent chooses their order.

Five types of steps, and no sixth before E20 needs one: `agent`, `human`, `decision`, `wait`, `zone`. The rest is
structure: `start`, `end` (`terminate`: it stops the whole process), `stage`, `parallel`, `deadline`, `failure`.

## The J2 subset of BPMN 2.0

Taken mostly from the "Common Executable" conformance subclass of BPMN 2.0.2, plus the ad hoc zone and the boundary
timer, without claiming the subclass's conformance. It is frozen on what the process of E20 needs: a test checks that
the export of "integrate a module" uses each of these elements, and no other one.

| BPMN 2.0 element | In TaskForce's model |
| --- | --- |
| `definitions`, one `process` | the process: its key is the process `id`, its name the process `name` |
| `documentation` | the description of the process or of a step |
| `extensionElements` | where the `tf:` extension travels |
| `startEvent`, with no trigger | `start` |
| `endEvent`; with `terminateEventDefinition`, at the top level only | `end`; `end` that stops the whole process |
| `subProcess` (embedded), at the top level only | `stage`, a column of the view |
| `adHocSubProcess`, holding `serviceTask`s only | `zone`, what an agent may do in the order it chooses, under rules |
| `serviceTask`, inside an `adHocSubProcess` | `agent` step |
| `userTask` | `human` task: an approval, a typed input or a checklist |
| `exclusiveGateway`, with `default` | `decision` |
| `parallelGateway` | paths in `parallel`: a split, or a join |
| `intermediateCatchEvent` with `timerEventDefinition` / `timeDuration` | `wait` for a duration (ISO 8601) |
| `intermediateCatchEvent` with `messageEventDefinition`, and its `message` | `wait` for what a person provides (a document, an answer) |
| `boundaryEvent` with `timerEventDefinition` / `timeDuration`, interrupting | `deadline` of a human task, an agent zone or a stage |
| `boundaryEvent` with `errorEventDefinition` | `failure` path of an agent zone or a stage |
| `sequenceFlow`, with `conditionExpression` | path; the expression holds the condition's words, `tf:condition` what code judges |
| `incoming`, `outgoing` | written on export, derived from the paths |
| BPMN DI (`BPMNDiagram`, `BPMNPlane`, `BPMNShape`, `BPMNEdge`, `Bounds`, `waypoint`) | the drawing: computed on export, ignored on import, outside the fingerprint |

Refused on import, each with its reason in words (`ProcessSubset`): the inclusive and the complex gateways, the
event-based gateway, multi-instance and loops, event subprocesses, transactions and cancel events, signals,
escalations, compensation, conditional and link events, data objects and data stores, lanes, pools and message flows
(collaborations), business rule tasks (DMN), script, send, receive and manual tasks, tasks of no kind, call activities,
throw events, starts on a trigger, ends that send an event, timers on a date or a cycle, non-interrupting deadlines,
other boundary events, and a file with several processes. Notes drawn on a diagram (text annotations, associations,
groups) and the settings of another tool in `extensionElements` are left out, and the import says so.

## The `tf:` extension, version 1

Namespace `https://taskforce-project.fr/schema/process/1`, schema `taskforce-process-1.xsd`. It carries what BPMN does
not; a modeler that ignores it keeps the process readable (names, paths, the words of conditions, waits and deadlines
are BPMN), and a round trip keeps it.

| Element | Where | What it carries |
| --- | --- | --- |
| `tf:process` `format` `derivedFrom` | the process | the format of the model; the default workflow it derives from |
| `tf:step` `answeredBy` `lock` `lockRef` `issue` | every step | who answers for the step (`person:<id>`, `role:owner`, `role:admin`, `project-lead`); its lock and the source of the lock (`floor`, `rule`, `author`, `pause-point`) with its reference (for a pause point: `before-mission`, `before-apply`, `before-delivery`); the issue it carries, by its key |
| `tf:agent` `provider` `model` `attempts` `timeout`, `tf:tool` `name` | an agent step | the agent (`claude-code`, `cortex`...), its model (none: the workspace's), the company tools it may use, its attempts (three at most, then an incident) and its time limit |
| `tf:human` `who` `kind` `meaning` `question`, `tf:item` `text`, `tf:field` `id` `label` `type`, `tf:choice` `value` | a human task | who does it, what it asks, its kind (`approval`, `input`, `checklist`), what signing it means (`review`, `approval`, `responsibility`, `authorship`), the lines of its checklist (under ten), the typed fields of an input |
| `tf:wait` `from` | a wait for something provided | who must provide it |
| `tf:rule` `ref` `version` | a step | a rule that applies to it, and the version of its layer when it is known |
| `tf:document` `name` | a step | a document it expects |
| `tf:condition` `step` `outcome` | a path out of a decision | what code judges: the result of an earlier step (an approval is `approved` or `refused`; an agent step or zone `succeeded` or `failed`) |

## The validator

One validator, in code, for everything that comes in: the import, a model's draft, the editor, the publication. It
refuses, with a sentence and a code, every element outside the subset and every fault ADR-027 names: a step with no one
who answers for it, an agent step outside an agent zone or with no rules (its own or its zone's), a locked step of the
version it replaces or of its default workflow that is missing or no longer locked, a missing pause point (as soon as
agents work in the process, the three of TF-J2-10 are there, in order, and no agent zone starts before the first), a
decision path judged on words alone, a wait that doesn't say what it waits for, a step that leads to no end. It also
refuses what makes the structure unclear: a container without exactly one start or without an end, a step outside a
stage, a stage inside a stage, a path between two stages, a step with several paths out, a decision without its path
for every other case, a condition on a step that doesn't come before the decision or can't have that result, an
unreachable step, unknown people or rules, a checklist of ten lines or more, durations and identifiers that aren't
ones. `ProcessValidatorTest` holds one case per refusal.

## The fingerprint

`sha256:` and the SHA-256 of the canonical JSON (`../README.md`, Evidence, rule 4) of the model, with its steps and
paths sorted by identifier, its rules and tools sorted, and no null, empty or false member: a modeler that reorders
the file or moves its shapes doesn't change it; a word, a step or a setting does. The order of a checklist's lines, of
an input's fields and of the expected documents counts.
