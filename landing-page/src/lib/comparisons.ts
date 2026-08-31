/**
 * comparisons.ts - données des fiches `/vs/{key}`.
 *
 * RÈGLE (honnêteté + fair-play) : on mène par ce que le concurrent fait DE BIEN (crédibilité), on ne
 * dit jamais « il est mauvais ». Les différences sont formulées « not its focus », pas « ✗ ». Les
 * agents de code sont COMPLÉMENTAIRES - TaskForce les utilise comme assignés. `kind` change le cadrage.
 */

export type Comparison = {
  key: string;
  name: string;
  kind: "tracker" | "agent";
  lead: string;
  goodAt: string[];
  adds: string[];
  rows: { dim: string; them: string; us: string }[];
  together: string;
  bottomLine: string;
};

export const COMPARISONS: Record<string, Comparison> = {
  jira: {
    key: "jira",
    name: "Jira",
    kind: "tracker",
    lead: "Jira is a mature system of record for issues and workflows. TaskForce is the governed decision layer that can sit on top of it.",
    goodAt: [
      "Deep, configurable workflows and permissions at enterprise scale",
      "A huge ecosystem of integrations and add-ons",
      "Issue tracking, sprints and reporting teams already know",
    ],
    adds: [
      "AI drafts the spec, approach and breakdown - as reviewed artifacts, not tickets typed by hand",
      "A human approves each checkpoint, and the approval is recorded",
      "The reasoning behind each decision is kept in memory for the next run",
      "Coding agents are orchestrated as assignees, within the same governed flow",
    ],
    rows: [
      { dim: "Issue tracking", them: "Deep and mature", us: "Real-time board, issues and cycles" },
      { dim: "AI-drafted delivery artifacts", them: "Not its focus", us: "Spec, approach, breakdown - governed" },
      { dim: "Decision memory", them: "Not its focus", us: "Reasoning kept as a graph" },
      { dim: "Human approval as a primitive", them: "Workflow states", us: "A checkpoint sign-off, recorded" },
      { dim: "Coding-agent orchestration", them: "Not its focus", us: "Agents as assignees" },
    ],
    together: "Keep Jira as your tracker if it's your system of record. TaskForce adds the governed AI delivery layer above it - and a Jira connector is in the catalogue.",
    bottomLine: "Choose Jira for configurable enterprise tracking. Add TaskForce for governed, memory-backed AI delivery on top.",
  },
  linear: {
    key: "linear",
    name: "Linear",
    kind: "tracker",
    lead: "Linear is a fast, elegant tracker with a workflow teams love. TaskForce sits on the same kind of board and adds governed decisions, memory and AI orchestration.",
    goodAt: [
      "Exceptional speed and product design",
      "An opinionated, low-friction workflow with cycles",
      "A great developer experience out of the box",
    ],
    adds: [
      "The same board feel, plus validated checkpoints before work moves forward",
      "AI that drafts the spec and approach for a human to approve",
      "A memory of why decisions were made - not just what changed",
      "Orchestration of the coding agents your team already uses",
    ],
    rows: [
      { dim: "Board, issues, cycles", them: "Fast and elegant", us: "Real-time, same primitives" },
      { dim: "AI-drafted delivery artifacts", them: "Not its focus", us: "Governed spec / approach / breakdown" },
      { dim: "Decision memory", them: "Not its focus", us: "Reasoning kept for next time" },
      { dim: "Human approval as a primitive", them: "Not its focus", us: "A checkpoint sign-off, recorded" },
      { dim: "Coding-agent orchestration", them: "Not its focus", us: "Agents as assignees" },
    ],
    together: "If you love Linear's tracker, think of TaskForce as the decision and governance layer around the same kind of board.",
    bottomLine: "Choose Linear for a beautiful, fast tracker. Add TaskForce for the governed AI-delivery layer around it.",
  },
  notion: {
    key: "notion",
    name: "Notion",
    kind: "tracker",
    lead: "Notion is where flexible docs and wikis live. TaskForce makes the spec, the decision and the sign-off outputs of the run itself - not pages you maintain by hand.",
    goodAt: [
      "Flexible documents, wikis and databases",
      "A great home for freeform knowledge and notes",
      "Highly customizable to how a team likes to work",
    ],
    adds: [
      "Delivery artifacts - spec, decision, QA - produced by the run, not written from scratch",
      "A human approval attached to each artifact, and kept",
      "A memory graph of decisions, not documents you have to keep current",
      "The governed run that ties artifacts to the work that produced them",
    ],
    rows: [
      { dim: "Freeform docs & wikis", them: "Excellent", us: "Not its focus" },
      { dim: "Delivery artifacts from a run", them: "Written by hand", us: "Outputs of the run" },
      { dim: "Decision memory", them: "Pages you maintain", us: "A graph the run updates" },
      { dim: "Human approval as a primitive", them: "Not its focus", us: "A checkpoint sign-off, recorded" },
      { dim: "Coding-agent orchestration", them: "Not its focus", us: "Agents as assignees" },
    ],
    together: "Keep Notion for freeform knowledge. Let TaskForce produce the delivery artifacts as a byproduct of governed runs - a Notion connector is in the catalogue.",
    bottomLine: "Choose Notion for flexible docs. Use TaskForce when you want spec, decision and sign-off to be outputs of the work itself.",
  },
  shortcut: {
    key: "shortcut",
    name: "Shortcut",
    kind: "tracker",
    lead: "Shortcut is a developer-friendly tracker with stories, iterations and epics. TaskForce sits on the same kind of board and adds governed decisions, memory and AI orchestration.",
    goodAt: [
      "A clean, developer-oriented tracker",
      "Stories, iterations and epics that fit dev workflows",
      "Fast, focused project tracking",
    ],
    adds: [
      "AI that drafts the spec and approach for a human to approve",
      "A memory of why decisions were made, kept across runs",
      "A human sign-off at each checkpoint, recorded",
      "Orchestration of the coding agents your team already uses",
    ],
    rows: [
      { dim: "Stories, iterations, epics", them: "Its focus", us: "Real-time board, issues and cycles" },
      { dim: "AI-drafted delivery artifacts", them: "Not its focus", us: "Governed spec / approach / breakdown" },
      { dim: "Decision memory", them: "Not its focus", us: "Reasoning kept as a graph" },
      { dim: "Human approval as a primitive", them: "Not its focus", us: "A checkpoint sign-off, recorded" },
      { dim: "Coding-agent orchestration", them: "Not its focus", us: "Agents as assignees" },
    ],
    together: "If Shortcut is your tracker, TaskForce is the governed decision and memory layer around the same kind of board.",
    bottomLine: "Choose Shortcut for a developer-friendly tracker. Add TaskForce for the governed AI-delivery layer around it.",
  },
  "claude-code-alone": {
    key: "claude-code-alone",
    name: "Claude Code alone",
    kind: "agent",
    lead: "A coding agent writes and ships code fast. TaskForce frames the work first, keeps a human on each decision, remembers why - then hands the build to that same agent.",
    goodAt: [
      "Writing, editing and shipping code directly in your repo",
      "Fast, capable execution on well-scoped tasks",
      "Working the way your engineers already do",
    ],
    adds: [
      "Framing the work into a reviewed spec and approach before any code is written",
      "A human approval on each consequential decision, recorded",
      "Memory of the decisions and constraints, so the next task starts with context",
      "Routing the work to Claude Code as an assignee - same board, same review",
    ],
    rows: [
      { dim: "Writing & shipping code", them: "Its whole job", us: "Delegated to the agent you choose" },
      { dim: "Framing the work first", them: "Not its focus", us: "Governed spec & approach" },
      { dim: "Human approval as a primitive", them: "You review its output", us: "A checkpoint before and after" },
      { dim: "Decision memory", them: "Per-session context", us: "Kept across runs" },
      { dim: "Multi-agent orchestration", them: "One agent", us: "Specialized roles, one accountable chain" },
    ],
    together: "This isn't either/or. TaskForce uses Claude Code (or Cursor, or Copilot) as the executor - it governs the decisions around it and keeps the trail.",
    bottomLine: "Keep using your coding agent. Add TaskForce when you want the decisions around it framed, approved and remembered.",
  },
  devin: {
    key: "devin",
    name: "Devin",
    kind: "agent",
    lead: "Autonomous agents aim to do the whole job. TaskForce takes the opposite stance: keep people accountable at each checkpoint, and orchestrate the agent you choose.",
    goodAt: [
      "Attempting end-to-end tasks with minimal input",
      "Autonomous execution as a single agent",
      "A bet on how far autonomy can go",
    ],
    adds: [
      "A human decision at each checkpoint - governance is the point, not an option",
      "Model- and agent-agnostic orchestration, rather than a single closed loop",
      "The reasoning kept, so decisions are attributable long after the fact",
      "Freedom to use the coding agent you already trust as the executor",
    ],
    rows: [
      { dim: "Philosophy", them: "Autonomy", us: "Human-governed delivery" },
      { dim: "Human approval as a primitive", them: "Minimal by design", us: "Required at each checkpoint" },
      { dim: "Agent choice", them: "Its own agent", us: "Bring your own" },
      { dim: "Decision memory & attribution", them: "Not its focus", us: "Kept and attributable" },
      { dim: "Executes code", them: "Yes, autonomously", us: "Via the agent you choose" },
    ],
    together: "Different philosophies. If you want autonomy, that's Devin's bet. If you want humans accountable for each decision, that's TaskForce.",
    bottomLine: "Choose Devin for maximal autonomy. Choose TaskForce when a human must own each decision and the reasoning has to survive.",
  },
  cursor: {
    key: "cursor",
    name: "Cursor",
    kind: "agent",
    lead: "Cursor is an AI-native editor that helps you write code. TaskForce governs the delivery around it - and can route work to it as an assignee.",
    goodAt: [
      "An excellent AI-native coding editor",
      "Fast, in-context help while you write code",
      "A workflow developers enjoy",
    ],
    adds: [
      "Framing the work into a reviewed spec and approach before the editor opens",
      "A human approval on each decision, recorded",
      "Memory of the decisions behind the code",
      "Routing work to Cursor as an assignee within a governed run",
    ],
    rows: [
      { dim: "Writing code in the editor", them: "Its whole job", us: "Delegated to the editor/agent you use" },
      { dim: "Framing the work first", them: "Not its focus", us: "Governed spec & approach" },
      { dim: "Human approval as a primitive", them: "You review as you go", us: "A checkpoint, recorded" },
      { dim: "Decision memory", them: "Editor context", us: "Kept across runs" },
      { dim: "Delivery orchestration", them: "Not its focus", us: "A governed run end to end" },
    ],
    together: "Cursor for writing the code; TaskForce for the governed delivery around it. It can hand work to Cursor like any other assignee.",
    bottomLine: "Choose Cursor for the editor. Add TaskForce to govern and remember the decisions the code implements.",
  },
  copilot: {
    key: "copilot",
    name: "GitHub Copilot",
    kind: "agent",
    lead: "Copilot completes code as you type. TaskForce orchestrates the decisions that code is meant to implement, and keeps the trail.",
    goodAt: [
      "Fast, ubiquitous inline code completion",
      "A low-friction assist inside the editor",
      "Broad language and IDE coverage",
    ],
    adds: [
      "A reviewed spec and approach before the code exists",
      "A human approval on each consequential decision, recorded",
      "Memory of why the code is the way it is",
      "A governed run that ties the completion back to a decision",
    ],
    rows: [
      { dim: "Inline code completion", them: "Its whole job", us: "Not its focus" },
      { dim: "Framing the work first", them: "Not its focus", us: "Governed spec & approach" },
      { dim: "Human approval as a primitive", them: "You accept suggestions", us: "A checkpoint, recorded" },
      { dim: "Decision memory", them: "Not its focus", us: "Kept across runs" },
      { dim: "Delivery orchestration", them: "Not its focus", us: "A governed run end to end" },
    ],
    together: "Copilot speeds up writing code; TaskForce governs what the code is building toward. They work at different layers.",
    bottomLine: "Choose Copilot for completion. Add TaskForce to govern and remember the decisions behind the code.",
  },
};
