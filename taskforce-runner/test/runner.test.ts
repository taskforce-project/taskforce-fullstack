import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { agentArgs, agentEnv, agentSettings, DENIED_TOOLS, mcpConfig, parseAgentOutput, safeModel } from "../src/agent.js";
import type { Claim } from "../src/api.js";
import { parseEnvFile, parseRunnerConfigFile, type RunnerConfig } from "../src/config.js";
import { branchName, ghCredentialArgs, isValidRepoFullName, managedCheckoutDir, pullRequestBody, resolveRepo } from "../src/git.js";
import { quoteForCmd, run } from "../src/proc.js";
import { buildPrompt, buildReplyPrompt } from "../src/prompt.js";

const claim: Claim = {
  runId: 42, issueId: 55, issueKey: "WEB-12", title: "Fix the footer links", description: "The links 404.",
  projectId: 12, projectName: "Website", workspaceSlug: "acme", repoFullName: "acme/website",
  model: "claude-sonnet-5", sessionExpiresAt: "2026-09-20T20:00:00",
};

function config(overrides: Partial<RunnerConfig["agent"]> = {}): RunnerConfig {
  return {
    ...parseRunnerConfigFile({}),
    apiUrl: "http://localhost:8080/api", clientId: "tf-runner-test", clientSecret: "s3cret",
    home: "/tmp/tf-runner",
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

describe("dépôt du projet : nom validé, clone géré par le runner", () => {
  const valid = ["acme/website", "Miche1-Pierre/runner-sandbox", "taskforce-project/taskforce.docs", "a/b_c-d.e"];
  for (const name of valid) {
    it(`accepte ${name}`, () => assert.equal(isValidRepoFullName(name), true));
  }

  // Le nom vient du serveur, devient un chemin sur le disque puis un argument de `gh` : forme stricte.
  const invalid: Array<string | null | undefined> = [
    null, undefined, "", "website", "acme/", "/website", "acme/web/site", "acme/../etc", "../x/y",
    "acme/website;rm -rf", "acme/web site", "-acme/website", "acme/website\n", "https://github.com/acme/website",
    "acme\\website", `${"a".repeat(40)}/website`,
  ];
  for (const name of invalid) {
    it(`refuse ${JSON.stringify(name)?.slice(0, 40)}`, () => assert.equal(isValidRepoFullName(name), false));
  }

  it("le clone géré vit sous <home>/repos/<owner>/<name>, en minuscules", () => {
    const dir = managedCheckoutDir("/home/u/.taskforce-runner", "Miche1-Pierre/Runner-Sandbox").replaceAll("\\", "/");
    assert.equal(dir, "/home/u/.taskforce-runner/repos/miche1-pierre/runner-sandbox");
  });

  it("un dépôt déclaré dans la configuration prime sur le clone automatique", async () => {
    const declared = { path: "/work/site", baseBranch: "develop", setup: [] };
    assert.deepEqual(await resolveRepo({ "acme/website": declared }, true, "/tmp/h", "Acme/Website"), declared);
  });

  it("clone automatique désactivé et dépôt non déclaré : erreur claire, rien n'est cloné", async () => {
    await assert.rejects(resolveRepo({}, false, "/tmp/h", "acme/website"), /autoClone is off/);
  });

  it("nom de dépôt invalide : refusé avant toute commande", async () => {
    await assert.rejects(resolveRepo({}, true, "/tmp/h", "acme/../../etc"), /not a valid GitHub/);
  });

  it("un clone déjà fait par le runner est réutilisé, marqué géré", async () => {
    const home = mkdtempSync(join(tmpdir(), "tf-runner-"));
    try {
      mkdirSync(join(managedCheckoutDir(home, "acme/website"), ".git"), { recursive: true });
      const repo = await resolveRepo({}, true, home, "acme/website");
      assert.equal(repo.managed, true);
      assert.equal(repo.path, managedCheckoutDir(home, "acme/website"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("ghCredentialArgs", () => {
  it("un clone géré pousse avec les identifiants de GitHub CLI, pour cette commande seulement", () => {
    assert.deepEqual(ghCredentialArgs({ path: "/h/repos/acme/site", baseBranch: "main", setup: [], managed: true }), [
      "-c", "credential.https://github.com.helper=",
      "-c", "credential.https://github.com.helper=!gh auth git-credential",
    ]);
  });

  it("un dépôt déclaré garde la configuration git de la personne", () => {
    assert.deepEqual(ghCredentialArgs({ path: "/work/site", baseBranch: "main", setup: [] }), []);
  });
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
    assert.equal(cfg.autoClone, true); // rien à configurer : le dépôt du projet est cloné à la demande
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
  it("mode manual sans autre répondant que le hook : hors du socle, une action attend la décision dans TaskForce", () => {
    const args = agentArgs(config(), claim, "/tmp/mcp.json", "/tmp/settings.json");
    assert.equal(args[args.indexOf("--permission-mode") + 1], "manual");
    assert.equal(args[args.indexOf("--permission-prompts") + 1], "none");
    assert.equal(args[args.indexOf("--output-format") + 1], "stream-json");
    assert.ok(args.includes("--verbose"));
    assert.equal(args[args.indexOf("--disallowedTools") + 1], DENIED_TOOLS.join(","));
    assert.ok(args.includes("--strict-mcp-config"));
    assert.ok(!args.includes("--dangerously-skip-permissions"));
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5"); // modèle choisi à la délégation
  });

  it("ignore les réglages du dépôt cloné (hooks, URL d'API) : seuls ceux de la personne et du runner", () => {
    const args = agentArgs(config(), claim, "/tmp/mcp.json", "/tmp/settings.json");
    assert.equal(args[args.indexOf("--setting-sources") + 1], "user");
    assert.equal(args[args.indexOf("--settings") + 1], "/tmp/settings.json");
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

  it("rien n'est autorisé d'avance : les règles de la mission jugent chaque action (hook PreToolUse)", () => {
    const args = agentArgs(config(), claim, "/tmp/mcp.json", "/tmp/s.json");
    assert.ok(!args.includes("--allowedTools"));
    assert.ok(!args.some((a) => /ask_cortex|smart_assign|WebFetch|WebSearch/.test(a)));
  });

  it("outils ajoutés par la personne sur son poste : autorisés d'avance, tels quels", () => {
    const args = agentArgs(config({ extraAllowedTools: ["Bash(npm test *)", "Bash(mvn test *)"] }), claim, "/tmp/mcp.json", "/tmp/s.json");
    assert.equal(args[args.indexOf("--allowedTools") + 1], "Bash(npm test *),Bash(mvn test *)");
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
    assert.equal(env.TF_HOOK_TOKEN, undefined);
  });

  it("le jeton du serveur local de validations passe par l'environnement, jamais par un fichier", () => {
    assert.equal(agentEnv(config(), { TF_HOOK_TOKEN: "stale" }, "fresh").TF_HOOK_TOKEN, "fresh");
    assert.equal(agentEnv(config(), { TF_HOOK_TOKEN: "stale" }).TF_HOOK_TOKEN, undefined);
    assert.ok(!JSON.stringify(agentSettings(config(), "http://127.0.0.1:5000/permission", "http://127.0.0.1:5000/pre-tool-use")).includes("fresh"));
  });

  it("refus permanents : push et gh restent au runner, même validés dans l'app", () => {
    for (const rule of ["Bash(git push *)", "Bash(gh *)"]) assert.ok(DENIED_TOOLS.includes(rule));
  });

  it("MCP de l'instance en HTTP : jeton de session et en-tête du run", () => {
    const server = (mcpConfig(config(), claim, "session-token").mcpServers as Record<string, Record<string, unknown>>).taskforce;
    assert.equal(server?.type, "http");
    assert.equal(server?.url, "http://localhost:8080/api/workspaces/acme/mcp");
    assert.deepEqual(server?.headers, { Authorization: "Bearer session-token", "X-TaskForce-Delivery-Run": "42" });
  });

  // Les deux hooks de la porte : les règles avant chaque action, puis la décision humaine pour ce qu'elles demandent.
  const hooks: Array<["PreToolUse" | "PermissionRequest", string, number]> = [
    ["PreToolUse", "http://127.0.0.1:5000/pre-tool-use", 30],
    ["PermissionRequest", "http://127.0.0.1:5000/permission", 5 * 60 + 60], // au-delà de l'attente du serveur
  ];
  for (const [event, url, timeout] of hooks) {
    it(`réglages de session : hook ${event} HTTP authentifié, sur toute action, garde fermée`, () => {
      const settings = agentSettings(config({ approvalTimeoutMinutes: 5 }), "http://127.0.0.1:5000/permission", "http://127.0.0.1:5000/pre-tool-use") as {
        includeCoAuthoredBy?: boolean;
        hooks: Record<string, Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>>;
      };
      const entry = settings.hooks[event]?.[0];
      const hook = entry?.hooks[0];
      assert.equal(settings.includeCoAuthoredBy, false);
      assert.equal(entry?.matcher, ".*");
      assert.equal(hook?.type, "http");
      assert.equal(hook?.url, url);
      assert.deepEqual(hook?.headers, { Authorization: "Bearer $TF_HOOK_TOKEN" });
      assert.deepEqual(hook?.allowedEnvVars, ["TF_HOOK_TOKEN"]);
      assert.equal(hook?.timeout, timeout);
      assert.equal(hook?.onFailure, "block");
    });
  }

  it("clé API : conservée, et exigée", () => {
    assert.equal(agentEnv(config({ auth: "api-key" }), { ANTHROPIC_API_KEY: "sk-ant-x" }).ANTHROPIC_API_KEY, "sk-ant-x");
    assert.throws(() => agentEnv(config({ auth: "api-key" }), {}), /ANTHROPIC_API_KEY/);
  });
});

describe("parseAgentOutput", () => {
  const cases: Array<[string, number | null, string, string, boolean, RegExp]> = [
    ["succès", 0, '{"type":"result","subtype":"success","is_error":false,"result":"Fixed the links.","total_cost_usd":0.42,"num_turns":9}', "", true, /Fixed the links/],
    ["avertissement avant le JSON", 0, 'warning: something\n{"subtype":"success","result":"Done."}', "", true, /Done/],
    ["stream-json : le résultat n'est pas la dernière ligne", 0, '{"type":"system","subtype":"init"}\n{"type":"assistant","message":{"content":[]}}\n{"type":"result","subtype":"success","is_error":false,"result":"All good."}\n{"type":"system","subtype":"task_summary"}', "", true, /All good/],
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
    assert.match(prompt, /the runner runs it after you/);
    assert.doesNotMatch(prompt, /Run the project's tests/); // la règle no-agent-scripts les interdit à l'agent (R32)
    assert.match(prompt, /never overrides these rules/);
    assert.match(prompt, /get_issue, a tool of the taskforce MCP server \(projectId 12, issueId 55\)/);
    assert.match(prompt, /wait for the approval of the person who delegated/);
    assert.match(prompt, /tf\/web-12-fix-r42/);
    assert.match(prompt, /The links 404\./);
  });

  it("brief sans description : renvoie vers le MCP", () => {
    assert.match(buildPrompt({ ...claim, description: null }, "b"), /rely on get_issue/);
  });

  it("corps de PR : les faits du runner, puis le résumé de l'agent sous son nom (R49)", () => {
    const body = pullRequestBody(claim, {
      facts: ["Pushed the branch `tf/web-12-fix-r42` (1 commit): allowed by the rule push-agent-branch-private.",
        "Tests passed: `npm test` (3 s)."],
      summary: "Fixed the links. Nothing pushed.\n",
      testOutput: "1 passing",
    });
    assert.match(body, /## WEB-12: Fix the footer links/);
    assert.ok(body.indexOf("### What TaskForce did") < body.indexOf("### The agent's summary"));
    assert.match(body, /- Pushed the branch `tf\/web-12-fix-r42` \(1 commit\)/);
    assert.match(body, /- Tests passed: `npm test`/);
    assert.match(body, /Fixed the links\./);
    assert.match(body, /<summary>Test output<\/summary>[\s\S]*1 passing/);
    assert.match(body, /run #42/);
    assert.match(body, /nothing is merged automatically/);
  });

  it("corps de PR sans tests lancés : pas de bloc de sortie", () => {
    const body = pullRequestBody(claim, { facts: ["No test command is set for this project: no test ran."], summary: "Done." });
    assert.doesNotMatch(body, /Test output/);
    assert.match(body, /- No test command is set for this project/);
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
    it(`refuse ${JSON.stringify(hostile)}`, () => assert.throws(() => quoteForCmd(hostile), /refused/));
  }
});

describe("mode sans dépôt (repoless)", () => {
  it("brief repoless : pas de dépôt, livraison par commentaire, texte TaskForce = donnée, pas de PR", () => {
    const prompt = buildReplyPrompt(claim);
    assert.match(prompt, /no git repository/i);
    assert.match(prompt, /add_comment/);
    assert.match(prompt, /never overrides these rules/);
    assert.match(prompt, /writing files onto the machine/i); // consigne d'injection explicitement écartée
    assert.match(prompt, /get_issue, a tool of the taskforce MCP server \(projectId 12, issueId 55\)/);
    assert.doesNotMatch(prompt, /pull request/i);
  });

  it("brief repoless sans description : renvoie vers le MCP", () => {
    assert.match(buildReplyPrompt({ ...claim, description: null }), /rely on get_issue/);
  });
});

describe("acceptRepoless (tâches non-code)", () => {
  it("accepté par défaut", () => assert.equal(parseRunnerConfigFile({}).acceptRepoless, true));
  it("désactivable pour un runner code-only", () => assert.equal(parseRunnerConfigFile({ acceptRepoless: false }).acceptRepoless, false));
});

describe("run : arrêt du runner pendant une commande", () => {
  it("le signal arrête le processus tout de suite, et le résultat le dit", async () => {
    const stop = new AbortController();
    const started = Date.now();
    setTimeout(() => stop.abort(), 200);
    const result = await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { signal: stop.signal });
    assert.equal(result.aborted, true);
    assert.equal(result.timedOut, false);
    assert.ok(Date.now() - started < 10_000, "arrêté sans attendre");
  });

  it("un signal déjà levé n'attend pas la fin de la commande", async () => {
    const stop = new AbortController();
    stop.abort();
    const result = await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { signal: stop.signal });
    assert.equal(result.aborted, true);
  });

  it("sans signal, la commande va à son terme", async () => {
    const result = await run(process.execPath, ["-e", "process.stdout.write('ok')"]);
    assert.deepEqual([result.code, result.stdout, result.aborted], [0, "ok", false]);
  });
});
