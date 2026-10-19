import { isAbsolute, relative } from "node:path";

/**
 * Lecture de la sortie `--output-format stream-json` de Claude Code : une ligne JSON par message.
 *
 * Deux usages : la chronologie montrée dans TaskForce (événements compacts, texte borné) et le résultat final
 * du run (la ligne `type: "result"`, qui n'est pas toujours la dernière : un résumé de tâche peut la suivre).
 */

/** Événement de la chronologie d'un run, tel que le backend le stocke. */
export interface RunEvent {
  kind: "start" | "text" | "tool" | "error" | "denied";
  tool?: string;
  text: string;
}

export interface AgentOutcome {
  ok: boolean;
  /** Résumé final de l'agent (quand ok) ou message d'échec. */
  text: string;
  costUsd: number | null;
  turns: number | null;
}

const MAX_TEXT = 600;

function clip(text: string, max = MAX_TEXT): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

/** Chemin montré relatif au dossier de travail : la chronologie ne doit pas exposer l'arborescence du poste. */
function shownPath(path: unknown, workDir: string): string {
  if (typeof path !== "string" || !path) return "";
  if (!isAbsolute(path)) return path;
  const rel = relative(workDir, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.replaceAll("\\", "/") : path.split(/[\\/]/).pop() ?? path;
}

/** Nom court d'un outil : `mcp__taskforce__get_issue` -> `taskforce: get_issue`. */
export function toolLabel(name: string): string {
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]}: ${mcp[2]}` : name;
}

/** Résumé lisible de l'appel d'un outil, pour la chronologie et pour une demande de validation. */
export function describeToolInput(tool: string, input: unknown, workDir: string): string {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (tool) {
    case "Bash":
      return clip(String(args.command ?? ""), 400);
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return shownPath(args.file_path ?? args.notebook_path, workDir);
    case "Glob":
    case "Grep":
      return clip(String(args.pattern ?? ""), 200);
    case "WebFetch":
      return clip(String(args.url ?? ""), 300);
    case "WebSearch":
      return clip(String(args.query ?? ""), 200);
    default: {
      const json = JSON.stringify(args);
      return json === "{}" ? "" : clip(json, 300);
    }
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : "")).join(" ");
  }
  return "";
}

/** Événements de la chronologie portés par une ligne de la sortie, souvent aucun. */
export function toEvents(message: unknown, workDir: string): RunEvent[] {
  if (!message || typeof message !== "object") return [];
  const line = message as Record<string, unknown>;

  if (line.type === "system" && line.subtype === "init") {
    const model = typeof line.model === "string" ? line.model : "";
    const version = typeof line.claude_code_version === "string" ? line.claude_code_version : "";
    return [{ kind: "start", text: clip(`Claude Code ${version} started${model ? ` with ${model}` : ""}`.replace(/\s+/g, " ")) }];
  }
  if (line.type === "system" && line.subtype === "permission_denied") {
    const tool = typeof line.tool_name === "string" ? line.tool_name : "";
    return [{ kind: "denied", tool: toolLabel(tool), text: clip(String(line.message ?? "Denied")) }];
  }

  const inner = (line.message ?? {}) as Record<string, unknown>;
  const content = Array.isArray(inner.content) ? (inner.content as Array<Record<string, unknown>>) : [];
  const events: RunEvent[] = [];
  if (line.type === "assistant") {
    for (const part of content) {
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        events.push({ kind: "text", text: clip(part.text) });
      } else if (part.type === "tool_use" && typeof part.name === "string" && part.name !== "ToolSearch") {
        events.push({ kind: "tool", tool: toolLabel(part.name), text: describeToolInput(part.name, part.input, workDir) });
      }
    }
  } else if (line.type === "user") {
    for (const part of content) {
      // Seuls les échecs d'outils comptent pour la chronologie : un résultat réussi suit son appel.
      if (part.type === "tool_result" && part.is_error === true) {
        const text = contentText(part.content);
        if (!/^Denied in TaskForce/.test(text)) events.push({ kind: "error", text: clip(text || "Tool error", 300) });
      }
    }
  }
  return events;
}

/**
 * Résultat du run d'après la ligne `type: "result"` de la sortie (la dernière si plusieurs), ou d'après le code de
 * sortie et stderr quand elle manque.
 */
export function parseAgentOutput(code: number | null, stdout: string, stderr: string): AgentOutcome {
  let result: Record<string, unknown> | null = null;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("{")) continue;
    try {
      const json = JSON.parse(line) as Record<string, unknown>;
      if (json.type === "result" || (json.type === undefined && "subtype" in json)) result = json;
    } catch {
      // ligne partielle ou non JSON : ignorée
    }
  }
  const costUsd = typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null;
  const turns = typeof result?.num_turns === "number" ? result.num_turns : null;
  const resultText = typeof result?.result === "string" ? result.result.trim() : "";
  const failed = code !== 0 || result?.is_error === true
    || (typeof result?.subtype === "string" && result.subtype !== "success");

  if (failed) {
    const reason = resultText
      || (typeof result?.subtype === "string" ? `Claude Code stopped: ${result.subtype}` : "")
      || stderr.trim().split(/\r?\n/).slice(-3).join(" | ")
      || `Claude Code exited with code ${code}`;
    return { ok: false, text: reason.slice(0, 3900), costUsd, turns };
  }
  if (!resultText) {
    return { ok: false, text: "Claude Code finished without a summary.", costUsd, turns };
  }
  return { ok: true, text: resultText, costUsd, turns };
}
