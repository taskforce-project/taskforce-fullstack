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
}

export interface RunResult {
  status: "DONE" | "FAILED";
  summary?: string;
  resultUrl?: string;
  error?: string;
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
    if (!body?.accessToken) throw new Error("Réponse sans jeton");
    this.cached = { token: body.accessToken, expiresAt: Date.now() + body.expiresIn * 1000 };
    return this.cached;
  }

  claim(): Promise<Claim | null> {
    return this.send<Claim | null>("POST", "/delivery/runner/claim");
  }

  async heartbeat(runId: number): Promise<void> {
    await this.send("POST", `/delivery/runner/runs/${runId}/heartbeat`);
  }

  async result(runId: number, result: RunResult): Promise<void> {
    await this.send("POST", `/delivery/runner/runs/${runId}/result`, result);
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
