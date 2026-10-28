import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { Facts } from "./rules.js";

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
};

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

/** Un mot qui désigne un chemin hors de la copie : absolu, `~`, qui remonte par `..`, ou dans `.git`. */
function pointsOutside(word: string, workDir: string): boolean {
  if (!/[\\/~]/.test(word) && !word.startsWith("..")) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(word)) return false; // une adresse, pas un chemin
  return word.startsWith("~") || !locate(workDir, word).bounded;
}

/**
 * Une commande simple. Elle se borne à son nom et à ses arguments : `npm test --prefix ../ailleurs` ou
 * `npm run build -- --outDir ../../x` portent le nom d'une commande permise mais travaillent hors de la copie.
 */
function commandFacts(command: string, workDir: string): Facts[] {
  // `git commit` reste dans la copie : action à part entière, couverte par sa règle.
  const facts: Facts = { action: /^git commit( |$)/.test(command) ? "git.commit" : "shell", tool: "Bash", command };
  return OPAQUE.test(command) || words(command).some((w) => pointsOutside(w, workDir)) ? unbounded(facts) : [facts];
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
 * Où tombe un chemin, liens suivis : relatif à la copie quand il y est, absolu sinon. `.git` est dans la copie mais
 * n'est pas le travail de l'agent : un hook ou un `core.fsmonitor` écrit là s'exécuterait au prochain commit.
 */
function locate(workDir: string, path: string): { path: string; bounded: boolean } {
  const target = realPath(resolve(workDir, path));
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
    return parts.length > 0 ? parts.flatMap((part) => commandFacts(part, workDir)) : [{ tool: "Bash", command }];
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
