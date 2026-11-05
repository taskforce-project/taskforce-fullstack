import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { Facts } from "./engine/rules-engine.js";

/**
 * Ce qu'on sait d'une action de Claude Code avant qu'elle parte, pour la juger (contracts/README.md). Une action qu'on
 * ne sait pas décrire n'a pas de classe : aucune règle ne la couvre, elle est donc demandée (invariant 3).
 */

/**
 * Outils internes de Claude Code, sans effet hors de la session : ni fichier, ni réseau, ni commande. Les actions d'un
 * sous-agent (`Task`, `Agent`) passent elles-mêmes par le hook.
 */
export const INTERNAL_TOOLS: ReadonlySet<string> = new Set(["TodoWrite", "ExitPlanMode", "Task", "Agent", "ToolSearch", "Skill"]);

/** Outils MCP de TaskForce (serveur `taskforce`) et l'action que chacun fait. */
export const TASKFORCE_TOOLS: Readonly<Record<string, string>> = {
  get_issue: "issue.read",
  list_projects: "issue.read",
  list_issues: "issue.read",
  list_issue_statuses: "issue.read",
  list_my_issues: "issue.read",
  workspace_kpis: "issue.read",
  brain_search: "knowledge.search",
  add_comment: "comment.create",
  create_issue: "issue.create",
  update_issue: "issue.update",
  // Cocher une ligne de la checklist change l'issue, et se défait d'un geste : la règle update-issue le permet (R77).
  check_checklist_item: "issue.update",
  // Les gestes de la conversation (ADR-024) : confier une issue lance une mission, lire la sienne ne change rien.
  delegate_issue: "mission.start",
  get_mission: "issue.read",
  // Supprimer une issue ne se défait pas : la règle delete-issue la demande.
  delete_issue: "issue.delete",
  // Créer un projet, geste du MCP depuis R115 (séance n°17) : hors de la portée d'une mission, jamais proposé à l'agent.
  create_project: "project.create",
};

/**
 * Les actions de TaskForce qui y changent quelque chose : la porte en compte le nombre sur une mission, et demande
 * au-delà d'un plafond (R110, séance n°16 ; approvals.ts).
 */
export const TASKFORCE_CHANGES: ReadonlySet<string> = new Set(["issue.update", "issue.create", "comment.create", "project.create"]);

/** Un outil MCP de TaskForce qui y change quelque chose (une issue, sa checklist, un commentaire, une issue créée). */
export function changesTaskForce(toolName: string): boolean {
  const name = /^mcp__taskforce__([a-z_]+)$/.exec(toolName)?.[1];
  return name !== undefined && Object.hasOwn(TASKFORCE_TOOLS, name)
    && TASKFORCE_CHANGES.has(TASKFORCE_TOOLS[name] ?? "");
}

const FILE_TOOLS: Record<string, string> = {
  Read: "file.read",
  Glob: "file.search",
  Grep: "file.search",
  Edit: "file.write",
  MultiEdit: "file.write",
  Write: "file.write",
  NotebookEdit: "file.write",
};

/**
 * `"$(cat <<'EOF' … EOF)"` : un texte pris tel quel (délimiteur entre guillemets, rien n'y est évalué), la forme que
 * Claude Code donne à un message de commit. Le corps s'arrête à la première ligne qui ressemble au délimiteur, et
 * doit alors se fermer : sinon la commande reste entière, donc opaque.
 */
const QUOTED_HEREDOC = /\$\(cat <<-?(['"])(\w+)\1[ \t]*\n(?:(?![ \t]*\2[ \t]*\n)[^\n]*\n)*[ \t]*\2[ \t]*\n?[ \t]*\)/g;

/**
 * Ce qu'une commande peut faire au-delà de ce qu'elle nomme : en lancer une autre (substitution), lire ou écrire un
 * fichier par redirection, écrire là où une option le dit (`--output`). `2>&1` ne touche aucun fichier et reste permis.
 */
const OPAQUE = /\$\(|`|<|>(?!&[\d-])|--output/;

/**
 * Ce que le shell change avant d'exécuter : une variable (`$HOME`), un calcul, une accolade qui se déplie (`{a,/etc/x}`,
 * `{1..3}`), un antislash hors guillemets (bash le retire, le module des chemins y voit un séparateur). Le mot qu'on lit
 * n'est alors pas celui qui s'exécute. Entre guillemets simples rien ne change ; entre guillemets doubles, seul `$`.
 */
function expands(command: string): boolean {
  let quote: "'" | "\"" | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i);
    if (quote === "'") {
      if (c === "'") quote = null;
    } else if (c === "$") {
      return true;
    } else if (quote === "\"") {
      if (c === "\\") i++;
      else if (c === "\"") quote = null;
    } else if (c === "\\") {
      return true;
    } else if (c === "'" || c === "\"") {
      quote = c;
    } else if (c === "{") {
      const end = command.indexOf("}", i);
      if (end > i && /,|\.\./.test(command.slice(i + 1, end))) return true;
    }
  }
  return false;
}

/**
 * Une action qu'on ne sait pas borner (commande opaque, chemin hors de la copie) : les règles qui refusent s'y
 * appliquent, celles qui autorisent non. Au mieux, elle est demandée.
 */
function unbounded(facts: Facts): Facts[] {
  const { action: _action, ...rest } = facts;
  return [facts, rest];
}

/**
 * Découpe une commande composée en commandes simples (`&&`, `||`, `;`, `|`, `&`, retour à la ligne), hors des
 * guillemets. Chaque morceau se juge seul : `npm test && npm publish` n'est pas `npm test`.
 */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i);
    if (quote) {
      current += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === "\"") {
      quote = c;
      current += c;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      parts.push(current);
      current = "";
      i++;
    } else if (c === ";" || c === "|" || c === "\n" || (c === "&" && command.charAt(i - 1) !== ">" && command.charAt(i + 1) !== ">")) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim().replace(/\s+/g, " ")).filter((p) => p.length > 0);
}

/** Les mots d'une commande simple, guillemets ôtés ; une option `--clé=valeur` compte pour sa valeur. */
function words(command: string): string[] {
  const out: string[] = [];
  for (const match of command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    const word = match[1] ?? match[2] ?? match[3] ?? "";
    out.push(word.startsWith("-") && word.includes("=") ? word.slice(word.indexOf("=") + 1) : word);
  }
  return out;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Un mot qui désigne un chemin hors de la copie, lu depuis `base` : absolu, `~`, qui remonte par `..`, dans `.git`, ou
 * un nom nu qui est un lien du dépôt vers l'extérieur.
 */
function pointsOutside(word: string, workDir: string, base: string): boolean {
  if (!/[\\/~]/.test(word) && !word.startsWith("..") && word !== ".git" && !isLink(join(base, word))) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(word)) return false; // une adresse, pas un chemin
  return word.startsWith("~") || !locate(workDir, word, base).bounded;
}

/**
 * Une option courte peut porter sa valeur collée (`-fFICHIER`) : sans les options du programme, on ne sait pas où la
 * valeur commence. Chaque suite possible après la première lettre se lit donc comme un chemin, comme la valeur d'une
 * option `--clé=valeur` ; une seule qui sort de la copie suffit.
 */
function attachedOutside(word: string, workDir: string, base: string): boolean {
  if (!/^-[^-]/.test(word)) return false;
  for (let i = 2; i < word.length; i++) if (pointsOutside(word.slice(i), workDir, base)) return true;
  return false;
}

/** Le dossier où mène `cd`, écrit en toutes lettres ; null sans cible unique (`cd` seul va au dossier personnel, `cd -` au précédent). */
function cdTarget(args: string[]): string | null {
  const targets = args.slice(1).filter((w) => !/^-[LPe@]+$/.test(w));
  return targets.length === 1 && targets[0] !== "-" ? (targets[0] ?? null) : null;
}

/**
 * Une commande simple, lue depuis `base` (le dossier où l'ont menée les `cd` qui la précèdent ; null quand on ne le sait
 * plus). Elle se borne à son nom et à ses arguments : `npm test --prefix ../ailleurs` ou `npm run build -- --outDir
 * ../../x` portent le nom d'une commande permise mais travaillent hors de la copie.
 */
function commandFacts(command: string, workDir: string, base: string | null): Facts[] {
  // `git commit` reste dans la copie : action à part entière, couverte par sa règle.
  const facts: Facts = { action: /^git commit( |$)/.test(command) ? "git.commit" : "shell", tool: "Bash", command };
  const args = words(command);
  const bounded = base !== null && !OPAQUE.test(command) && !expands(command)
    && !(args[0] === "cd" && cdTarget(args) === null)
    && !args.some((w) => pointsOutside(w, workDir, base) || attachedOutside(w, workDir, base));
  return bounded ? [facts] : unbounded(facts);
}

/**
 * Les faits d'une commande, morceau par morceau. `cd` change le dossier des morceaux qui suivent : leurs chemins se
 * lisent depuis là. Après un `cd` qu'on ne sait pas borner, plus aucun morceau ne se borne.
 */
function shellFacts(parts: string[], workDir: string): Facts[] {
  const facts: Facts[] = [];
  let base: string | null = workDir;
  for (const part of parts) {
    const partFacts = commandFacts(part, workDir, base);
    facts.push(...partFacts);
    const args = words(part);
    if (args[0] !== "cd") continue;
    const target = cdTarget(args);
    base = base !== null && target !== null && partFacts.length === 1 ? realPath(resolve(base, target)) : null;
  }
  return facts;
}

/** Le chemin réel, liens suivis ; pour un fichier à créer, celui de son dossier. */
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(realPath(parent), basename(path));
  }
}

/**
 * Où tombe un chemin lu depuis `base` (la copie par défaut), liens suivis : relatif à la copie quand il y est, absolu
 * sinon. `.git` est dans la copie mais n'est pas le travail de l'agent : un hook ou un `core.fsmonitor` écrit là
 * s'exécuterait au prochain commit.
 */
function locate(workDir: string, path: string, base: string = workDir): { path: string; bounded: boolean } {
  const target = realPath(resolve(base, path));
  const rel = relative(realPath(resolve(workDir)), target).split("\\").join("/");
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return { path: target.split("\\").join("/"), bounded: false };
  return { path: rel || ".", bounded: rel !== ".git" && !rel.startsWith(".git/") };
}

/** Un motif de recherche qui vise hors de la copie (`/home/**`, `~/.ssh/*`, `../**`). */
function escapes(pattern: string): boolean {
  return isAbsolute(pattern) || pattern.startsWith("~") || pattern.split(/[\\/]/).includes("..");
}

/**
 * Les faits d'un appel d'outil : plusieurs pour une commande composée (un par morceau) ou une action qu'on ne sait pas
 * borner, aucun pour un outil interne. Le plus strict l'emporte (`decideAll`).
 * `tool_input` vient de Claude Code : on n'en lit que ce qui sert à juger.
 */
export function toolFacts(toolName: string, toolInput: unknown, workDir: string): Facts[] {
  if (INTERNAL_TOOLS.has(toolName)) return [];
  const input = (toolInput && typeof toolInput === "object" ? toolInput : {}) as Record<string, unknown>;

  const fileAction = FILE_TOOLS[toolName];
  if (fileAction) {
    if (toolName === "Glob" && typeof input.pattern === "string" && escapes(input.pattern)) {
      return unbounded({ action: fileAction, tool: toolName, path: input.pattern.split("\\").join("/") });
    }
    const raw = [input.file_path, input.path, input.notebook_path].find((v) => typeof v === "string") as string | undefined;
    if (raw === undefined) return [{ action: fileAction, tool: toolName }];
    const where = locate(workDir, raw);
    const facts: Facts = { action: fileAction, tool: toolName, path: where.path };
    return where.bounded ? [facts] : unbounded(facts);
  }

  if (toolName === "Bash") {
    const command = (typeof input.command === "string" ? input.command : "").replace(/\r\n/g, "\n");
    const parts = splitCommand(command.replace(QUOTED_HEREDOC, "…"));
    return parts.length > 0 ? shellFacts(parts, workDir) : [{ tool: "Bash", command }];
  }

  if (toolName === "WebFetch") return [{ action: "web.fetch", tool: toolName }];
  if (toolName === "WebSearch") return [{ action: "web.search", tool: toolName }];

  const mcp = /^mcp__taskforce__([a-z_]+)$/.exec(toolName);
  if (mcp) {
    const action = TASKFORCE_TOOLS[mcp[1] ?? ""];
    return [action ? { action, tool: toolName } : { tool: toolName }];
  }
  return [{ tool: toolName }];
}
