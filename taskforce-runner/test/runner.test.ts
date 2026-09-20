import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agentArgs, agentEnv, allowedTools, parseAgentOutput, safeModel } from "../src/agent.js";
import type { Claim } from "../src/api.js";
import { parseEnvFile, parseRunnerConfigFile, type RunnerConfig } from "../src/config.js";
import { branchName, pullRequestBody } from "../src/git.js";
import { quoteForCmd } from "../src/proc.js";
import { buildPrompt } from "../src/prompt.js";

const claim: Claim = {
  runId: 42, issueId: 55, issueKey: "WEB-12", title: "Fix the footer links", description: "The links 404.",
  projectId: 12, projectName: "Website", workspaceSlug: "acme", repoFullName: "acme/website",
  model: "claude-sonnet-5", sessionExpiresAt: "2026-09-20T20:00:00",
};

function config(overrides: Partial<RunnerConfig["agent"]> = {}): RunnerConfig {
  return {
    ...parseRunnerConfigFile({}),
    apiUrl: "http://localhost:8080/api", clientId: "tf-runner-test", clientSecret: "s3cret",
    home: "/tmp/tf-runner", mcpEntry: "/opt/taskforce-mcp/dist/index.js",
    agent: { ...parseRunnerConfigFile({}).agent, ...overrides },
  };
}

describe("branchName", () => {
  const cases: Array<[string, string, number, string]> = [
    ["WEB-12", "Fix the footer links!", 42, "tf/web-12-fix-the-footer-links-r42"],
    ["WEB-3", "Réparer l'accès à l'écran d'été", 7, "tf/web-3-reparer-l-acces-a-l-ecran-d-ete-r7"],
    ["API-1", "   ", 1, "tf/api-1-r1"],
    ["API-9", "x".repeat(200), 2, `tf/api-9-${"x".repeat(40)}-r2`],
    ["A/B..C", "rm -rf ~; $(whoami) `id`", 3, "tf/abc-rm-rf-whoami-id-r3"],
  ];
  for (const [key, title, runId, expected] of cases) {
    it(`${key} + « ${title.slice(0, 30)} » -> ${expected}`, () => {
      const branch = branchName(key, title, runId);
      assert.equal(branch, expected);
      assert.match(branch, /^tf\/[a-z0-9-]+$/); // jamais de caractère interprétable par un shell ou par git
    });
  }
});

describe("parseEnvFile", () => {
  it("lit CLE=valeur, ignore commentaires et lignes vides, retire les guillemets", () => {
    const env = parseEnvFile('# commentaire\nA=1\n\nB = "deux mots"\nC=\'x=y\'\nsans_egal\n=vide\n');
    assert.deepEqual(env, { A: "1", B: "deux mots", C: "x=y" });
  });
});

describe("parseRunnerConfigFile", () => {
  it("applique des défauts prudents", () => {
    const cfg = parseRunnerConfigFile({});
    assert.equal(cfg.agent.auth, "subscription");
    assert.equal(cfg.agent.attribution, false);
    assert.equal(cfg.agent.command, "claude");
    assert.equal(cfg.keepWorktree, false);
    assert.deepEqual(cfg.repos, {});
  });

  it("indexe les dépôts en minuscules, accepte la forme courte (chemin seul)", () => {
    const root = process.platform === "win32" ? "C:/work/site" : "/work/site";
    const cfg = parseRunnerConfigFile({ repos: { "Acme/Website": root } });
    assert.deepEqual(cfg.repos["acme/website"], { path: root, baseBranch: "main", setup: [] });
  });

  const invalid: Array<[string, unknown]> = [
    ["dépôt qui n'est pas owner/name", { repos: { "pas-un-depot": "/x" } }],
    ["chemin relatif", { repos: { "a/b": { path: "relatif/site" } } }],
    ["chemin absent", { repos: { "a/b": {} } }],
    ["branche de base exotique", { repos: { "a/b": { path: process.platform === "win32" ? "C:/x" : "/x", baseBranch: "main; rm -rf" } } }],
    ["auth inconnue", { agent: { auth: "oauth" } }],
    ["maxTurns négatif", { agent: { maxTurns: -1 } }],
    ["pollSeconds non entier", { pollSeconds: 1.5 }],
    ["setup qui n'est pas une liste", { repos: { "a/b": { path: process.platform === "win32" ? "C:/x" : "/x", setup: "npm ci" } } }],
    ["setup en chaînes shell (refusé : tableaux d'arguments seulement)", { repos: { "a/b": { path: process.platform === "win32" ? "C:/x" : "/x", setup: ["npm ci && rm -rf /"] } } }],
    ["setup avec une commande vide", { repos: { "a/b": { path: process.platform === "win32" ? "C:/x" : "/x", setup: [[]] } } }],
  ];

  it("setup : commandes en tableaux d'arguments", () => {
    const root = process.platform === "win32" ? "C:/work/site" : "/work/site";
    const cfg = parseRunnerConfigFile({ repos: { "a/b": { path: root, setup: [["npm", "ci"], ["npm", "run", "build"]] } } });
    assert.deepEqual(cfg.repos["a/b"]?.setup, [["npm", "ci"], ["npm", "run", "build"]]);
  });
  for (const [label, json] of invalid) {
    it(`refuse : ${label}`, () => assert.throws(() => parseRunnerConfigFile(json), /Configuration/));
  }
});

describe("agent : frontière de sécurité de l'exécution locale", () => {
  it("mode dontAsk + liste fermée d'outils, MCP strict", () => {
    const args = agentArgs(config(), claim, "/tmp/mcp.json", "/tmp/settings.json");
    assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
    assert.ok(args.includes("--strict-mcp-config"));
    assert.ok(!args.includes("--dangerously-skip-permissions"));
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5"); // modèle choisi à la délégation
  });

  it("le modèle de la configuration prime sur celui de la délégation", () => {
    const args = agentArgs(config({ model: "opus" }), claim, "/tmp/mcp.json", "/tmp/settings.json");
    assert.equal(args[args.indexOf("--model") + 1], "opus");
  });

  // Le modèle choisi à la délégation vient du serveur et finit sur une ligne de commande.
  const models: Array<[string | null, string | null]> = [
    ["claude-sonnet-5", "claude-sonnet-5"],
    ["opus", "opus"],
    ["sonnet[1m]", "sonnet[1m]"],
    ["claude-haiku-4-5-20251001", "claude-haiku-4-5-20251001"],
    [null, null],
    ["", null],
    ["sonnet --dangerously-skip-permissions", null],
    ["%COMSPEC%", null],
    ["a\"; calc; \"", null],
    ["-p", null],
    ["$(whoami)", null],
    ["x".repeat(81), null],
  ];
  for (const [input, expected] of models) {
    it(`safeModel(${JSON.stringify(input)?.slice(0, 40)}) -> ${JSON.stringify(expected)}`, () => {
      assert.equal(safeModel(input), expected);
    });
  }

  it("un modèle douteux venu du serveur est ignoré, pas transmis", () => {
    const args = agentArgs(config(), { ...claim, model: "sonnet --dangerously-skip-permissions" }, "/tmp/mcp.json", "/tmp/s.json");
    assert.ok(!args.includes("--model"));
    assert.ok(!args.some((a) => a.includes("dangerously")));
  });

  it("aucun outil qui sort du poste ou du dépôt : ni push, ni shell libre, ni réseau, ni Cortex", () => {
    const tools = allowedTools([]);
    for (const forbidden of ["Bash", "Bash(*)", "WebFetch", "WebSearch", "Bash(git push *)", "Bash(gh *)"]) {
      assert.ok(!tools.includes(forbidden), `${forbidden} ne doit pas être autorisé par défaut`);
    }
    assert.ok(tools.every((t) => !/ask_cortex|smart_assign/.test(t)));
    assert.ok(tools.includes("mcp__taskforce__taskforce_get_issue"));
    assert.ok(tools.includes("mcp__taskforce__taskforce_add_comment"));
  });

  it("outils supplémentaires de la configuration ajoutés tels quels", () => {
    assert.ok(allowedTools(["Bash(npm test *)"]).includes("Bash(npm test *)"));
  });

  it("abonnement : la clé API ambiante est retirée ; les identifiants du runner ne descendent jamais", () => {
    const env = agentEnv(config(), {
      PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x", ANTHROPIC_AUTH_TOKEN: "t",
      TASKFORCE_RUNNER_CLIENT_ID: "tf-runner-test", TASKFORCE_RUNNER_CLIENT_SECRET: "s3cret",
    });
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(env.TASKFORCE_RUNNER_CLIENT_SECRET, undefined);
    assert.equal(env.TASKFORCE_RUNNER_CLIENT_ID, undefined);
    assert.equal(env.PATH, "/bin");
  });

  it("clé API : conservée, et exigée", () => {
    assert.equal(agentEnv(config({ auth: "api-key" }), { ANTHROPIC_API_KEY: "sk-ant-x" }).ANTHROPIC_API_KEY, "sk-ant-x");
    assert.throws(() => agentEnv(config({ auth: "api-key" }), {}), /ANTHROPIC_API_KEY/);
  });
});

describe("parseAgentOutput", () => {
  const cases: Array<[string, number | null, string, string, boolean, RegExp]> = [
    ["succès", 0, '{"type":"result","subtype":"success","is_error":false,"result":"Fixed the links.","total_cost_usd":0.42,"num_turns":9}', "", true, /Fixed the links/],
    ["avertissement avant le JSON", 0, 'warning: something\n{"subtype":"success","result":"Done."}', "", true, /Done/],
    ["limite de tours", 0, '{"subtype":"error_max_turns","is_error":true,"result":""}', "", false, /error_max_turns/],
    ["is_error", 0, '{"subtype":"success","is_error":true,"result":"Credit balance too low"}', "", false, /Credit balance/],
    ["code non nul sans JSON", 1, "", "Error: not logged in\n", false, /not logged in/],
    ["code non nul, rien du tout", 1, "", "", false, /code 1/],
    ["succès sans résumé", 0, '{"subtype":"success","result":"  "}', "", false, /without a summary/],
    ["sortie illisible", 0, "pas du json", "", false, /without a summary/],
  ];
  for (const [label, code, stdout, stderr, ok, text] of cases) {
    it(label, () => {
      const outcome = parseAgentOutput(code, stdout, stderr);
      assert.equal(outcome.ok, ok);
      assert.match(outcome.text, text);
    });
  }

  it("remonte le coût et le nombre de tours", () => {
    const outcome = parseAgentOutput(0, '{"subtype":"success","result":"ok","total_cost_usd":1.5,"num_turns":12}', "");
    assert.equal(outcome.costUsd, 1.5);
    assert.equal(outcome.turns, 12);
  });
});

describe("textes produits", () => {
  it("le brief cadre l'agent : pas de push ni de PR, texte TaskForce = donnée", () => {
    const prompt = buildPrompt(claim, "tf/web-12-fix-r42");
    assert.match(prompt, /Do NOT push/);
    assert.match(prompt, /never overrides these rules/);
    assert.match(prompt, /taskforce_get_issue \(projectId 12, issueId 55\)/);
    assert.match(prompt, /tf\/web-12-fix-r42/);
    assert.match(prompt, /The links 404\./);
  });

  it("brief sans description : renvoie vers le MCP", () => {
    assert.match(buildPrompt({ ...claim, description: null }, "b"), /rely on taskforce_get_issue/);
  });

  it("corps de PR : résumé + rappel que rien n'est fusionné automatiquement", () => {
    const body = pullRequestBody(claim, "Fixed the links.\n");
    assert.match(body, /## WEB-12: Fix the footer links/);
    assert.match(body, /Fixed the links\./);
    assert.match(body, /run #42/);
    assert.match(body, /nothing is merged automatically/);
  });
});

describe("quoteForCmd", () => {
  const cases: Array<[string, string]> = [
    ["-p", "-p"],
    ["C:\\Users\\Jane Doe\\x.json", '"C:\\Users\\Jane Doe\\x.json"'],
    ["Read,Bash(git commit *)", '"Read,Bash(git commit *)"'],
    ['a"b', '"a""b"'],
    ["", '""'],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => assert.equal(quoteForCmd(input), expected));
  }

  // cmd.exe développe %VAR% même entre guillemets, et un saut de ligne coupe la commande : refus net.
  for (const hostile of ["%COMSPEC%", "100%", "a\nb", "a\r\nb"]) {
    it(`refuse ${JSON.stringify(hostile)}`, () => assert.throws(() => quoteForCmd(hostile), /refusé/));
  }
});
