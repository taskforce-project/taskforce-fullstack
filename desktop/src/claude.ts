import { runTool } from "./tools";

/**
 * Claude Code en mode interactif dans l'app desktop : la personne branche son propre Claude Code (terminal, IDE) sur
 * le serveur MCP d'un espace de travail, avec un jeton personnel créé par l'app. Elle y travaille ses issues avec tout
 * ce que Claude Code sait faire. C'est l'équivalent en un clic de la commande que la webapp affiche
 * (`claude mcp add --transport http taskforce ...`), à la portée « user » de Claude Code (tous ses projets).
 *
 * Le serveur n'est joignable que pendant que l'app tourne, à l'adresse de sa fenêtre (port stable par compte). Le jeton
 * passe de la page à `claude` sans être écrit ailleurs ; Claude Code le garde dans sa configuration, comme pour tout
 * serveur MCP à en-tête.
 */

/** Espace de travail tel que l'URL du serveur MCP l'accepte (`PersonalTokenScopeFilter`). */
export function isWorkspaceSlug(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

/** Jeton personnel : `tfp_` et 32 octets en base64url (`PersonalAccessTokenService`). */
export function isPersonalToken(value: unknown): value is string {
  return typeof value === "string" && /^tfp_[A-Za-z0-9_-]{43}$/.test(value);
}

/** Nom du serveur dans Claude Code : un par espace, ses outils s'appellent `mcp__taskforce-<espace>__<outil>`. */
export function mcpServerName(slug: string): string {
  return `taskforce-${slug.toLowerCase()}`;
}

/** Adresse du serveur MCP de l'espace, derrière l'origine de la fenêtre de l'app. */
export function mcpServerUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/api/workspaces/${slug}/mcp`;
}

/**
 * Adresse du serveur lue dans la réponse de `claude mcp get` (ligne `URL: ...`). La réponse contient aussi l'en-tête et
 * donc le jeton : on n'en garde que l'adresse.
 */
export function parseMcpUrl(output: string): string | null {
  return /^\s*URL:\s*(\S+)\s*$/m.exec(output)?.[1] ?? null;
}

export interface McpConnection {
  /** Claude Code connaît un serveur TaskForce pour cet espace. */
  connected: boolean;
  /** Il vise l'adresse actuelle de l'app (sinon l'app a changé de port : il faut le reconnecter). */
  current: boolean;
}

export async function mcpConnection(origin: string, slug: string): Promise<McpConnection> {
  const result = await runTool("claude", ["mcp", "get", mcpServerName(slug)], 60_000);
  if (!result || result.code !== 0) return { connected: false, current: false };
  return { connected: true, current: parseMcpUrl(result.stdout) === mcpServerUrl(origin, slug) };
}

/** Branche Claude Code sur le serveur de l'espace, en remplaçant un branchement précédent du même nom. */
export async function connectMcp(origin: string, slug: string, token: string): Promise<void> {
  const name = mcpServerName(slug);
  await runTool("claude", ["mcp", "remove", name, "--scope", "user"], 60_000);
  const result = await runTool("claude", [
    "mcp", "add", "--scope", "user", "--transport", "http", name, mcpServerUrl(origin, slug),
    "--header", `Authorization: Bearer ${token}`,
  ], 60_000);
  if (!result) throw new Error("Claude Code is not installed on this computer");
  if (result.code !== 0) throw new Error(firstLine(result.stderr) ?? "Claude Code refused the connection");
}

/** Première ligne d'une erreur de `claude`, sans jeton personnel s'il y figurait. */
export function firstLine(stderr: string): string | null {
  const line = stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return line ? line.replace(/tfp_[A-Za-z0-9_-]+/g, "tfp_...").slice(0, 200) : null;
}

export async function disconnectMcp(slug: string): Promise<void> {
  const result = await runTool("claude", ["mcp", "remove", mcpServerName(slug), "--scope", "user"], 60_000);
  if (!result) throw new Error("Claude Code is not installed on this computer");
}
