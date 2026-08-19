import axios, { type AxiosInstance } from "axios";

/** Options de construction — permettent d'injecter un token/workspace par session (transport HTTP). */
export interface TaskforceClientOptions {
  /** Bearer TaskForce à utiliser tel quel (pass-through). Prioritaire sur `TASKFORCE_TOKEN` (env). */
  token?: string;
  /** Workspace par défaut pour cette instance (sinon `TASKFORCE_WORKSPACE`). */
  workspace?: string;
}

/**
 * Client HTTP vers l'API TaskForce (`/api/...`, enveloppe `ApiResponse<T>` → on renvoie `.data`).
 *
 * Auth : soit un token statique (arg `token` ou `TASKFORCE_TOKEN`), soit un **password grant
 * Keycloak** (dev). En dev, l'issuer du token est `keycloak:8080` alors que Keycloak est exposé sur
 * `localhost:8180` — on force donc l'en-tête `Host` sur l'appel token pour que l'`iss` du JWT matche
 * ce que le backend valide.
 *
 * En transport **HTTP** (remote/SaaS), on construit une instance **par session** avec le bearer
 * présenté par le client (`new TaskforceClient({ token })`) : chaque appel agit avec l'identité du
 * caller (compte de service en prod, ou token utilisateur).
 */
export class TaskforceClient {
  private readonly http: AxiosInstance;
  private readonly apiUrl: string;
  private readonly defaultWorkspace: string;
  private readonly staticToken?: string;
  private readonly kc: {
    url: string; hostHeader: string; realm: string;
    clientId: string; clientSecret: string; username: string; password: string;
  };
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(opts: TaskforceClientOptions = {}) {
    this.apiUrl = process.env.TASKFORCE_API_URL ?? "http://localhost:8080/api";
    this.defaultWorkspace = opts.workspace?.trim() || process.env.TASKFORCE_WORKSPACE || "taskforce-demo";
    this.staticToken = opts.token || process.env.TASKFORCE_TOKEN || undefined;
    this.kc = {
      url: process.env.KEYCLOAK_URL ?? "http://localhost:8180",
      hostHeader: process.env.KEYCLOAK_HOST_HEADER ?? "keycloak:8080",
      realm: process.env.KEYCLOAK_REALM ?? "taskforce-dev",
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? "taskforce-api",
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
      username: process.env.TASKFORCE_USERNAME ?? "admin@taskforce.dev",
      password: process.env.TASKFORCE_PASSWORD ?? "",
    };
    this.http = axios.create({
      baseURL: this.apiUrl,
      timeout: Number(process.env.TASKFORCE_TIMEOUT_MS ?? 200000),
    });
  }

  /** Slug de workspace effectif (param explicite sinon défaut d'env). */
  workspace(slug?: string): string {
    return slug && slug.trim() ? slug.trim() : this.defaultWorkspace;
  }

  private async token(): Promise<string> {
    if (this.staticToken) return this.staticToken;
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 15_000) {
      return this.tokenCache.token;
    }
    if (!this.kc.clientSecret) {
      throw new Error("Auth TaskForce non configurée : définir TASKFORCE_TOKEN, ou KEYCLOAK_CLIENT_SECRET + TASKFORCE_PASSWORD.");
    }
    const form = new URLSearchParams({
      grant_type: "password",
      client_id: this.kc.clientId,
      client_secret: this.kc.clientSecret,
      username: this.kc.username,
      password: this.kc.password,
    });
    const res = await axios.post(
      `${this.kc.url}/realms/${this.kc.realm}/protocol/openid-connect/token`,
      form.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded", Host: this.kc.hostHeader } },
    );
    const token = res.data?.access_token as string | undefined;
    if (!token) throw new Error("Réponse Keycloak sans access_token");
    const expiresIn = Number(res.data?.expires_in ?? 300);
    this.tokenCache = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  }

  /** Appel API authentifié. Déballe l'enveloppe `ApiResponse` (`{ data }`) si présente. */
  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.token();
    const res = await this.http.request({
      method, url: path, data, params,
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = res.data;
    if (body && typeof body === "object" && "data" in body) {
      return (body as { data: T }).data;
    }
    return body as T;
  }
}
