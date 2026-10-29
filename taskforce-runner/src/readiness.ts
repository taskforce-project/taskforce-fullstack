/**
 * Ce qui empêche Claude Code de partir sur ce poste, lu avant de prendre une mission (R37, séance n°7 du Conseil). La
 * recette du 29/10/2026 a vu quatre missions réclamées puis en échec au démarrage : Claude Code n'était plus connecté,
 * et le runner ne regardait que sa version. Le runner ne réclame plus rien tant qu'un problème connu demeure, et le
 * dit à TaskForce, qui ne propose plus l'agent.
 */
import type { RunnerConfig } from "./config.js";
import { run } from "./proc.js";
import { MIN_CLAUDE_CODE, supportsApprovals } from "./version.js";

/** Un problème connu, transmis à TaskForce par son code ; le texte reste ici, pour le journal du runner. */
export type AgentProblem = "claude-missing" | "claude-outdated" | "claude-signed-out";

export const PROBLEM_TEXT: Record<AgentProblem, string> = {
  "claude-missing": "Claude Code isn't installed on this computer: npm install -g @anthropic-ai/claude-code",
  "claude-outdated": `Claude Code ${MIN_CLAUDE_CODE} or later is needed for the rules to hold: npm install -g @anthropic-ai/claude-code`,
  "claude-signed-out": "Claude Code isn't signed in on this computer: run claude auth login",
};

/** Sortie JSON de `claude auth status` : connecté, déconnecté, ou inconnu (sortie illisible, version sans la commande). */
export function parseSignedIn(stdout: string): boolean | null {
  try {
    const status = JSON.parse(stdout.trim()) as { loggedIn?: unknown };
    return typeof status.loggedIn === "boolean" ? status.loggedIn : null;
  } catch {
    return null;
  }
}

/** Lance une commande ; remplaçable dans les tests. */
type Exec = typeof run;

/** Connexion de Claude Code. Une clé d'API n'en demande pas ; un état illisible ne bloque rien. */
export async function signedIn(config: RunnerConfig, exec: Exec = run): Promise<boolean | null> {
  if (config.agent.auth !== "subscription") return true;
  const status = await exec(config.agent.command, ["auth", "status"], { timeoutMs: 20_000 }).catch(() => null);
  return status ? parseSignedIn(status.stdout) : null;
}

/** Le premier problème qui empêcherait la mission de partir, ou `null`. */
export async function agentProblem(config: RunnerConfig, exec: Exec = run): Promise<AgentProblem | null> {
  const probe = await exec(config.agent.command, ["--version"], { timeoutMs: 20_000 }).catch(() => null);
  if (!probe || probe.code !== 0) return "claude-missing";
  if (!supportsApprovals(probe.stdout.trim().split(/\r?\n/)[0] ?? "")) return "claude-outdated";
  return (await signedIn(config, exec)) === false ? "claude-signed-out" : null;
}

/** L'état lu une fois par minute au plus : `claude` démarre en une seconde, la boucle tourne toutes les 5 s. */
export class Readiness {
  private checkedAt = Number.NEGATIVE_INFINITY;
  private problem: AgentProblem | null = null;

  constructor(
    private readonly read: () => Promise<AgentProblem | null>,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async current(): Promise<AgentProblem | null> {
    if (this.now() - this.checkedAt >= this.ttlMs) {
      this.problem = await this.read();
      this.checkedAt = this.now();
    }
    return this.problem;
  }

  /** Relire au prochain tour : après un échec, l'état a pu changer. */
  invalidate(): void {
    this.checkedAt = Number.NEGATIVE_INFINITY;
  }
}
