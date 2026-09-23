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
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { runAgent, type AgentOutcome } from "./agent.js";
import { ApiError, TaskforceApi, type Claim, type RunResult } from "./api.js";
import { loadConfig, type RepoConfig, type RunnerConfig } from "./config.js";
import { finalizeCommits, openPullRequest, prepareWorktree, pushBranch, removeWorktree, resolveRepo, runSetup, type Worktree } from "./git.js";
import { log } from "./log.js";
import { resolveCommand, run } from "./proc.js";

const HEARTBEAT_MS = 30_000;
/** Marge gardée sur la durée de vie du jeton de session : l'agent doit finir avant son expiration. */
const TOKEN_SAFETY_MS = 3 * 60_000;

/** Dossier de travail jetable d'une tâche sans dépôt : `<home>/scratch/run-<id>`, vidé s'il existait déjà. */
function prepareScratch(home: string, runId: number): string {
  const dir = join(home, "scratch", `run-${runId}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Jeton NEUF pour la session de l'agent (durée de vie entière), et durée d'agent ramenée sous cette durée
 * de vie : l'agent doit finir avant l'expiration du jeton.
 */
async function startAgentSession(config: RunnerConfig, api: TaskforceApi): Promise<{ agentConfig: RunnerConfig; token: string }> {
  const session = await api.token(true);
  const budgetMs = session.expiresAt - Date.now() - TOKEN_SAFETY_MS;
  const timeoutMinutes = Math.max(1, Math.min(config.agent.timeoutMinutes, Math.floor(budgetMs / 60_000)));
  if (timeoutMinutes < config.agent.timeoutMinutes) {
    log.warn(`Durée de l'agent ramenée à ${timeoutMinutes} min : c'est la durée de vie du jeton de session.`);
  }
  return { agentConfig: { ...config, agent: { ...config.agent, timeoutMinutes } }, token: session.token };
}

function logOutcome(outcome: AgentOutcome): void {
  const meta = [outcome.turns !== null ? `${outcome.turns} tours` : "", outcome.costUsd !== null ? `${outcome.costUsd.toFixed(2)} USD` : ""]
    .filter(Boolean).join(", ");
  log.info(`Claude Code a terminé (${outcome.ok ? "succès" : "échec"}${meta ? `, ${meta}` : ""})`);
}

/** Traite un run réclamé, jusqu'au résultat posté. Ne lève jamais : tout échec devient un résultat FAILED. */
async function processRun(config: RunnerConfig, api: TaskforceApi, claim: Claim): Promise<void> {
  log.info(`Run #${claim.runId} réclamé : ${claim.issueKey} - ${claim.title}`);
  const heartbeat = setInterval(() => {
    api.heartbeat(claim.runId).catch((e: unknown) => log.warn(`Signe de vie refusé : ${(e as Error).message}`));
  }, HEARTBEAT_MS);

  let result: RunResult;
  let worktree: Worktree | null = null;
  let repo: RepoConfig | null = null;
  let scratch: string | null = null;
  try {
    if (claim.repoFullName) {
      repo = await resolveRepo(config.repos, config.autoClone, config.home, claim.repoFullName);
      worktree = await prepareWorktree(repo, claim, config.home);
      log.info(`Worktree prêt : ${worktree.path} (branche ${worktree.branch}, base ${worktree.base})`);
      await runSetup(worktree, repo.setup);

      const { agentConfig, token } = await startAgentSession(config, api);
      log.info("Claude Code au travail...");
      const outcome = await runAgent(agentConfig, claim, worktree.path, token, { mode: "repo", branch: worktree.branch });
      logOutcome(outcome);
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
    } else {
      // Projet sans dépôt (tâche non-code) : l'agent travaille dans un dossier jetable et rend son travail
      // dans TaskForce (commentaire), jamais de pull request, jamais un fichier hors de ce dossier.
      if (!config.acceptRepoless) {
        throw new Error("This project has no linked repository, and this runner only takes code tasks (acceptRepoless is off). Link a repository to the project, or enable repo-less tasks on the runner.");
      }
      scratch = prepareScratch(config.home, claim.runId);
      log.info(`Espace de travail sans dépôt : ${scratch}`);

      const { agentConfig, token } = await startAgentSession(config, api);
      log.info("Claude Code au travail (tâche sans dépôt)...");
      const outcome = await runAgent(agentConfig, claim, scratch, token, { mode: "repoless" });
      logOutcome(outcome);
      if (!outcome.ok) throw new Error(outcome.text);
      result = { status: "DONE", summary: outcome.text.slice(0, 7900) };
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

  // Un dossier de travail en échec est gardé : c'est la seule trace locale de ce que l'agent a fait.
  if (result.status === "DONE" && !config.keepWorktree) {
    if (worktree && repo) await removeWorktree(repo, worktree);
    if (scratch) rmSync(scratch, { recursive: true, force: true });
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
  if (config.autoClone) {
    console.log(`  [ok] Dépôts : clonés à la demande dans ${join(config.home, "repos")} (rien à configurer)`);
  } else if (repos.length === 0) {
    line(false, "Dépôts", "aucun dans runner.config.json, et autoClone est désactivé");
  }
  for (const [name, repo] of repos) {
    const probe = await run("git", ["-C", repo.path, "rev-parse", "--is-inside-work-tree"]).catch(() => null);
    line(probe !== null && probe.code === 0, `Dépôt ${name}`, `${repo.path} (base ${repo.baseBranch})`);
  }
  console.log(`  Authentification de Claude Code : ${config.agent.auth === "subscription" ? "abonnement (le login de la personne, dans son Claude Code)" : "clé API"}`);
  console.log(`  Sortie du poste : ${config.push ? (config.openPullRequest ? "push + pull request" : "push seul") : "aucune (branche locale)"}`);
  console.log(`  Tâches sans dépôt (non-code) : ${config.acceptRepoless ? "acceptées, résultat rendu en commentaire" : "refusées (code uniquement)"}`);
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
