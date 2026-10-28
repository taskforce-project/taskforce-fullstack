#!/usr/bin/env node
/**
 * Runner local de délégation TaskForce (ADR-013).
 *
 *   TaskForce (« Assign to Claude Code »)  ->  run QUEUED
 *   runner : claim  ->  worktree git  ->  Claude Code sans interface + serveur MCP de l'instance (session déléguée)
 *          ->  chronologie en direct et validations dans l'app  ->  commits  ->  push + pull request
 *          ->  résultat posté  ->  issue en « In review by AI »
 *
 * Modèle « pull » : le backend ne peut pas joindre un poste local, c'est le runner qui vient chercher le
 * travail. Il ne fusionne jamais rien : la décision reste humaine.
 *
 * Options : `--check` (vérifie l'installation, ne réclame rien), `--once` (traite au plus un run puis sort).
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { runAgent, type AgentOutcome } from "./agent.js";
import { ApiError, TaskforceApi, type Claim, type RunResult } from "./api.js";
import { askInTaskForce } from "./approvals.js";
import { loadConfig, type RepoConfig, type RunnerConfig } from "./config.js";
import { exitFacts, judgeExit, type ExitVerdict } from "./exits.js";
import { finalizeCommits, openPullRequest, prepareWorktree, pushBranch, removeWorktree, repoVisibility, resolveRepo, runSetup, type Worktree } from "./git.js";
import { verifiedBundle } from "./harness/rules.js";
import { log } from "./log.js";
import { resolveCommand, run } from "./proc.js";
import { MIN_CLAUDE_CODE, supportsApprovals } from "./version.js";

// Lancé par l'app desktop avec le Node d'Electron (ELECTRON_RUN_AS_NODE) : ni git, ni gh, ni Claude Code ne doivent
// en hériter.
delete process.env.ELECTRON_RUN_AS_NODE;

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
    log.warn(`Agent time limit lowered to ${timeoutMinutes} min: that is the lifetime of the session token.`);
  }
  return { agentConfig: { ...config, agent: { ...config.agent, timeoutMinutes } }, token: session.token };
}

/**
 * Avant chaque mission, pas seulement par `--check` : la version de Claude Code qui tient la garde fermée (hooks avec
 * `onFailure`, 2.1.295). Plus ancienne, un hook injoignable laisserait passer l'action : la mission ne part pas.
 */
async function ensureAgentVersion(config: RunnerConfig): Promise<void> {
  const probe = await run(config.agent.command, ["--version"], { timeoutMs: 20_000 }).catch(() => null);
  const version = probe && probe.code === 0 ? (probe.stdout.trim().split(/\r?\n/)[0] ?? "") : "";
  if (!supportsApprovals(version)) {
    throw new Error(`Claude Code ${MIN_CLAUDE_CODE} or later is needed for the rules to hold (found: ${version || "none"}). Update it: npm install -g @anthropic-ai/claude-code`);
  }
}

/** Une sortie, faite ou non, pour la chronologie et le dossier de preuve ; un échec d'envoi n'arrête rien. */
async function traceExit(api: TaskforceApi, runId: number, tool: string, verdict: ExitVerdict): Promise<void> {
  await api.events(runId, [{ kind: "exit", tool, text: verdict.why, effect: verdict.go ? "allow" : "deny" }])
    .catch((e: unknown) => log.warn(`Exit not traced in TaskForce: ${(e as Error).message}`));
}

function logOutcome(outcome: AgentOutcome): void {
  const meta = [outcome.turns !== null ? `${outcome.turns} turn${outcome.turns === 1 ? "" : "s"}` : "", outcome.costUsd !== null ? `${outcome.costUsd.toFixed(2)} USD` : ""]
    .filter(Boolean).join(", ");
  log.info(`Claude Code finished (${outcome.ok ? "success" : "failure"}${meta ? `, ${meta}` : ""})`);
}

/** Traite un run réclamé, jusqu'au résultat posté. Ne lève jamais : tout échec devient un résultat FAILED. */
async function processRun(config: RunnerConfig, api: TaskforceApi, claim: Claim, signal?: AbortSignal): Promise<void> {
  log.info(`Run #${claim.runId} claimed: ${claim.issueKey} - ${claim.title}`);
  const heartbeat = setInterval(() => {
    api.heartbeat(claim.runId).catch((e: unknown) => log.warn(`Heartbeat refused: ${(e as Error).message}`));
  }, HEARTBEAT_MS);

  let result: RunResult;
  let worktree: Worktree | null = null;
  let repo: RepoConfig | null = null;
  let scratch: string | null = null;
  try {
    // Pas de mission sans règles : paquet absent ou empreinte qui ne tient pas, le run finit en échec ici.
    const rules = verifiedBundle(claim.rules);
    log.info(`Rules v${rules.version} (${rules.rules.length} rules, ${rules.digest?.slice(0, 15)}...)`);
    await ensureAgentVersion(config);
    if (claim.repoFullName) {
      repo = await resolveRepo(config.repos, config.autoClone, config.home, claim.repoFullName);
      worktree = await prepareWorktree(repo, claim, config.home);
      log.info(`Worktree ready: ${worktree.path} (branch ${worktree.branch}, base ${worktree.base})`);
      await runSetup(worktree, repo.setup);

      const { agentConfig, token } = await startAgentSession(config, api);
      log.info("Claude Code at work (follow it live in TaskForce)...");
      const outcome = await runAgent(agentConfig, claim, worktree.path, token, { mode: "repo", branch: worktree.branch, signal, rules }, api);
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
        // Les sorties suivent les règles de la mission (§8.4) : ce qui est demandé attend la personne qui a délégué.
        const repoName = claim.repoFullName;
        const visibility = await repoVisibility(repoName);
        const where = `${repoName} (${visibility ?? "visibility unknown"})`;
        const ask = (tool: string, summary: string): Promise<boolean> =>
          askInTaskForce(api, claim.runId, tool, summary, config.agent.approvalTimeoutMinutes * 60_000);
        const push = await judgeExit(rules, exitFacts("git.push", worktree.branch, visibility), "git push",
          `Push the branch ${worktree.branch} to ${where}`, ask);
        log.info(`Push: ${push.why}`);
        await traceExit(api, claim.runId, "git push", push);
        if (!push.go) {
          result = {
            status: "DONE",
            summary: `${outcome.text}\n\n${commits} commit(s) on local branch ${worktree.branch}, not pushed: ${push.why}.`.slice(0, 7900),
          };
        } else {
          await pushBranch(worktree, repo);
          let url: string | undefined;
          let note = "";
          if (config.openPullRequest) {
            const pr = await judgeExit(rules, exitFacts("pr.open", worktree.branch, visibility), "gh pr create",
              `Open a pull request from ${worktree.branch} on ${where}`, ask);
            log.info(`Pull request: ${pr.why}`);
            await traceExit(api, claim.runId, "gh pr create", pr);
            if (pr.go) url = await openPullRequest(worktree, repo, claim, outcome.text, config.home);
            else note = `\n\nBranch ${worktree.branch} pushed, no pull request: ${pr.why}.`;
          }
          result = { status: "DONE", summary: `${outcome.text}${note}`.slice(0, 7900), resultUrl: url };
          log.info(url ? `Pull request opened: ${url}` : `Branch pushed: ${worktree.branch}`);
        }
      }
    } else {
      // Projet sans dépôt (tâche non-code) : l'agent travaille dans un dossier jetable et rend son travail
      // dans TaskForce (commentaire), jamais de pull request, jamais un fichier hors de ce dossier.
      if (!config.acceptRepoless) {
        throw new Error("This project has no linked repository, and this runner only takes code tasks (acceptRepoless is off). Link a repository to the project, or enable repo-less tasks on the runner.");
      }
      scratch = prepareScratch(config.home, claim.runId);
      log.info(`Repo-less workspace: ${scratch}`);

      const { agentConfig, token } = await startAgentSession(config, api);
      log.info("Claude Code at work on a repo-less task (follow it live in TaskForce)...");
      const outcome = await runAgent(agentConfig, claim, scratch, token, { mode: "repoless", signal, rules }, api);
      logOutcome(outcome);
      if (!outcome.ok) throw new Error(outcome.text);
      result = { status: "DONE", summary: outcome.text.slice(0, 7900) };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(`Run #${claim.runId} failed: ${message}`);
    result = { status: "FAILED", error: message.slice(0, 3900) };
  } finally {
    clearInterval(heartbeat);
  }

  try {
    await api.result(claim.runId, result);
    log.info(`Run #${claim.runId}: ${result.status} result posted`);
  } catch (e) {
    log.error(`Result of run #${claim.runId} not posted: ${(e as Error).message}`);
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
    console.log(`  ${good ? "[ok]" : "[KO]"} ${label}${detail ? `: ${detail}` : ""}`);
    if (!good) ok = false;
  };

  console.log(`Runner ${config.clientId} -> ${config.apiUrl}`);
  try {
    const { expiresAt } = await api.token(true);
    line(true, "Machine token (Keycloak, relayed by TaskForce)", `valid for ${Math.round((expiresAt - Date.now()) / 60_000)} min`);
  } catch (e) {
    const status = e instanceof ApiError ? ` (HTTP ${e.status})` : "";
    line(false, "Machine token", `${(e as Error).message}${status}. Is TaskForce reachable at this URL, with the local runner enabled (DELIVERY_LOCAL_RUNNER_ENABLED=true)? Are the credentials in .env the latest ones?`);
  }

  for (const tool of ["git", "gh", config.agent.command]) {
    const probe = await run(tool, ["--version"], { timeoutMs: 20_000 }).catch(() => null);
    const found = probe !== null && probe.code === 0;
    const where = resolveCommand(tool).file;
    const needed = tool !== "gh" || (config.push && config.openPullRequest);
    const why = probe === null ? `not found (${where})` : `"${where} --version" exited with code ${probe.code}`;
    const version = found ? (probe.stdout.trim().split(/\r?\n/)[0] ?? "") : "";
    if (found && tool === config.agent.command && !supportsApprovals(version)) {
      line(false, tool, `${version}: Claude Code ${MIN_CLAUDE_CODE} or later is needed for the rules and approvals in TaskForce (npm install -g @anthropic-ai/claude-code)`);
    } else if (found) line(true, tool, version);
    else if (needed) line(false, tool, why);
    else console.log(`  [--] ${tool}: ${why}, not needed here`);
  }

  const repos = Object.entries(config.repos);
  if (config.autoClone) {
    console.log(`  [ok] Repositories: cloned on demand into ${join(config.home, "repos")} (nothing to configure)`);
  } else if (repos.length === 0) {
    line(false, "Repositories", "none in runner.config.json, and autoClone is off");
  }
  for (const [name, repo] of repos) {
    const probe = await run("git", ["-C", repo.path, "rev-parse", "--is-inside-work-tree"]).catch(() => null);
    line(probe !== null && probe.code === 0, `Repository ${name}`, `${repo.path} (base ${repo.baseBranch})`);
  }
  console.log(`  Claude Code sign-in: ${config.agent.auth === "subscription" ? "subscription (the person's own login, in their Claude Code)" : "API key"}`);
  console.log(`  Leaving the machine: ${config.push ? (config.openPullRequest ? "push + pull request" : "push only") : "nothing (local branch)"}`);
  console.log(`  Repo-less tasks (non-code): ${config.acceptRepoless ? "accepted, result posted as a comment" : "refused (code only)"}`);
  console.log(`  Rules: each action is judged by the rules TaskForce sends with the task; those they ask for wait up to ${config.agent.approvalTimeoutMinutes} min for your answer in TaskForce, then are denied`);
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
    log.info("Stop requested: the runner exits after the current run (Ctrl+C again to force).");
  });

  // Lancé par l'app desktop (canal IPC) : à sa fermeture, elle envoie « stop » ; si elle disparaît, le canal se
  // coupe. Le run en cours s'arrête tout de suite et finit en échec, dit à TaskForce, au lieu de tourner sans elle.
  const shutdown = new AbortController();
  const stopNow = () => {
    if (shutdown.signal.aborted) return;
    stopping = true;
    log.info("Stop requested by TaskForce: the current run stops now.");
    shutdown.abort();
  };
  if (process.send) {
    process.on("message", (message) => {
      if (message === "stop") stopNow();
    });
    process.on("disconnect", stopNow);
  }

  log.info(`Runner ${config.clientId} listening to ${config.apiUrl} (every ${config.pollSeconds} s)`);
  let lastError = "";
  while (!stopping) {
    try {
      const claim = await api.claim();
      lastError = "";
      if (claim) {
        await processRun(config, api, claim, shutdown.signal);
        if (args.has("--once")) break;
        continue;
      }
      if (args.has("--once")) {
        log.info("No run is waiting.");
        break;
      }
    } catch (e) {
      // Backend redémarré, réseau coupé : on réessaie, sans noyer le journal du même message.
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError) log.warn(`TaskForce unreachable or refused: ${message}`);
      lastError = message;
      if (args.has("--once")) process.exit(1);
    }
    await sleep(config.pollSeconds * 1000, undefined, { signal: shutdown.signal }).catch(() => undefined);
  }
  // Le canal IPC garderait le processus en vie.
  if (process.connected) process.disconnect();
}

main().catch((e: unknown) => {
  log.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
