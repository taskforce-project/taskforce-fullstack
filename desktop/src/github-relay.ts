import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { log } from "./log";
import { freePort, randomToken } from "./net";
import { runTool } from "./tools";

/**
 * Jeton GitHub de la personne pour le backend local. Le GitHub CLI (`gh`) le garde dans le trousseau du système ; la coque
 * le lit à la demande (`gh auth token`) et ne le rend qu'au backend, sur 127.0.0.1, avec un jeton de service tiré à chaque
 * lancement (`GET /token`). Le backend s'en sert pour Copilot et pour relire les pull requests liées aux tickets ; il
 * remplace la connexion GitHub de l'espace, qui n'existe que sur le serveur.
 */

/** Lecture du jeton : `null` quand `gh` manque ou que personne n'y est connecté. */
export async function readGitHubToken(): Promise<string | null> {
  const result = await runTool("gh", ["auth", "token", "--hostname", "github.com"], 10_000).catch(() => null);
  const token = result && result.code === 0 ? result.stdout.trim() : "";
  return /^[A-Za-z0-9_]{20,255}$/.test(token) ? token : null;
}

/** Durée pendant laquelle un jeton lu est gardé : une déconnexion de `gh` vaut au plus une minute après. */
const TOKEN_TTL_MS = 60_000;

export class GitHubRelay {
  port = 0;
  readonly token = randomToken("tfgh_");
  private server: Server | null = null;
  private cached: { value: string; at: number } | null = null;

  constructor(private readonly read: () => Promise<string | null> = readGitHubToken) {}

  url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    this.port = await freePort();
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((error: Error) => {
        log.warn(`GitHub relay: ${error.message}`);
        if (!res.headersSent) send(res, 500, { detail: "GitHub relay error" });
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, "127.0.0.1", () => resolve());
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  /** Oublie le jeton gardé (connexion à GitHub depuis l'app) : la prochaine demande relit `gh`. */
  invalidate(): void {
    this.cached = null;
  }

  /** Jeton courant ; seul un jeton trouvé est gardé, pour qu'une connexion faite entre-temps compte tout de suite. */
  async current(): Promise<string | null> {
    if (this.cached && Date.now() - this.cached.at < TOKEN_TTL_MS) return this.cached.value;
    const value = await this.read();
    this.cached = value ? { value, at: Date.now() } : null;
    return value;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authorized(req.headers.authorization)) {
      send(res, 401, { detail: "Invalid service token" });
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/token") {
      const value = await this.current();
      if (value) send(res, 200, { token: value });
      else send(res, 404, { detail: "Not signed in to GitHub" });
      return;
    }
    send(res, 404, { detail: "Not found" });
  }

  private authorized(header: string | undefined): boolean {
    const [scheme, value] = (header ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !value) return false;
    const given = Buffer.from(value);
    const expected = Buffer.from(this.token);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
