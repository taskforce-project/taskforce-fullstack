import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { CommandResult, CommandTrace, RunnerCommand } from "./api.js";
import type { ChangeSnapshot } from "./changes.js";
import { commitsSince, repoChanges } from "./changes.js";
import type { RepoConfig, RunnerConfig } from "./config.js";
import { exitFacts } from "./exits.js";
import {
  BranchGoneError, branchIsPushed, isCommitSha, isMissionBranch, isSafeRepoPath, pushBranch, reopenWorktree, repoVisibility,
  resolveRepo, revertFile, removeWorktree, worktreeDir,
} from "./git.js";
import { decide, type Facts, type RulesBundle } from "./harness/engine/rules-engine.js";
import { verifiedBundle } from "./harness/verify.js";
import { log } from "./log.js";

/**
 * Les ordres que TaskForce donne à ce poste, hors d'une réclamation de mission (R139, R140) : remettre un fichier comme
 * avant, passer une correction à l'agent. Le backend ne joint pas un poste local : le runner vient les chercher.
 */

/** Ce que le runner attend de l'API TaskForce (le client réel, ou un faux dans les tests). */
export interface CommandApi {
  commands(): Promise<RunnerCommand[]>;
  commandResult(commandId: number, result: CommandResult): Promise<void>;
}

/** Les missions en train de tourner sur ce poste, et le moyen de leur parler. */
export class LiveMissions {
  private readonly agents = new Map<number, (text: string) => boolean>();

  attach(runId: number, tell: (text: string) => boolean): void {
    this.agents.set(runId, tell);
  }

  detach(runId: number): void {
    this.agents.delete(runId);
  }

  /** Vrai si le texte est parti vers l'agent de cette mission. */
  tell(runId: number, text: string): boolean {
    return this.agents.get(runId)?.(text) ?? false;
  }
}

/** Ce qu'une personne lit quand le geste n'a pas pu se faire : ce qui s'est passé, et quoi faire (R133). */
const REFUSED = (why: string): string => `TaskForce didn't put this file back: ${why}.`;

/**
 * Les règles de la mission jugent le geste avant que rien ne bouge. Le geste de la personne ne lève aucune règle : ce
 * qu'elles refusent ou demandent (un dépôt public, une visibilité inconnue) n'a pas lieu ici, et elle le lit.
 */
function judged(rules: RulesBundle, facts: Facts, trace: CommandTrace[]): string | null {
  const decision = decide(rules, facts);
  trace.push({ action: facts.action ?? "unknown", effect: decision.effect, ...(decision.rule ? { rule: decision.rule.id } : {}) });
  if (decision.effect === "allow") return null;
  return decision.rule?.reason.replace(/\.\s*$/, "") ?? "no rule covers this action";
}

export interface RevertDependencies {
  /** Injectables pour les tests, qui travaillent sur un vrai dépôt git local. */
  repoFor?: (command: RunnerCommand) => Promise<RepoConfig>;
  visibilityOf?: (fullName: string) => Promise<"public" | "private" | null>;
}

/** Remet un fichier comme avant la mission, sur sa branche, poussée si elle l'était déjà ; ne lève jamais. */
export async function executeRevert(config: Pick<RunnerConfig, "home" | "repos" | "autoClone" | "keepWorktree">, command: RunnerCommand, deps: RevertDependencies = {}): Promise<CommandResult> {
  const { path, branch, base, repoFullName } = command;
  if (!isSafeRepoPath(path) || !isMissionBranch(branch) || !isCommitSha(base) || !repoFullName) {
    return { ok: false, message: REFUSED("this mission doesn't say which file or which branch") };
  }
  const trace: CommandTrace[] = [];
  let repo: RepoConfig | null = null;
  let opened = false;
  const key = command.worktreeRun ?? command.runId;
  const worktree = { path: worktreeDir(config.home, key), branch };
  try {
    const rules = verifiedBundle(command.rules);
    for (const facts of [{ action: "file.write", tool: "Edit", path }, { action: "git.commit", tool: "Bash" }] as Facts[]) {
      const no = judged(rules, facts, trace);
      if (no) return { ok: false, message: REFUSED(no), trace };
    }
    repo = await (deps.repoFor ? deps.repoFor(command) : resolveRepo(config.repos, config.autoClone, config.home, repoFullName));
    const visibility = await (deps.visibilityOf ? deps.visibilityOf(repoFullName) : repoVisibility(repoFullName));
    opened = !existsSync(join(worktree.path, ".git"));
    const open = await reopenWorktree(repo, key, branch, base, config.home);

    // La sortie se juge avant le retour en arrière : il a lieu partout (poste et GitHub) ou nulle part.
    const pushed = await branchIsPushed(open, repo);
    if (pushed) {
      const no = judged(rules, exitFacts("git.push", branch, visibility), trace);
      if (no) return { ok: false, message: REFUSED(`its pull request couldn't be updated: ${no}`), trace };
    }

    const { commit } = await revertFile(open.path, base, path);
    if (commit && pushed) await pushBranch(open, repo);
    const snapshot: ChangeSnapshot = await repoChanges(open.path, base);
    const commits = await commitsSince(open.path, base);
    return {
      ok: true,
      message: commit ? `Put ${path} back as it was before the mission.` : `${path} was already as it was before the mission.`,
      ...(commit ? { commit } : {}), commits, pushed: Boolean(commit && pushed), trace,
      // Sans les textes : les autres fichiers n'ont pas changé, TaskForce garde ce qu'il a déjà reçu.
      changes: {
        mode: "repo", base, more: snapshot.more, added: snapshot.added, removed: snapshot.removed, final: true,
        files: snapshot.files.map(({ body: _body, ...file }) => file),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn(`Revert of ${path} refused or failed: ${message}`);
    if (e instanceof BranchGoneError) return { ok: false, gone: true, message: REFUSED("its branch is no longer on this computer or on GitHub"), trace };
    return { ok: false, message: REFUSED(message.slice(0, 300)), trace };
  } finally {
    // Le dossier rouvert pour ce geste ne reste pas : le travail est dans la branche.
    if (opened && repo && !config.keepWorktree) await removeWorktree(repo, worktree).catch(() => undefined);
  }
}

/** Une correction tapée pendant le travail, passée à l'agent : il la lit à sa prochaine étape (R140). */
export function executeCorrection(live: LiveMissions, command: RunnerCommand): CommandResult {
  const text = command.text?.trim();
  if (!text) return { ok: false, message: "This correction is empty." };
  const told = live.tell(command.runId, `A correction from the person who delegated this task, while you work: ${text}`);
  return told
    ? { ok: true, message: "The agent reads it at its next step." }
    : { ok: false, message: "The agent had already finished, so it didn't read this correction." };
}

/** Exécute les ordres de ce poste, l'un après l'autre. Un ordre qui échoue le dit ; la boucle continue. */
export async function drainCommands(api: CommandApi, handle: (command: RunnerCommand) => Promise<CommandResult>): Promise<number> {
  const commands = await api.commands();
  for (const command of commands) {
    const result = await handle(command).catch((e: unknown): CommandResult => ({ ok: false, message: e instanceof Error ? e.message.slice(0, 300) : "The command failed." }));
    await api.commandResult(command.commandId, { ...result, message: result.message.slice(0, 1000) })
      .catch((e: unknown) => log.warn(`Command result not sent to TaskForce: ${(e as Error).message}`));
  }
  return commands.length;
}

/**
 * La boucle des ordres, à côté de celle des missions : une mission qui dure ne retarde ni une correction, ni le retour
 * en arrière d'un fichier d'une autre mission. Un serveur plus ancien répond 404 : la boucle se tait.
 */
export async function pollCommands(config: RunnerConfig, api: CommandApi, live: LiveMissions, signal: AbortSignal): Promise<void> {
  let lastError = "";
  const handle = async (command: RunnerCommand): Promise<CommandResult> => {
    if (command.kind === "CORRECTION") return executeCorrection(live, command);
    return executeRevert(config, command);
  };
  while (!signal.aborted) {
    try {
      await drainCommands(api, handle);
      lastError = "";
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError && !/HTTP 404|not found/i.test(message)) log.warn(`Commands from TaskForce: ${message}`);
      lastError = message;
    }
    await sleep(config.pollSeconds * 1000, undefined, { signal }).catch(() => undefined);
  }
}
