import { describe, expect, it } from "vitest"

import type { DeliveryRun, DeliveryRunApproval, DeliveryRunEvent } from "@/lib/api/delivery-service"
import { CONSTANTS_EN } from "@/lib/constants_en"
import {
  approvalLine, approvalsSentence, collapseRepeats, missionModel, missionSequence, requestWant, requestWords,
  type MissionLine, type MissionStepKey, type MissionStepState,
} from "./mission-sequence"

const t = CONSTANTS_EN.missionSequence

const RUN: DeliveryRun = {
  id: 8, issueId: 308, issueKey: "SOLO-151", issueTitle: "Recette 1.13", projectId: 6, projectName: "Solo Initiatives",
  providerKey: "claude-code", model: null, status: "RUNNING", summary: null, resultUrl: null, error: null, startedById: 7,
  startedByName: "Pierre", createdAt: "2026-11-09T00:44:00", updatedAt: "2026-11-09T00:44:30", claimedAt: "2026-11-09T00:44:30",
  endedAt: null, outcome: null,
}

let seq = 0
const ev = (kind: DeliveryRunEvent["kind"], tool: string | null, text: string): DeliveryRunEvent =>
  ({ seq: ++seq, kind, tool, text, at: "2026-11-09T00:45:00" })

// La mission de la recette, ligne à ligne (s08 et s09 de la recette 1.13), chemins du poste anonymisés.
const SCRATCH = "C:\\Users\\someone\\AppData\\Roaming\\TaskForce\\accounts\\acc\\runner\\scratch\\run-8"
const RESULTS = "C:\\Users\\someone\\.claude\\projects\\run-8\\tool-results"
const COMMENT_START = '{"projectId":6,"issueId":308,"content":"# Cahier de recette \u2014 Solo Initiatives **v1.13**\\n\\n**R\u00e9f.** SOLO-151 \u00b7 **Version vis\u00e9e** 1.13 \u00b7 **R\u00e9dig\u00e9 le** 09/11/2026 \u00b7 **Statut** \u00c0 valider par le pilote de recette\\n**Partie 1/4 \u2014 Cadrage, organisation, crit\u00e8res**\\n\\n> \u26a0\ufe0f **Hypoth\u00e8se de cadrage, \u00e0 lev...'
const S08: readonly DeliveryRunEvent[] = [
  ev("start", null, "Claude Code 2.1.312 started with claude-opus-5"),
  ev("text", null, "I'll start by getting the issue context and searching the workspace notes."),
  ev("tool", "taskforce: get_issue", '{"projectId":6,"issueId":308}'),
  ev("tool", "taskforce: brain_search", '{"query":"recette version 1.13 Solo Initiatives","topK":10}'),
  ev("tool", "taskforce: list_issues", '{"projectId":6,"limit":200}'),
  ev("tool", "Bash", `cd "${RESULTS}" && python -I -c " import json d=json.load(open('mcp-taskforce-list_issues-1794181505448.txt',encoding='utf-8')) print(d['total'], d['returned']) print(json.dumps(d['issues'][0], ensure_ascii=False)[:1500]) "`),
  ev("tool", "Bash", `cd "${RESULTS}" && python -I -c " import json,re,collections d=json.load(open('mcp-taskforce-list_issues-1794181505448.txt',encoding='utf-8')) iss=d['issues'] # titles not matching 'Solo #N' odd=[i for i in iss if not re.fullmatch...`),
  ev("error", null, "Exit code 1 odd count 1 SOLO-151 | Recette 1.13 | Backlog | Crer une recette pour la version 1.13 du projet Solo Initiatives."),
  ev("text", null, "No scope document exists for 1.13 \u2014 let me verify that before building the deliverable."),
  ev("tool", "taskforce: brain_search", '{"query":"release note changelog version lot livraison recette tests acceptance","topK":8}'),
  ev("text", null, "Confirmed: no release note or scope note for 1.13 exists anywhere in the workspace. I'll build the full cahier de recette and state the assumption explicitly. Drafting:"),
  ev("tool", "Write", "c1.md"),
  ev("tool", "Write", "c2.md"),
  ev("tool", "Write", "c3.md"),
  ev("tool", "Write", "c4.md"),
  ev("tool", "Bash", `cd "${SCRATCH}" && python -I -c " for f in ['c1.md','c2.md','c3.md','c4.md']: print(f, len(open(f,encoding='utf-8').read())) "`),
  ev("tool", "Edit", "c4.md"),
  ev("text", null, "Now posting the four comments to SOLO-151:"),
  ev("tool", "Bash", `cd "${SCRATCH}" && python -I -c " print(open('c1.md',encoding='utf-8').read())" > /dev/null; echo ok`),
  ev("tool", "taskforce: add_comment", COMMENT_START),
  ev("tool", "taskforce: add_comment", '{"projectId":6,"issueId":308,"content":"# Cahier de recette \u2014 Solo Initiatives v1.13\\n**Partie 2/4 \u2014 Cas de test fonctionnels, domaines D1 \u00e0 D4**...'),
  ev("tool", "taskforce: add_comment", '{"projectId":6,"issueId":308,"content":"# Cahier de recette \u2014 Solo Initiatives v1.13\\n**Partie 3/4 \u2014 Cas de test fonctionnels, domaines D5 \u00e0 D8**...'),
  ev("tool", "taskforce: add_comment", '{"projectId":6,"issueId":308,"content":"# Cahier de recette \u2014 Solo Initiatives v1.13\\n**Partie 4/4 \u2014 Non-r\u00e9gression, tests transverses, gabarits de suivi**...'),
  ev("text", null, "Deliverable posted. Summary: ## What I produced A complete **cahier de recette (plan de tests d'acceptation) pour Solo Initiatives v1.13**, posted as 4 comments on **SOLO-151** (comments #142\u2013145): 1. **Partie 1/4 \u2014 Cadrage** : objectifs..."),
]
const lineOf = (n: number): DeliveryRunEvent => S08[n - 1]

const approval = (over: Partial<DeliveryRunApproval> = {}): DeliveryRunApproval => ({
  id: 1, tool: "Bash", summary: S08[5].text, status: "ALLOWED", createdAt: "2026-11-09T00:45:05", expiresAt: null,
  decidedAt: "2026-11-09T00:45:09", decidedBy: "Pierre", canDecide: false, scope: "MISSION", ...over,
})

const DONE: DeliveryRun = { ...RUN, status: "DONE", endedAt: "2026-11-09T00:54:20", summary: "Deliverable posted." }

const sequence = (run: DeliveryRun, events: readonly DeliveryRunEvent[], approvals: readonly DeliveryRunApproval[] = [], you = false) =>
  missionSequence(run, { events: [...events], approvals: [...approvals] }, t, you)
const stateOf = (run: DeliveryRun, events: readonly DeliveryRunEvent[], approvals: readonly DeliveryRunApproval[] = []) =>
  Object.fromEntries(sequence(run, events, approvals).steps.map((step) => [step.key, step.state]))
const step = (run: DeliveryRun, events: readonly DeliveryRunEvent[], key: MissionStepKey, approvals: readonly DeliveryRunApproval[] = []) => {
  const found = sequence(run, events, approvals).steps.find((s) => s.key === key)
  if (!found) throw new Error(key)
  return found
}
const sentences = (lines: readonly MissionLine[]): string[] => lines.map((line) => line.sentence)
const tool = (name: string, text: string): DeliveryRunEvent[] => [ev("tool", name, text)]

describe("missionSequence : la mission de la recette, ligne à ligne (s08, s09)", () => {
  it("always gives the same five steps, in order", () => {
    expect(sequence(RUN, []).steps.map((s) => s.name)).toEqual(["Understand", "Plan", "Do", "Check", "Hand over"])
  })

  it("puts reads and searches before the first write in Understand, in sentences", () => {
    expect(sentences(step(DONE, S08, "understand").lines)).toEqual([
      "Started",
      "Read the issue",
      "Searched your notes for recette version 1.13 Solo Initiatives",
      "Listed the project's issues",
      "Ran a script",
      "Ran a script",
      "That didn't work",
      "Searched your notes for release note changelog version lot livraison recette tests acceptance",
    ])
  })

  it("puts what the agent says it will do in Plan, and its plan is the sentence of the step", () => {
    const plan = step(DONE, S08, "plan")
    expect(sentences(plan.lines)).toEqual([
      "I'll start by getting the issue context and searching the workspace notes.",
      "No scope document exists for 1.13 \u2014 let me verify that before building the deliverable.",
      "Confirmed: no release note or scope note for 1.13 exists anywhere in the workspace. I'll build the full cahier de recette and state the assumption explicitly. Drafting:",
    ])
    expect(plan.sentence).toBe("I'll build the full cahier de recette and state the assumption explicitly.")
  })

  it("puts writes, edits and what comes after them in Do", () => {
    expect(sentences(step(DONE, S08, "do").lines)).toEqual([
      "Wrote c1.md", "Wrote c2.md", "Wrote c3.md", "Wrote c4.md", "Ran a script", "Edited c4.md",
      "Now posting the four comments to SOLO-151:", "Ran a script",
      "Commented on the issue", "Commented on the issue", "Commented on the issue", "Commented on the issue",
    ])
  })

  it("says in one sentence what each step did, counting the same gesture once", () => {
    expect(step(DONE, S08, "understand").sentence).toBe("Read the issue, searched your notes 2 times and listed the project's issues")
    expect(step(DONE, S08, "do").sentence).toBe("Wrote 4 files, edited c4.md and commented on the issue 4 times")
  })

  it("says that a step did not happen, in a word: no test ran", () => {
    expect(step(DONE, S08, "check")).toMatchObject({ state: "skipped", sentence: "No tests", lines: [] })
  })

  it("hands over the agent's final message, and waits for the person", () => {
    expect(step(DONE, S08, "handover")).toMatchObject({ state: "waiting", sentence: "Ready for your review", current: true })
    expect(sentences(step(DONE, S08, "handover").lines)).toEqual(["Wrote its account of the work"])
  })

  it("never shows a command, an id or a hash in a sentence", () => {
    const all = sequence(DONE, S08, [approval()], true).steps.flatMap((s) => [s.sentence, ...sentences(s.lines)])
    for (const sentence of all) {
      expect(sentence).not.toMatch(/\{|"projectId|taskforce:|get_issue|brain_search|add_comment|python|Bash|sha256|tool-results/)
    }
  })

  it("keeps the raw lines with their time, for the switch", () => {
    const line = step(DONE, S08, "understand").lines[1]
    expect(line).toMatchObject({ raw: 'taskforce: get_issue {"projectId":6,"issueId":308}', at: "2026-11-09T00:45:00" })
  })

  // Comment la mission avance : chaque rangée va du rond vide à l'anneau, puis à la coche, sans revenir en arrière.
  const S: Record<string, MissionStepState> = { o: "not-started", r: "in-progress", v: "done", x: "skipped" }
  it.each([
    ["nothing yet", 0, "r o o o o", "Reading up on the task"],
    ["it started", 1, "r o o o o", "Reading up on the task"],
    ["it says what it will read", 2, "r o o o o", "Reading up on the task"],
    ["it reads the issue", 3, "r o o o o", "Reading up on the task"],
    ["it runs a reading script: not a write", 6, "r o o o o", "Reading up on the task"],
    ["it says it will verify: not a plan yet", 9, "r o o o o", "Reading up on the task"],
    ["it says what it will build", 11, "v r o o o", "Working out what to do"],
    ["its first write", 12, "v v r o o", "Doing the work"],
    ["its last comment", 23, "v v r o o", "Doing the work"],
    ["its last words, before the run ends", 24, "v v r o o", "Doing the work"],
  ])("while it works, %s", (_label, count, expected, status) => {
    const running = sequence(RUN, S08.slice(0, count))
    expect(running.steps.map((s) => s.state)).toEqual(expected.split(" ").map((c) => S[c]))
    expect(running.status).toBe(status)
    expect(running.steps.filter((s) => s.current)).toHaveLength(1)
  })

  it("tells the latest gesture of the step at work", () => {
    expect(step(RUN, S08.slice(0, 3), "understand").sentence).toBe("Read the issue")
    expect(step(RUN, S08.slice(0, 4), "understand").sentence).toBe("Searched your notes for recette version 1.13 Solo Initiatives")
    expect(step(RUN, S08.slice(0, 14), "do").sentence).toBe("Wrote c3.md")
    expect(step(RUN, S08.slice(0, 18), "do").sentence).toBe("Now posting the four comments to SOLO-151:")
    expect(step(RUN, [], "understand").sentence).toBe("Getting started")
  })
})

describe("Sentences, never commands", () => {
  it.each([
    // Les lignes de la recette.
    ["taskforce: get_issue", '{"projectId":6,"issueId":308}', "Read the issue"],
    ["taskforce: brain_search", '{"query":"x"}', "Searched your notes for x"],
    ["taskforce: list_issues", '{"projectId":6,"limit":200}', "Listed the project's issues"],
    ["Write", "c1.md", "Wrote c1.md"],
    ["Bash", S08[5].text, "Ran a script"],
    ["taskforce: add_comment", COMMENT_START, "Commented on the issue"],
    ["Edit", "c4.md", "Edited c4.md"],
    // Les autres outils du serveur de TaskForce.
    ["taskforce: get_issue", '{"projectId":6,"issueId":12}', "Read another issue"],
    ["taskforce: get_issue", '{"issue":"SOLO-2"}', "Read another issue"],
    ["taskforce: get_issue", '{"issue":"SOLO-151"}', "Read the issue"],
    ["taskforce: list_projects", "", "Listed your projects"],
    ["taskforce: list_issue_statuses", '{"projectId":6}', "Read the project's columns"],
    ["taskforce: list_my_issues", "", "Listed your issues"],
    ["taskforce: workspace_kpis", "", "Read the workspace's numbers"],
    ["taskforce: get_mission", '{"issueId":308}', "Read where the mission stands"],
    ["taskforce: smart_assign", '{"issueId":308}', "Looked for the right person"],
    ["taskforce: ask_cortex", '{"question":"x"}', "Asked Cortex"],
    ["taskforce: create_issue", '{"title":"x"}', "Created an issue"],
    ["taskforce: update_issue", '{"issueId":308,"priority":"HIGH"}', "Updated the issue"],
    ["taskforce: check_checklist_item", '{"itemId":4}', "Checked an item of the checklist"],
    ["taskforce: delegate_issue", '{"issueId":3}', "Handed an issue to an agent"],
    ["taskforce: delete_issue", '{"issueId":3}', "Deleted an issue"],
    ["taskforce: create_project", '{"name":"x"}', "Created a project"],
    ["add_comment", "Posts its answer as a comment on SOLO-12", "Commented on the issue"],
    // Une recherche dont l'argument est coupé par le runner, ou absent.
    ["taskforce: brain_search", '{"query":"une longue recherche coup\\u00e9e...', "Searched your notes for une longue recherche coupée..."],
    ["taskforce: brain_search", '{"topK":3}', "Searched your notes"],
    ["taskforce: brain_search", '{"query":"bad \\q escape"}', "Searched your notes for bad \\q escape"],
    // Les outils de Claude Code.
    ["Read", "src/lib/footer.tsx", "Read footer.tsx"],
    ["Read", "C:\\work\\src\\footer.tsx", "Read footer.tsx"],
    ["Read", "", "Read a file"],
    ["NotebookRead", "notes/run.ipynb", "Read run.ipynb"],
    ["Glob", "**/*.tsx", "Looked for files"],
    ["LS", "src", "Looked through the folders"],
    ["Grep", "handleClick", "Searched the code for handleClick"],
    ["Grep", "foo.*bar\\(", "Searched the code"],
    ["WebFetch", "https://www.nodejs.org/en/about", "Opened nodejs.org"],
    ["WebFetch", "not a url", "Opened a web page"],
    ["WebSearch", "zustand persist", "Searched the web for zustand persist"],
    ["WebSearch", " ", "Searched the web"],
    ["Write", "src/links.ts", "Wrote links.ts"],
    ["Write", "", "Wrote a file"],
    ["Edit", "src/footer.tsx", "Edited footer.tsx"],
    ["MultiEdit", "src/footer.tsx", "Edited footer.tsx"],
    ["NotebookEdit", "notes/run.ipynb", "Edited run.ipynb"],
    ["TodoWrite", '{"todos":[]}', "Made a to-do list"],
    ["ExitPlanMode", '{"plan":"x"}', "Proposed a plan"],
    ["Task", '{"prompt":"x"}', "Asked a helper to look into it"],
    ["Agent", '{"prompt":"x"}', "Asked a helper to look into it"],
    ["Skill", '{"skill":"x"}', "Used one of its skills"],
    // Ce qui n'a pas encore de phrase : une phrase neutre, jamais la ligne brute.
    ["KillShell", '{"id":"x"}', "Used a tool"],
    ["taskforce: new_tool", '{"a":1}', "Used TaskForce"],
    ["github: list_issues", '{"a":1}', "Used a connected tool"],
    ["github: create_pr", '{"title":"x"}', "Used a connected tool"],
    ["github: triage", '{"a":1}', "Used a connected tool"],
    ["mystery", '{"a":1}', "Used a tool"],
  ])("%s %s", (name, text, expected) => {
    const lines = sequence(RUN, tool(name, text)).steps.flatMap((s) => s.lines)
    expect(lines.map((line) => line.sentence)).toEqual([expected])
  })

  it.each([
    // Un script n'écrit pas, à notre connaissance.
    ["python3 tools/a.py", "Ran a script"],
    ["node scripts/gen.js", "Ran a script"],
    ["bash ./run.sh", "Ran a script"],
    ['C:\\Python\\python.exe -I -c "print(1 > 0)"', "Ran a script"],
    ['cd "a b" && python -c "x=1; y=2"', "Ran a script"],
    ['python -c "import x; open(', "Ran a script"],
    ["npm run seed", "Ran a script"],
    // Les tests du projet.
    ["npm test", "Ran the project's tests"],
    ["npm run test:unit", "Ran the project's tests"],
    ["pnpm t", "Ran the project's tests"],
    ["npx vitest run --coverage", "Ran the project's tests"],
    ["CI=1 npx vitest run", "Ran the project's tests"],
    ["pytest -q", "Ran the project's tests"],
    ["python -m pytest", "Ran the project's tests"],
    ["python -I -m unittest", "Ran the project's tests"],
    ["node --test", "Ran the project's tests"],
    ["mvn -q -o clean test", "Ran the project's tests"],
    ["./mvnw verify", "Ran the project's tests"],
    ["./gradlew test", "Ran the project's tests"],
    ["go test ./...", "Ran the project's tests"],
    ["cargo test", "Ran the project's tests"],
    ["dotnet test", "Ran the project's tests"],
    ["make test", "Ran the project's tests"],
    ["npx playwright test", "Ran the project's tests"],
    ["npx cypress run", "Ran the project's tests"],
    ["npm install && npm test", "Ran the project's tests"],
    // Les vérifications du code.
    ["npm run lint", "Checked the code"],
    ["npx tsc --noEmit", "Checked the code"],
    ["eslint .", "Checked the code"],
    ["python -m mypy src", "Checked the code"],
    ["prettier --check .", "Checked the code"],
    ["go vet ./...", "Checked the code"],
    // Construire, installer.
    ["npm run build", "Built the project"],
    ["npx tsc", "Built the project"],
    ["mvn package", "Built the project"],
    ["cargo build", "Built the project"],
    ["npm ci", "Installed what the project needs"],
    ["yarn", "Installed what the project needs"],
    ["pip install -r requirements.txt", "Installed what the project needs"],
    ["python -m pip install x", "Installed what the project needs"],
    // Lire.
    ["git status", "Looked at the project's history"],
    ["git log --oneline -5", "Looked at the project's history"],
    ["git branch", "Looked at the project's history"],
    ["ls -la", "Looked through the folders"],
    ["find . -name x", "Looked through the folders"],
    ["cat a.txt", "Looked inside a file"],
    ["sed -n 1,5p a.txt", "Looked inside a file"],
    ["grep -rn foo src", "Searched the code"],
    ["cd src && ls", "Looked through the folders"],
    ["gh pr view 3", "Used GitHub"],
    ["gh auth status", "Used GitHub"],
    // Changer.
    ["git commit -m x", "Saved the changes"],
    ["git add -A && git commit -m x", "Saved the changes"],
    ["git checkout -b feat/x", "Created a branch"],
    ["git switch main", "Changed branch"],
    ["git branch feat/x", "Created a branch"],
    ["git push origin x", "Sent the branch to the repository"],
    ["git rebase main", "Reworked the changes"],
    ["git frobnicate", "Ran a command"],
    ["gh pr create --fill", "Opened a pull request"],
    ["rm -rf build", "Deleted files"],
    ["mv a b", "Moved files"],
    ["cp a b", "Copied files"],
    ["mkdir -p x", "Created a folder"],
    ["touch src/new.ts", "Wrote new.ts"],
    ["sed -i s/a/b/ x.txt", "Edited a file"],
    ["echo hello > notes/a.txt", "Wrote a.txt"],
    ["cat >> c1.md <<EOF", "Wrote c1.md"],
    ['echo x > "my file.txt"', "Wrote a file"],
    // Rien de notable, ou inconnu.
    ["echo ok", "Ran a command"],
    ["cd src", "Ran a command"],
    ["", "Ran a command"],
    ["frobnicate --all", "Ran a command"],
    ["mvn dependency:tree", "Ran a command"],
    ["python x.py 2>&1", "Ran a script"],
    ["python x.py 2> err.log", "Ran a script"],
    ["FOO=bar sudo python x.py", "Ran a script"],
  ])("Bash %s", (command, expected) => {
    expect(sequence(RUN, tool("Bash", command)).steps.flatMap((s) => s.lines).map((line) => line.sentence)).toEqual([expected])
  })

  it.each([
    ["denied", "Bash", "Permission denied", "Not allowed by your rules: run a command"],
    ["denied", "WebFetch", "Denied", "Not allowed by your rules: open a web page"],
  ])("a refused action says so: %s %s", (kind, name, text, expected) => {
    const lines = sequence(RUN, [ev(kind as "denied", name, text)]).steps.flatMap((s) => s.lines)
    expect(lines).toMatchObject([{ sentence: expected, failed: true }])
  })

  it("a kind the app doesn't know yet gets a neutral sentence", () => {
    const lines = sequence(RUN, [ev("start", null, "x"), ev("note" as "text", null, "x {raw}")]).steps.flatMap((s) => s.lines)
    expect(lines.map((line) => line.sentence)).toEqual(["Started", "Did something else"])
  })

  it("the agent's words lose their Markdown marks", () => {
    const plan = step(RUN, [ev("text", null, "## Plan\nI will **fix** the `footer`")], "plan")
    expect(sentences(plan.lines)).toEqual(["Plan I will fix the footer"])
  })
})

describe("Understand, Do: where a gesture falls", () => {
  it("a read after the first write belongs to Do", () => {
    const events = [ev("tool", "Write", "a.ts"), ev("tool", "Read", "b.ts"), ev("text", null, "Next.")]
    expect(step(RUN, events, "understand").lines).toEqual([])
    expect(sentences(step(RUN, events, "do").lines)).toEqual(["Wrote a.ts", "Read b.ts", "Next."])
  })

  it("a command that changes things opens Do; a script doesn't", () => {
    expect(stateOf(RUN, tool("Bash", "git commit -m x")).do).toBe("in-progress")
    expect(stateOf(RUN, tool("Bash", "python x.py")).do).toBe("not-started")
  })

  it("the plan gestures count as Plan before the first write, and as Do after it", () => {
    const before = [ev("tool", "Read", "a.ts"), ev("tool", "TodoWrite", "{}")]
    expect(stateOf(RUN, before)).toMatchObject({ understand: "done", plan: "in-progress" })
    expect(step(RUN, before, "plan").sentence).toBe("Made a to-do list")
    const after = [ev("tool", "Write", "a.ts"), ev("tool", "TodoWrite", "{}")]
    expect(sentences(step(RUN, after, "do").lines)).toEqual(["Wrote a.ts", "Made a to-do list"])
  })

  it("says Plan and Understand were skipped when the agent wrote straight away", () => {
    const skipped = sequence(RUN, [ev("tool", "Write", "a.ts")]).steps
    expect(skipped[0]).toMatchObject({ state: "skipped", sentence: "Skipped" })
    expect(skipped[1]).toMatchObject({ state: "skipped", sentence: "Skipped" })
  })

  it("a French announcement is a plan too; what it will read is not", () => {
    const read = ev("tool", "Read", "a.ts")
    expect(stateOf(RUN, [read, ev("text", null, "Je vais rédiger le plan de tests.")]).plan).toBe("in-progress")
    expect(stateOf(RUN, [read, ev("text", null, "Je vais vérifier le dépôt.")]).plan).toBe("not-started")
    expect(stateOf(RUN, [read, ev("text", null, "I will first look at the tests.")]).plan).toBe("not-started")
  })

  it("an announcement before any read isn't a plan yet", () => {
    expect(stateOf(RUN, [ev("text", null, "I'll fix the footer.")]).plan).toBe("not-started")
  })

  it("the sentence of Plan falls back on the agent's last words", () => {
    expect(step(DONE, [ev("text", null, "Looks simple. More later."), ev("tool", "Read", "a.ts")], "plan").sentence).toBe("Looks simple.")
  })

  it("a step with only neutral gestures still says them", () => {
    expect(step(DONE, tool("Bash", "python x.py"), "understand").sentence).toBe("Ran a script")
    expect(step(DONE, [...tool("Bash", "python x.py"), ...tool("Bash", "python y.py")], "understand").sentence).toBe("Ran 2 scripts")
  })

  it("counts files once, and names the only one", () => {
    const events = [...tool("Read", "a.ts"), ...tool("Read", "a.ts")]
    expect(step(DONE, events, "understand").sentence).toBe("Read a.ts")
    expect(step(DONE, [...events, ...tool("Read", "b.ts")], "understand").sentence).toBe("Read 2 files")
  })

  it("says at most three things", () => {
    const events = [
      ...tool("Read", "a.ts"), ...tool("Glob", "*"), ...tool("Grep", "x"), ...tool("WebSearch", "y"),
    ]
    expect(step(DONE, events, "understand").sentence).toBe("Read a.ts, looked for files and searched the code for x")
  })
})

describe("Check: the project's tests", () => {
  const edit = ev("tool", "Edit", "a.ts")

  it("the runner's tests are Check", () => {
    const events = [edit, ev("test", "npm test", "Tests passed: `npm test` (3 s).\nok")]
    expect(sentences(step(RUN, events, "check").lines)).toEqual(["Tests passed"])
    expect(stateOf(RUN, events)).toMatchObject({ do: "done", check: "in-progress" })
  })

  it.each([
    ["Tests failed: `npm test` exited with code 1 (3 s).", "Tests failed", true],
    ["Tests not run: `npm test` was not allowed on this computer.", "Tests not run", false],
    ["Tests stopped after 3 s: `npm test` took too long.", "Tests took too long", true],
    ["Something else", "Ran the project's tests", false],
  ])("%s", (text, expected, failed) => {
    expect(step(RUN, [ev("test", "npm test", text)], "check").lines).toMatchObject([{ sentence: expected, failed }])
  })

  it.each([
    ["counted", { ran: true, passed: true, passedCount: 12, total: 12 }, "done", "Tests passed: 12 of 12"],
    ["passed, not counted", { ran: true, passed: true, passedCount: null, total: null }, "done", "Tests passed"],
    ["failed, counted", { ran: true, passed: false, passedCount: 10, total: 12 }, "failed", "Tests failed: 10 of 12 passed"],
    ["failed, not counted", { ran: true, passed: false, passedCount: null, total: null }, "failed", "Tests failed"],
    ["not allowed", { ran: false, passed: false, passedCount: null, total: null }, "skipped", "Tests not run"],
  ])("the result of the mission says how they went: %s", (_label, tests, state, sentence) => {
    const run = { ...DONE, tests: { command: "npm test", ...tests } }
    expect(step(run, [edit, ev("test", "npm test", "x")], "check")).toMatchObject({ state, sentence })
  })

  it("the agent's own run of the tests is Check, and it goes back to Do when it edits again", () => {
    const events = [edit, ...tool("Bash", "npm test")]
    expect(stateOf(RUN, events)).toMatchObject({ do: "done", check: "in-progress" })
    expect(step(RUN, events, "check").sentence).toBe("Ran the project's tests")
    expect(stateOf(RUN, [...events, ev("tool", "Edit", "b.ts")])).toMatchObject({ do: "in-progress", check: "done" })
    expect(step(DONE, events, "check").sentence).toBe("Ran the project's tests")
  })
})

describe("Hand over: the end of the mission", () => {
  it("tells the exits of the runner", () => {
    const events = [
      ev("tool", "Edit", "a.ts"),
      ev("exit", "git push", "allowed by the rule push-feature"),
      ev("exit", "gh pr create", "allowed in TaskForce (asked)"),
    ]
    expect(sentences(step(DONE, events, "handover").lines)).toEqual(["Sent the branch to the repository", "Opened a pull request"])
    expect(stateOf(RUN, events).handover).toBe("in-progress")
  })

  it("says when an exit was refused", () => {
    const events = [ev("exit", "git push", "not allowed in TaskForce (asked)"), ev("exit", "gh pr create", "refused by the rule no-pr: x")]
    expect(sentences(step(DONE, events, "handover").lines)).toEqual(["Didn't send the branch: it wasn't allowed", "Didn't open a pull request: it wasn't allowed"])
  })

  it.each([
    ["APPLIED", "Applied: the pull request is merged"],
    ["DISCARDED", "Discarded"],
    ["MARKED_DONE", "Marked as done"],
    ["RETRIED", "Replaced by a new try"],
  ] as const)("once decided, says what became of it: %s", (outcome, sentence) => {
    const seq = sequence({ ...DONE, outcome }, S08)
    expect(seq.status).toBe(sentence)
    expect(seq.steps[4]).toMatchObject({ state: "done", sentence })
  })

  it("the last words of a finished mission are the hand-over only when no action followed", () => {
    const events = [ev("text", null, "Done."), ev("tool", "Read", "a.ts")]
    expect(step(DONE, events, "plan").lines).toHaveLength(1)
    expect(step(DONE, events, "handover").lines).toEqual([])
    expect(step(DONE, [ev("text", null, "Done."), ev("exit", "git push", "allowed")], "handover").lines).toHaveLength(2)
  })
})

describe("Waiting for you", () => {
  const pending = (over: Partial<DeliveryRunApproval> = {}) => approval({ status: "PENDING", decidedAt: null, decidedBy: null, canDecide: true, scope: null, ...over })

  it("the step of the request waits, and says what the agent wants, not the command", () => {
    const events = S08.slice(0, 5)
    const seq = sequence(RUN, events, [pending()])
    expect(seq.status).toBe("Waiting for you: 1 request")
    expect(seq.steps[0]).toMatchObject({ state: "waiting", sentence: "Wants to run a script", current: true })
  })

  it("counts the requests", () => {
    expect(sequence(RUN, [], [pending(), pending({ id: 2 })]).status).toBe("Waiting for you: 2 requests")
  })

  it("says who it waits for when it's someone else", () => {
    expect(sequence(RUN, [], [pending({ canDecide: false })]).status).toBe("Waiting for Pierre: 1 request")
    expect(sequence({ ...RUN, startedByName: null }, [], [pending({ canDecide: false }), pending({ id: 2, canDecide: false })]).status)
      .toBe("Waiting for the person who delegated: 2 requests")
  })

  it.each([
    ["a write", { tool: "Write", summary: "a.ts" }, "do", "Wants to write a.ts"],
    ["the start of the mission", { tool: "Start the mission", summary: "Start SOLO-151" }, "understand", "Wants to start the mission"],
    ["the project's tests", { tool: "Run the project's tests", summary: "`npm test` in acme/x" }, "check", "Wants to run the project's tests"],
    ["a push", { tool: "git push", summary: "Push the branch x" }, "handover", "Wants to send the branch to the repository"],
    ["a pull request", { tool: "gh pr create", summary: "Open a pull request" }, "handover", "Wants to open a pull request"],
    ["a page", { tool: "WebFetch", summary: "https://nodejs.org" }, "understand", "Wants to open nodejs.org"],
  ])("%s waits in the right step", (_label, asked, key, sentence) => {
    const found = sequence(RUN, [], [pending(asked)]).steps.find((s) => s.current)
    expect(found).toMatchObject({ key, state: "waiting", sentence })
  })

  it("a request answered doesn't wait anymore", () => {
    expect(sequence(RUN, [], [approval()]).status).toBe("Reading up on the task")
  })

  it("requests don't wait after the mission ended", () => {
    expect(sequence(DONE, S08, [pending()]).status).toBe("Ready for your review")
  })
})

describe("When it doesn't go to the end", () => {
  it("queued: nothing started, and it says what it waits for", () => {
    const queued = sequence({ ...RUN, status: "QUEUED" }, [])
    expect(queued.status).toBe("Waiting for your runner to pick it up")
    expect(queued.steps.map((s) => s.state)).toEqual(Array(5).fill("not-started"))
    expect(queued.steps[1].sentence).toBe("Not started")
  })

  const failed: DeliveryRun = { ...RUN, status: "FAILED", error: "The runner stopped. Delegate the task again." }

  it("failed: says what happened, and where", () => {
    const seq = sequence(failed, S08.slice(0, 13))
    expect(seq.status).toBe("It stopped before the end: The runner stopped. Delegate the task again.")
    expect(seq.steps.map((s) => [s.state, s.sentence])).toEqual([
      ["done", "Read the issue, searched your notes 2 times and listed the project's issues"],
      ["done", "I'll build the full cahier de recette and state the assumption explicitly."],
      ["failed", "It stopped here"],
      ["skipped", "Not reached"],
      ["skipped", "Nothing handed over"],
    ])
    expect(seq.steps[2].current).toBe(true)
  })

  it("failed without a reason still says what to do", () => {
    expect(sequence({ ...failed, error: null }, []).status).toBe("It stopped before the end. Delegate the issue again to retry.")
  })

  it("failed before anything: the first step is where it stopped", () => {
    expect(sequence(failed, []).steps[0]).toMatchObject({ state: "failed", current: true })
  })

  it("failed after a step with nothing in it: it says skipped, not reached is for what comes after", () => {
    const seq = sequence(failed, [ev("tool", "Write", "a.ts")])
    expect(seq.steps[0]).toMatchObject({ state: "skipped", sentence: "Skipped" })
  })

  it("stopped by the person: it isn't a failure, and it says who", () => {
    const stopped = { ...failed, outcome: "STOPPED" as const }
    expect(sequence(stopped, S08.slice(0, 13), [], true).status).toBe("Stopped by you")
    expect(sequence(stopped, S08.slice(0, 13), [], false).status).toBe("Stopped by Pierre")
    expect(sequence({ ...stopped, startedByName: " " }, []).status).toBe("Stopped by the person who delegated")
    expect(sequence(stopped, S08.slice(0, 13)).steps[2]).toMatchObject({ state: "stopped", sentence: "Stopped here" })
  })

  it("refused at the start: nothing started, and it says why", () => {
    const refused = { ...failed, refused: true, error: "This project's rules refuse a public repository." }
    const seq = sequence(refused, [])
    expect(seq.status).toBe("Not started: This project's rules refuse a public repository.")
    expect(seq.steps.map((s) => s.state)).toEqual(Array(5).fill("not-started"))
    expect(sequence({ ...refused, error: null }, []).status).toBe("Not started")
  })

  it("a mission without a timeline yet reads the same", () => {
    expect(missionSequence(RUN, undefined, t).status).toBe("Reading up on the task")
  })
})

describe("The limit of the timeline, and an error", () => {
  it("stay in the step they follow", () => {
    const events = [ev("tool", "Write", "a.ts"), ev("limit", null, "The runner sent 10000 events"), ev("error", null, "x")]
    expect(sentences(step(RUN, events, "do").lines)).toEqual([
      "Wrote a.ts", "The list stops here: the mission's record keeps the rest", "That didn't work",
    ])
  })
})

describe("collapseRepeats", () => {
  const line = (seq: number, sentence: string, failed = false): MissionLine => ({ seq, sentence, raw: null, at: null, failed })

  it("reads four comments on one line", () => {
    expect(collapseRepeats([line(1, "a"), line(2, "b"), line(3, "b"), line(4, "b"), line(5, "a")]).map((entry) => [entry.line.sentence, entry.times]))
      .toEqual([["a", 1], ["b", 3], ["a", 1]])
  })

  it("keeps a failure apart", () => {
    expect(collapseRepeats([line(1, "a"), line(2, "a", true)])).toHaveLength(2)
  })
})

describe("Approvals say what was allowed, in sentences", () => {
  it.each([
    ["for the mission, by the viewer", approval(), true, "Ran a script: allowed by you for this mission"],
    ["for the mission, by someone else", approval(), false, "Ran a script: allowed by Pierre for this mission"],
    ["once", approval({ scope: "ONCE" }), true, "Ran a script: allowed by you"],
    ["no name known", approval({ decidedBy: null }), false, "Ran a script: allowed by the person who delegated for this mission"],
    ["refused", approval({ status: "DENIED", scope: null }), true, "Wanted to run a script: refused by you"],
    ["no answer", approval({ status: "EXPIRED", scope: null }), true, "Wanted to run a script: no answer in time, so refused"],
    ["still waiting", approval({ status: "PENDING" }), true, "Wants to run a script"],
  ])("%s", (_label, asked, you, sentence) => {
    expect(approvalLine(asked, RUN, t, you).sentence).toBe(sentence)
  })

  it("keeps the command and its time behind the switch", () => {
    expect(approvalLine(approval({ tool: "WebFetch", summary: "https://nodejs.org" }), RUN, t)).toMatchObject({
      raw: "WebFetch https://nodejs.org", at: "2026-11-09T00:45:09",
    })
    expect(approvalLine(approval({ tool: "", summary: "", decidedAt: null }), RUN, t)).toMatchObject({ raw: null, at: "2026-11-09T00:45:05" })
  })

  it.each([
    ["one, allowed", [approval()], true, "1 request, allowed by you"],
    ["two, allowed", [approval(), approval({ id: 2 })], true, "2 requests, allowed by you"],
    ["two, allowed by someone", [approval(), approval({ id: 2 })], false, "2 requests, allowed by Pierre"],
    ["no name", [approval({ decidedBy: null })], false, "1 request, allowed by the person who delegated"],
    ["one, refused", [approval({ status: "DENIED" })], true, "1 request, refused"],
    ["two, refused", [approval({ status: "DENIED" }), approval({ id: 2, status: "EXPIRED" })], true, "2 requests, refused"],
    ["mixed", [approval(), approval({ id: 2, status: "DENIED" }), approval({ id: 3 })], true, "3 requests: 2 allowed, 1 refused"],
  ])("sums them up in one sentence: %s", (_label, asked, you, sentence) => {
    expect(approvalsSentence(asked, t, you)).toBe(sentence)
  })

  it("a pending request reads in words", () => {
    expect(requestWords({ tool: "Bash", summary: S08[5].text }, RUN, t)).toBe("Run a script")
    expect(requestWant({ tool: "taskforce: delete_issue", summary: '{"issueId":3}' }, RUN, t)).toBe("delete an issue")
  })
})

describe("missionModel", () => {
  it.each([
    ["claude-opus-5", "Opus 5"],
    ["claude-opus-5-5", "Opus 5.5"],
    ["claude-sonnet-4-5-20250929", "Sonnet 4.5"],
    ["qwen3:8b", "qwen3:8b"],
  ])("%s", (id, name) => {
    expect(missionModel({ model: null }, [ev("start", null, `Claude Code 2.1.312 started with ${id}`)])).toBe(name)
  })

  it("prefers what actually ran, then what was asked", () => {
    expect(missionModel({ model: "claude-haiku-4-5" }, [lineOf(1)])).toBe("Opus 5")
    expect(missionModel({ model: "claude-haiku-4-5" }, [])).toBe("Haiku 4.5")
    expect(missionModel({ model: "claude-haiku-4-5" }, [ev("start", null, "Claude Code started")])).toBe("Haiku 4.5")
    expect(missionModel({ model: null }, [])).toBeNull()
  })
})
