import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { runShell, type ProcOptions, type ProcResult } from "./proc.js";

/**
 * Les tests du projet, lancés par le runner après le travail de l'agent (niveau S1, décidé le 28/10/2026, R32) : la
 * commande déclarée dans TaskForce, jamais une commande de l'agent, qui n'a plus le droit de lancer les scripts du dépôt.
 *
 * Elle s'exécute sur cet ordinateur et peut faire tourner du code que l'agent a écrit : la personne qui délègue
 * l'accepte une première fois depuis TaskForce, et de nouveau quand elle change. L'accord se garde sur le poste, par
 * dépôt et par commande exacte. L'isolation de la machine (S3) reste la vraie réponse.
 */

export interface TestRun {
  command: string;
  /** Faux : pas lancés (refusés par la personne). */
  ran: boolean;
  passed: boolean;
  /** Une ligne pour la chronologie et le résumé du run. */
  summary: string;
  /** La fin de la sortie, pour la pull request et le dossier. */
  tail: string;
}

/** Le dernier morceau de la sortie, borné : la fin dit le plus souvent ce qui a échoué. */
export function outputTail(result: Pick<ProcResult, "stdout" | "stderr">, max = 3000): string {
  const text = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
  return text.length > max ? `...${text.slice(text.length - max)}` : text;
}

export function seconds(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Les commandes déjà acceptées sur ce poste, par dépôt. Un fichier illisible vaut une liste vide : on redemande. */
export class ApprovedTests {
  constructor(private readonly file: string) {}

  static in(home: string): ApprovedTests {
    return new ApprovedTests(join(home, "approved-tests.json"));
  }

  private read(): Record<string, string[]> {
    if (!existsSync(this.file)) return {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  }

  has(repo: string, command: string): boolean {
    return (this.read()[repo] ?? []).includes(command);
  }

  add(repo: string, command: string): void {
    const all = this.read();
    all[repo] = [...new Set([...(all[repo] ?? []), command])];
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(all, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}

export interface TestDeps {
  /** Pose la demande dans TaskForce ; vrai si la personne accepte. */
  ask: (tool: string, summary: string) => Promise<boolean>;
  approved: ApprovedTests;
  /** Lance la ligne de commande (le shell du système, ou un faux dans les tests). */
  shell?: (commandLine: string, options: ProcOptions) => Promise<ProcResult>;
}

/** Lance la commande de test déclarée dans la copie, après accord pour une commande nouvelle sur ce poste. */
export async function runProjectTests(
  command: string, repo: string, cwd: string, timeoutMs: number, deps: TestDeps, signal?: AbortSignal,
): Promise<TestRun> {
  if (!deps.approved.has(repo, command)) {
    // Sans point final, comme les autres demandes : l'écran ajoute « : Allowed by ... » une fois la réponse donnée.
    const ok = await deps.ask("Run the project's tests",
      `\`${command}\` in ${repo}, on your computer: it runs the code of this branch, the agent's included`);
    if (!ok) {
      return { command, ran: false, passed: false, summary: `Tests not run: \`${command}\` was not allowed on this computer.`, tail: "" };
    }
    deps.approved.add(repo, command);
  }
  const started = Date.now();
  const result = await (deps.shell ?? runShell)(command, { cwd, timeoutMs, signal });
  const took = seconds(Date.now() - started);
  const tail = outputTail(result);
  if (result.timedOut) {
    return { command, ran: true, passed: false, summary: `Tests stopped after ${took}: \`${command}\` took too long.`, tail };
  }
  const passed = result.code === 0;
  return {
    command, ran: true, passed,
    summary: passed ? `Tests passed: \`${command}\` (${took}).` : `Tests failed: \`${command}\` exited with code ${result.code} (${took}).`,
    tail,
  };
}
