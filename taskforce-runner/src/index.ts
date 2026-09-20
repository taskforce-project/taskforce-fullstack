#!/usr/bin/env node
/**
 * Runner local de délégation TaskForce (ADR-013).
 *
 *   TaskForce (« Assign to Claude Code »)  ->  run QUEUED
 *   runner : claim  ->  worktree git  ->  Claude Code sans interface + MCP TaskForce (session déléguée)
 *          ->  commits  ->  push + pull request  ->  résultat posté  ->  issue en « In review by AI »
 *
 * Modèle « pull » : le backend ne peut pas joindre un poste local, c'est le runner qui vient chercher le
 * travail. Il ne fusionne jamais rien : la décision reste humaine.
 *
 * Options : `--check` (vérifie l'installation, ne réclame rien), `--once` (traite au plus un run puis sort).
 */
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { runAgent } from "./agent.js";
import { ApiError, TaskforceApi, type Claim, type RunResult } from "./api.js";
import { loadConfig, type RunnerConfig } from "./config.js";
import { finalizeCommits, openPullRequest, prepareWorktree, pushBranch, removeWorktree, runSetup, type Worktree } from "./git.js";
import { log } from "./log.js";
import { resolveCommand, run } from "./proc.js";

const HEARTBEAT_MS = 30_000;
/** Marge gardée sur la durée de vie du jeton de session : l'agent doit finir avant son expiration. */
const TOKEN_SAFETY_MS = 3 * 60_000;

/** Traite un run réclamé, de la préparation du dépôt au résultat posté. Ne lève jamais : tout échec devient un résultat FAILED. */
async function processRun(config: RunnerConfig, api: TaskforceApi, claim: Claim): Promise<void> {
  log.info(`Run #${claim.runId} réclamé : ${claim.issueKey} - ${claim.title}`);
  const heartbeat = setInterval(() => {
    api.heartbeat(claim.runId).catch((e: unknown) => log.warn(`Signe de vie refusé : ${(e as Error).message}`));
  }, HEARTBEAT_MS);

  let result: RunResult;
  let worktree: Worktree | null = null;
  const repo = claim.repoFullName ? config.repos[claim.repoFullName.toLowerCase()] : undefined;
  try {
    if (!claim.repoFullName) {
      throw new Error("This project has no linked repository. Link one in the project's repository tab, then delegate again.");
    }
    if (!repo) {
      throw new Error(`No local checkout is configured for ${claim.repoFullName} on this runner (runner.config.json > repos).`);
    }
    worktree = await prepareWorktree(repo, claim, config.home);
    log.info(`Worktree prêt : ${worktree.path} (branche ${worktree.branch}, base ${worktree.base})`);
    await runSetup(worktree, repo.setup);

    // Jeton NEUF pour la session de l'agent : il dispose ainsi de sa durée de vie entière.
    const session = await api.token(true);
    const budgetMs = session.expiresAt - Date.now() - TOKEN_SAFETY_MS;
    const timeoutMinutes = Math.max(1, Math.min(config.agent.timeoutMinutes, Math.floor(budgetMs / 60_000)));
    if (timeoutMinutes < config.agent.timeoutMinutes) {
      log.warn(`Durée de l'agent ramenée à ${timeoutMinutes} min : c'est la durée de vie du jeton de session.`);
    }
    const agentConfig: RunnerConfig = { ...config, agent: { ...config.agent, timeoutMinutes } };

    log.info("Claude Code au travail...");
    const outcome = await runAgent(agentConfig, claim, worktree.path, worktree.branch, session.token);
    const meta = [outcome.turns !== null ? `${outcome.turns} tours` : "", outcome.costUsd !== null ? `${outcome.costUsd.toFixed(2)} USD` : ""]
      .filter(Boolean).join(", ");
    log.info(`Claude Code a terminé (${outcome.ok ? "succès" : "échec"}${meta ? `, ${meta}` : ""})`);
    if (!outcome.ok) throw new Error(outcome.text);

    const commits = await finalizeCommits(worktree, claim);
    if (commits === 0) {
      result = { status: "DONE", summary: `No code change was needed.\n\n${outcome.text}`.slice(0, 7900) };
    } else if (!config.push) {
      result = {
        status: "DONE",
        summary: `${outcome.text}\n\n${commits} commit(s) on local branch ${worktree.branch} (push disabled on this runner).`.slice(0, 7900),
      };
    } else {
      await pushBranch(worktree);
      const url = config.openPullRequest ? await openPullRequest(worktree, repo, claim, outcome.text, config.home) : undefined;
      result = { status: "DONE", summary: outcome.text.slice(0, 7900), resultUrl: url };
      log.info(url ? `Pull request ouverte : ${url}` : `Branche poussée : ${worktree.branch}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(`Run #${claim.runId} en échec : ${message}`);
    result = { status: "FAILED", error: message.slice(0, 3900) };
  } finally {
    clearInterval(heartbeat);
  }

  try {
    await api.result(claim.runId, result);
    log.info(`Run #${claim.runId} : résultat ${result.status} posté`);
  } catch (e) {
    log.error(`Résultat du run #${claim.runId} non posté : ${(e as Error).message}`);
  }

  // Un worktree en échec est gardé : c'est la seule trace de ce que l'agent a fait.
  if (worktree && repo && result.status === "DONE" && !config.keepWorktree) {
    await removeWorktree(repo, worktree);
  }
}

/** `--check` : vérifie chaque maillon sans rien réclamer. Rend false si un maillon bloquant manque. */
async function check(config: RunnerConfig, api: TaskforceApi): Promise<boolean> {
  let ok = true;
  const line = (good: boolean, label: string, detail = ""): void => {
    console.log(`  ${good ? "[ok]" : "[KO]"} ${label}${detail ? ` : ${detail}` : ""}`);
    if (!good) ok = false;
  };

  console.log(`Runner ${config.clientId} -> ${config.apiUrl}`);
  try {
    const { expiresAt } = await api.token(true);
    line(true, "Jeton machine (Keycloak, relayé par le backend)", `valide ${Math.round((expiresAt - Date.now()) / 60_000)} min`);
  } catch (e) {
    const status = e instanceof ApiError ? ` (HTTP ${e.status})` : "";
    line(false, "Jeton machine", `${(e as Error).message}${status}. Backend démarré ? delivery.local-runner.enabled=true ? client créé par scripts/keycloak-runner.ps1 ?`);
  }

  for (const tool of ["git", "gh", config.agent.command]) {
    const probe = await run(tool, ["--version"], { timeoutMs: 20_000 }).catch(() => null);
    const found = probe !== null && probe.code === 0;
    const where = resolveCommand(tool).file;
    const needed = tool !== "gh" || (config.push && config.openPullRequest);
    const why = probe === null ? `introuvable (${where})` : `« ${where} --version » a rendu le code ${probe.code}`;
    if (found) line(true, tool, probe.stdout.trim().split(/\r?\n/)[0] ?? "");
    else if (needed) line(false, tool, why);
    else console.log(`  [--] ${tool} : ${why}, non requis ici`);
  }

  line(existsSync(config.mcpEntry), "Serveur MCP TaskForce", existsSync(config.mcpEntry) ? config.mcpEntry : `${config.mcpEntry} absent : cd taskforce-mcp ; npm install ; npm run build`);

  const repos = Object.entries(config.repos);
  if (repos.length === 0) line(false, "Dépôts", "aucun dans runner.config.json (copier runner.config.example.json)");
  for (const [name, repo] of repos) {
    const probe = await run("git", ["-C", repo.path, "rev-parse", "--is-inside-work-tree"]).catch(() => null);
    line(probe !== null && probe.code === 0, `Dépôt ${name}`, `${repo.path} (base ${repo.baseBranch})`);
  }
  console.log(`  Authentification de Claude Code : ${config.agent.auth === "subscription" ? "abonnement (le login de la personne, dans son Claude Code)" : "clé API"}`);
  console.log(`  Sortie du poste : ${config.push ? (config.openPullRequest ? "push + pull request" : "push seul") : "aucune (branche locale)"}`);
  return ok;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const config = loadConfig();
  const api = new TaskforceApi(config);

  if (args.has("--check")) {
    process.exit((await check(config, api)) ? 0 : 1);
  }

  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    log.info("Arrêt demandé : le runner sort après le run en cours (Ctrl+C à nouveau pour forcer).");
  });

  log.info(`Runner ${config.clientId} à l'écoute de ${config.apiUrl} (toutes les ${config.pollSeconds} s)`);
  let lastError = "";
  while (!stopping) {
    try {
      const claim = await api.claim();
      lastError = "";
      if (claim) {
        await processRun(config, api, claim);
        if (args.has("--once")) break;
        continue;
      }
      if (args.has("--once")) {
        log.info("Aucun run en attente.");
        break;
      }
    } catch (e) {
      // Backend redémarré, réseau coupé : on réessaie, sans noyer le journal du même message.
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError) log.warn(`TaskForce injoignable ou refus : ${message}`);
      lastError = message;
      if (args.has("--once")) process.exit(1);
    }
    await sleep(config.pollSeconds * 1000);
  }
}

main().catch((e: unknown) => {
  log.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
