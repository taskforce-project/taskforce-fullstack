import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Dépôt local sur lequel le runner sait travailler. */
export interface RepoConfig {
  /** Checkout local du dépôt (le runner y crée des worktrees, il ne touche jamais sa branche courante). */
  path: string;
  /** Branche de base des pull requests. */
  baseBranch: string;
  /**
   * Commandes lancées dans le worktree avant l'agent : un worktree neuf n'a pas de dépendances. Chaque
   * commande est un tableau d'arguments (`["npm", "ci"]`), jamais une chaîne passée à un shell.
   */
  setup: string[][];
}

export interface AgentConfig {
  /** Exécutable Claude Code. */
  command: string;
  /**
   * Comment Claude Code s'authentifie. C'est le choix de la personne qui fait tourner le runner : il lance
   * SON Claude Code, non modifié, où elle s'est connectée elle-même. TaskForce ne voit jamais ces
   * identifiants (c'est la forme que les conditions d'Anthropic admettent, cf. ADR-013).
   * - `subscription` (défaut) : son login claude.ai. La clé API ambiante est retirée de l'environnement
   *   de l'agent, sinon Claude Code la préférerait et facturerait le compte API sans prévenir.
   * - `api-key` : `ANTHROPIC_API_KEY`, facturé à l'usage.
   */
  auth: "subscription" | "api-key";
  /** Modèle imposé ; null = celui choisi à la délégation, sinon le défaut de Claude Code. */
  model: string | null;
  maxTurns: number;
  timeoutMinutes: number;
  /** false = pas de mention « Co-Authored-By: Claude » dans les commits de l'agent. */
  attribution: boolean;
  /** Outils autorisés en plus du socle (ex. `Bash(npm test:*)`). */
  extraAllowedTools: string[];
}

export interface RunnerConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  /** Dossier de travail du runner : worktrees et fichiers temporaires. */
  home: string;
  repos: Record<string, RepoConfig>;
  /**
   * Dépôt sans entrée dans `repos` : le runner le clone lui-même (avec le `gh` de la personne) dans son
   * dossier de travail. Rien à configurer : créer le projet et son dépôt dans TaskForce suffit.
   */
  autoClone: boolean;
  pollSeconds: number;
  /** false = rien ne sort du poste : ni push, ni pull request (le travail reste sur une branche locale). */
  push: boolean;
  openPullRequest: boolean;
  keepWorktree: boolean;
  /**
   * Tâche déléguée depuis un projet SANS dépôt (non-code) : l'agent travaille dans un dossier temporaire
   * jetable et rend son résultat dans TaskForce (commentaire), jamais de pull request. `false` = ce runner
   * ne prend que des tâches de code (dépôt requis).
   */
  acceptRepoless: boolean;
  agent: AgentConfig;
  /** Entrée du serveur MCP TaskForce (dist/index.js de taskforce-mcp). */
  mcpEntry: string;
}

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Lit un fichier `.env` minimal (CLE=valeur, `#` en commentaire). L'environnement du processus prime. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function asPositiveInt(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Configuration : ${label} doit être un entier positif`);
  }
  return value;
}

/** Liste de commandes, chacune en tableau d'arguments non vide. */
function asCommandList(value: unknown, label: string): string[][] {
  if (value === undefined || value === null) return [];
  const valid = Array.isArray(value) && value.every(
    (cmd) => Array.isArray(cmd) && cmd.length > 0 && cmd.every((part) => typeof part === "string" && part.length > 0),
  );
  if (!valid) {
    throw new Error(`Configuration : ${label} doit être une liste de commandes en tableaux d'arguments, ex. [["npm", "ci"]]`);
  }
  return value as string[][];
}

function asStringArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`Configuration : ${label} doit être une liste de chaînes`);
  }
  return value as string[];
}

/** Valide le contenu de `runner.config.json` (objet déjà parsé). Exporté pour les tests. */
export function parseRunnerConfigFile(json: unknown): Omit<RunnerConfig, "apiUrl" | "clientId" | "clientSecret" | "home" | "mcpEntry"> {
  if (typeof json !== "object" || json === null) throw new Error("Configuration : objet JSON attendu");
  const cfg = json as Record<string, unknown>;

  const repos: Record<string, RepoConfig> = {};
  const rawRepos = (cfg.repos ?? {}) as Record<string, unknown>;
  if (typeof rawRepos !== "object" || rawRepos === null) throw new Error("Configuration : repos doit être un objet");
  for (const [fullName, value] of Object.entries(rawRepos)) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
      throw new Error(`Configuration : « ${fullName} » n'est pas un dépôt « owner/name »`);
    }
    const repo = (typeof value === "string" ? { path: value } : value) as Record<string, unknown> | null;
    if (!repo || typeof repo.path !== "string" || !repo.path.trim()) {
      throw new Error(`Configuration : repos["${fullName}"].path est obligatoire`);
    }
    if (!isAbsolute(repo.path)) {
      throw new Error(`Configuration : repos["${fullName}"].path doit être un chemin absolu`);
    }
    const baseBranch = repo.baseBranch === undefined ? "main" : repo.baseBranch;
    if (typeof baseBranch !== "string" || !/^[\w./-]+$/.test(baseBranch)) {
      throw new Error(`Configuration : repos["${fullName}"].baseBranch invalide`);
    }
    repos[fullName.toLowerCase()] = {
      path: repo.path,
      baseBranch,
      setup: asCommandList(repo.setup, `repos["${fullName}"].setup`),
    };
  }

  const rawAgent = (cfg.agent ?? {}) as Record<string, unknown>;
  const model = rawAgent.model === undefined || rawAgent.model === null ? null : rawAgent.model;
  if (model !== null && typeof model !== "string") throw new Error("Configuration : agent.model doit être une chaîne ou null");
  const auth = rawAgent.auth === undefined ? "subscription" : rawAgent.auth;
  if (auth !== "subscription" && auth !== "api-key") {
    throw new Error('Configuration : agent.auth doit valoir "subscription" ou "api-key"');
  }

  return {
    repos,
    autoClone: cfg.autoClone === undefined ? true : cfg.autoClone === true,
    pollSeconds: asPositiveInt(cfg.pollSeconds, 5, "pollSeconds"),
    push: cfg.push === undefined ? true : cfg.push === true,
    openPullRequest: cfg.openPullRequest === undefined ? true : cfg.openPullRequest === true,
    keepWorktree: cfg.keepWorktree === true,
    acceptRepoless: cfg.acceptRepoless === undefined ? true : cfg.acceptRepoless === true,
    agent: {
      command: typeof rawAgent.command === "string" && rawAgent.command.trim() ? rawAgent.command.trim() : "claude",
      auth,
      model,
      maxTurns: asPositiveInt(rawAgent.maxTurns, 60, "agent.maxTurns"),
      timeoutMinutes: asPositiveInt(rawAgent.timeoutMinutes, 45, "agent.timeoutMinutes"),
      attribution: rawAgent.attribution === true,
      extraAllowedTools: asStringArray(rawAgent.extraAllowedTools, "agent.extraAllowedTools"),
    },
  };
}

/** Charge `.env` + `runner.config.json` du paquet. `requireRepos=false` pour `--check`. */
export function loadConfig(): RunnerConfig {
  const envPath = join(PACKAGE_ROOT, ".env");
  const fileEnv = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, "utf8")) : {};
  const env = (key: string): string | undefined => process.env[key] ?? fileEnv[key];

  const apiUrl = (env("TASKFORCE_API_URL") ?? "http://localhost:8080/api").replace(/\/+$/, "");
  const clientId = env("TASKFORCE_RUNNER_CLIENT_ID") ?? "";
  const clientSecret = env("TASKFORCE_RUNNER_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Identifiants du runner absents. Lancer : .\\scripts\\keycloak-runner.ps1 -Owner <e-mail> -Name <nom> " +
        "(écrit taskforce-runner/.env).",
    );
  }

  const configPath = join(PACKAGE_ROOT, "runner.config.json");
  const fileConfig = existsSync(configPath)
    ? parseRunnerConfigFile(JSON.parse(readFileSync(configPath, "utf8")))
    : parseRunnerConfigFile({});

  const mcpEntry = env("TASKFORCE_MCP_ENTRY") ?? resolve(PACKAGE_ROOT, "..", "taskforce-mcp", "dist", "index.js");

  return {
    ...fileConfig,
    apiUrl,
    clientId,
    clientSecret,
    home: env("TASKFORCE_RUNNER_HOME") ?? join(homedir(), ".taskforce-runner"),
    mcpEntry,
  };
}
