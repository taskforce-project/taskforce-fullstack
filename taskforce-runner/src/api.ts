import type { RunnerConfig } from "./config.js";

/** Tâche remise par `POST /delivery/runner/claim` (miroir de `RunnerClaimResponse` côté backend). */
export interface Claim {
  runId: number;
  issueId: number;
  issueKey: string;
  title: string;
  description: string | null;
  projectId: number;
  projectName: string;
  workspaceSlug: string;
  repoFullName: string | null;
  model: string | null;
  sessionExpiresAt: string;
  /** Paquet de règles de la mission (contracts/), vérifié par son empreinte avant de lancer l'agent. */
  rules?: unknown;
  /** Commande de test du projet, lancée par le runner après l'agent (S1, R32) ; absente : aucun test lancé. */
  testCommand?: string | null;
  /** Une reprise : la personne a commenté des lignes, l'agent repart sur la même branche (R139). */
  followUp?: FollowUp | null;
}

/** Un commentaire de la personne sur une ligne du diff. */
export interface FollowUpComment {
  path: string;
  line: number;
  /** `new` : la ligne de la version de l'agent ; `old` : une ligne qu'il a retirée. */
  side: "new" | "old";
  text: string;
}

/** Ce qu'une reprise emporte de la mission d'avant : sa branche, sa base, sa session, et les commentaires. */
export interface FollowUp {
  parentRunId: number;
  /** Le run qui a créé le dossier de travail : Claude Code range ses sessions par dossier. */
  worktreeRun: number;
  branch: string;
  base: string;
  /** La session de Claude Code à reprendre ; absente, l'agent repart du brief. */
  sessionId?: string | null;
  /** La pull request déjà ouverte : la reprise la met à jour au lieu d'en ouvrir une autre. */
  pullRequestUrl?: string | null;
  comments: FollowUpComment[];
}

/** Un fichier de la mission (miroir de `RunnerChangesRequest.File` côté backend). */
export interface RunnerFileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "written";
  /** null pour un binaire. */
  added: number | null;
  removed: number | null;
  binary: boolean;
  /** Le texte est coupé, ou n'a pas pu partir : le compte reste vrai, l'écran le dit. */
  truncated: boolean;
  /** Un fichier qui peut porter un secret : son texte ne quitte jamais le poste. */
  withheld: boolean;
  /** L'empreinte de ce qui a changé : même empreinte, TaskForce garde le texte déjà reçu. */
  revision: string;
  /** Le patch (dépôt) ou le contenu (dossier jetable) ; absent quand il n'a pas changé. */
  body?: string | null;
}

/** Ce que la mission a changé, relevé par le runner (miroir de `RunnerChangesRequest` côté backend). */
export interface RunnerChanges {
  mode: "repo" | "scratch";
  base?: string;
  files: RunnerFileChange[];
  /** Les fichiers au-delà du plafond, comptés dans les totaux. */
  more: number;
  added: number;
  removed: number;
  /** L'état final de la mission : il entre au dossier de preuve. */
  final: boolean;
}

/** Un ordre de TaskForce pour ce poste (R139, R140). */
export interface RunnerCommand {
  commandId: number;
  runId: number;
  kind: "REVERT_FILE" | "CORRECTION";
  /** `REVERT_FILE` : le fichier à remettre comme avant, et de quoi retrouver la branche. */
  path?: string | null;
  branch?: string | null;
  base?: string | null;
  worktreeRun?: number | null;
  repoFullName?: string | null;
  rules?: unknown;
  /** `CORRECTION` : ce que la personne a tapé. */
  text?: string | null;
}

/** Ce que les règles ont dit d'un geste du runner, pour le dossier de preuve. */
export interface CommandTrace {
  action: string;
  effect: "allow" | "ask" | "deny";
  rule?: string;
}

export interface CommandResult {
  ok: boolean;
  /** Ce qui s'est passé, en mots ; montré à la personne quand le geste échoue. */
  message: string;
  /** La branche n'existe plus sur ce poste ni sur GitHub : l'action disparaît, et l'écran dit pourquoi. */
  gone?: boolean;
  commit?: string;
  commits?: number;
  pushed?: boolean;
  trace?: CommandTrace[];
  changes?: RunnerChanges;
  /** Le détail technique d'un échec : pour le dossier de preuve, jamais pour l'écran (R133). */
  detail?: string;
}

export interface RunResult {
  status: "DONE" | "FAILED";
  summary?: string;
  resultUrl?: string;
  error?: string;
  /** Une règle a refusé la mission au départ : ce n'est pas une panne (R38). */
  refused?: boolean;
  /** La branche de l'agent et ses commits, pour la carte de résultat (R78). */
  branch?: string;
  commits?: number;
  /** La session de Claude Code, pour qu'une reprise la continue (R139). */
  agentSession?: string;
  /** Les tests du projet tels que le runner les a lancés (R32) : jamais ce que l'agent en dit. */
  tests?: {
    command: string;
    ran: boolean;
    passed: boolean;
    passedCount?: number;
    total?: number;
  };
}

/** Événement de la chronologie d'un run (miroir de `RunnerEventsRequest` côté backend). */
export interface RunnerEvent {
  kind: string;
  tool?: string;
  text: string;
  /** `decision` : l'effet de la règle ; `exit` : `allow` si la sortie est faite, `deny` sinon. */
  effect?: "allow" | "ask" | "deny";
  /** `decision` : la règle qui l'a donnée, absente quand aucune ne s'applique. */
  rule?: string;
}

/** Qui pose une demande : l'agent, ou le runner lui-même (sortie, tests du projet, départ d'une mission). */
export type AskedBy = "agent" | "runner";

/** Demande de validation d'une action de l'agent, décidée dans TaskForce par la personne qui a délégué. */
export interface Approval {
  approvalId: number;
  status: "PENDING" | "ALLOWED" | "DENIED" | "EXPIRED";
  expiresAt: string;
  /** Portée d'un accord : `ONCE`, ou `MISSION` pour le reste de la mission (R46) ; absente tant qu'on n'a pas répondu. */
  scope?: "ONCE" | "MISSION" | null;
}

/** Ce que les règles ont jugé d'une action demandée, pour que TaskForce la dise en mots (R78, séance n°13). */
export interface Ruling {
  /** L'action jugée : `web.search`, `shell`, `git.push`... */
  action?: string;
  /** La règle qui demande, et sa raison telle qu'elle s'écrit pour la personne. */
  rule?: string;
  reason?: string;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Marge avant expiration en dessous de laquelle on redemande un jeton. */
const TOKEN_MARGIN_MS = 60_000;

/**
 * Client des endpoints machine de TaskForce. Le jeton vient du backend (`/auth/runner/token`), qui relaie
 * l'échange `client_credentials` vers Keycloak : le runner ne parle jamais à Keycloak directement, et ne
 * connaît qu'une URL.
 */
export class TaskforceApi {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: Pick<RunnerConfig, "apiUrl" | "clientId" | "clientSecret">) {}

  /** Jeton machine valide ; `fresh` force un jeton neuf (durée de vie entière, pour la session de l'agent). */
  async token(fresh = false): Promise<{ token: string; expiresAt: number }> {
    if (!fresh && this.cached && this.cached.expiresAt - Date.now() > TOKEN_MARGIN_MS) return this.cached;
    const body = await this.send<{ accessToken: string; expiresIn: number }>("POST", "/auth/runner/token", {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    }, false);
    if (!body?.accessToken) throw new Error("The token response has no token");
    this.cached = { token: body.accessToken, expiresAt: Date.now() + body.expiresIn * 1000 };
    return this.cached;
  }

  /**
   * Réclame une tâche, en disant si l'agent peut partir sur ce poste. Avec un problème connu, TaskForce ne remet rien et
   * ne propose plus l'agent, avec la cause (R37) ; un serveur plus ancien ignore ce corps.
   */
  claim(agentProblem: string | null = null): Promise<Claim | null> {
    return this.send<Claim | null>("POST", "/delivery/runner/claim",
      { agentReady: agentProblem === null, agentProblem: agentProblem ?? undefined });
  }

  async heartbeat(runId: number): Promise<void> {
    await this.send("POST", `/delivery/runner/runs/${runId}/heartbeat`);
  }

  async result(runId: number, result: RunResult): Promise<void> {
    await this.send("POST", `/delivery/runner/runs/${runId}/result`, result);
  }

  /** Ajoute des événements à la chronologie du run (suivi en direct dans l'app). */
  async events(runId: number, events: RunnerEvent[]): Promise<void> {
    await this.send("POST", `/delivery/runner/runs/${runId}/events`, { events });
  }

  /**
   * Ouvre une demande de validation : la personne qui a délégué autorise ou refuse dans l'app. `askedBy` dit qui
   * demande, l'agent ou le runner lui-même (décision J4).
   */
  requestApproval(runId: number, tool: string, summary: string, askedBy: AskedBy = "agent", ruling: Ruling = {}): Promise<Approval> {
    return this.send<Approval>("POST", `/delivery/runner/runs/${runId}/approvals`, { tool, summary, askedBy, ...ruling });
  }

  approvalStatus(runId: number, approvalId: number): Promise<Approval> {
    return this.send<Approval>("GET", `/delivery/runner/runs/${runId}/approvals/${approvalId}`);
  }

  /** Ce que la mission a changé jusqu'ici (R139). */
  async changes(runId: number, changes: RunnerChanges): Promise<void> {
    await this.send("POST", `/delivery/runner/runs/${runId}/changes`, changes);
  }

  /** Les ordres en attente pour ce poste (remettre un fichier, une correction). */
  async commands(): Promise<RunnerCommand[]> {
    return (await this.send<RunnerCommand[] | null>("POST", "/delivery/runner/commands")) ?? [];
  }

  async commandResult(commandId: number, result: CommandResult): Promise<void> {
    await this.send("POST", `/delivery/runner/commands/${commandId}/result`, result);
  }

  private async send<T>(method: "GET" | "POST", path: string, body?: unknown, authenticated = true): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated) headers.Authorization = `Bearer ${(await this.token()).token}`;

    const res = await fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let json: { data?: T; message?: string } | null = null;
    try {
      json = text ? (JSON.parse(text) as { data?: T; message?: string }) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      if (res.status === 401) this.cached = null; // jeton expiré ou révoqué : le prochain appel en redemande un
      throw new ApiError(res.status, json?.message ?? `HTTP ${res.status}`);
    }
    return (json?.data ?? null) as T;
  }
}
