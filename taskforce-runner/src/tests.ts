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
  /** Combien ont passé, sur combien, quand la sortie le dit (carte de résultat, R78). */
  counts?: TestCounts;
}

export interface TestCounts {
  passed: number;
  total: number;
}

const ANSI = /\x1b\[[0-9;]*m/g;

/** La dernière correspondance d'une expression dans le texte : un résumé final suit les résumés intermédiaires. */
function lastMatch(text: string, pattern: RegExp): RegExpExecArray | null {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let last: RegExpExecArray | null = null;
  for (let m = global.exec(text); m; m = global.exec(text)) last = m;
  return last;
}

const count = (text: string, word: RegExp): number => Number(word.exec(text)?.[1] ?? 0);

/**
 * Combien de tests ont passé, sur combien, lu dans la ligne de résumé des outils courants : Vitest, Jest, Maven
 * (Surefire), `node:test` et pytest. Null quand la sortie n'en a pas : la carte dit alors seulement s'ils ont passé.
 */
export function testCounts(output: string): TestCounts | null {
  const text = output.replace(ANSI, "");
  // Vitest : « Tests  2 failed | 1246 passed (1248) »
  const vitest = lastMatch(text, /^\s*Tests\s+(.*?)\s*\((\d+)\)\s*$/m);
  const vitestParts = vitest?.[1] ?? "";
  if (vitest && /\d+ (passed|failed)/.test(vitestParts)) return { passed: count(vitestParts, /(\d+) passed/), total: Number(vitest[2]) };
  // Jest : « Tests:       1 failed, 11 passed, 12 total »
  const jest = lastMatch(text, /^Tests:\s+(.*?)(\d+) total/m);
  if (jest) return { passed: count(jest[1] ?? "", /(\d+) passed/), total: Number(jest[2]) };
  // Maven : « Tests run: 231, Failures: 0, Errors: 0, Skipped: 0 », le dernier est le total.
  const maven = lastMatch(text, /Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/);
  if (maven) {
    const [run = 0, failures = 0, errors = 0, skipped = 0] = maven.slice(1, 5).map(Number);
    return { passed: run - failures - errors - skipped, total: run };
  }
  // node:test : « ℹ tests 331 » puis « ℹ pass 331 »
  const nodeTests = lastMatch(text, /^ℹ tests (\d+)\s*$/m);
  const nodePass = lastMatch(text, /^ℹ pass (\d+)\s*$/m);
  if (nodeTests && nodePass) return { passed: Number(nodePass[1]), total: Number(nodeTests[1]) };
  // pytest : « ==== 12 passed, 1 failed in 0.12s ==== »
  const pytest = lastMatch(text, /^=+ (.*?\d+ (?:passed|failed).*?) in [\d.]+s/m);
  if (pytest) {
    const parts = pytest[1] ?? "";
    const passed = count(parts, /(\d+) passed/);
    return { passed, total: passed + count(parts, /(\d+) failed/) + count(parts, /(\d+) errors?/) };
  }
  return null;
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
  const counts = testCounts(`${result.stdout}\n${result.stderr}`);
  return {
    command, ran: true, passed,
    summary: passed ? `Tests passed: \`${command}\` (${took}).` : `Tests failed: \`${command}\` exited with code ${result.code} (${took}).`,
    tail,
    ...(counts ? { counts } : {}),
  };
}
