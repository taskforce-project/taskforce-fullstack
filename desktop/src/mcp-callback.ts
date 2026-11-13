import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * Le retour du navigateur après la connexion à un outil (séance n°22 du Conseil, R154 ; RFC 8252), comme la connexion au
 * compte (cf. account.ts) : la personne clique « Connect » dans l'app, le navigateur du système s'ouvre sur la page de
 * l'éditeur, elle s'y connecte, et l'éditeur renvoie le navigateur ici, sur 127.0.0.1, avec un code à usage unique.
 * La coque remet ce code au backend local, qui le garde avec son `state`, puis ramène la fenêtre de l'app sur la page du
 * retour : l'app, connectée, finit l'échange (seule la personne qui a lancé la connexion le peut), comme sur le web. Le
 * backend local échange lui-même le code, avec son vérificateur PKCE : les jetons ne quittent jamais la machine, et ne
 * passent par aucun serveur de TaskForce.
 *
 * Le port est fixe, le premier libre de la liste, pour qu'une adresse de retour enregistrée chez un éditeur qui exige
 * la correspondance exacte (Asana, GitLab, l'application d'une entreprise) reste la même d'un lancement à l'autre ; le
 * backend local, lui, change de port à chaque lancement. Les quatre adresses sont listées dans le document de
 * métadonnées client de l'app desktop, publié par le serveur hébergé.
 */

/** Ports de retour, essayés dans l'ordre (ceux de la connexion au compte sont 47812 à 47815). */
export const MCP_CALLBACK_PORTS = [47816, 47817, 47818, 47819];
export const MCP_CALLBACK_PATH = "/mcp/callback";
/** Le retour du serveur, dans le backend local. */
const BACKEND_CALLBACK = "/api/mcp/oauth/callback";

/** `finish` : le code est gardé, l'app finit la connexion sur la page du retour. */
export type CallbackOutcome = "connected" | "admin" | "error" | "finish";

/** Ce que dit le retour du backend local, lu dans son adresse de redirection (`mcp=finish|connected|admin|error`). */
export function outcomeOf(location: string | undefined): CallbackOutcome {
  if (!location) return "error";
  try {
    const value = new URL(location, "http://127.0.0.1").searchParams.get("mcp");
    return value === "connected" || value === "admin" || value === "finish" ? value : "error";
  } catch {
    return "error";
  }
}

/** La page de l'app où finir la connexion : le chemin et la requête du retour, jamais une autre origine ; nulle sinon. */
export function appPathOf(location: string | undefined): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, "http://127.0.0.1");
    const path = url.pathname + url.search;
    return path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}

const TEXTS: Record<CallbackOutcome, { title: string; text: string }> = {
  connected: { title: "You're connected", text: "You can close this tab and go back to TaskForce." },
  finish: { title: "Back to TaskForce", text: "TaskForce finishes the connection. You can close this tab." },
  admin: {
    title: "Your admin needs to approve TaskForce",
    text: "Go back to TaskForce: it tells you what to send to your admin.",
  },
  error: { title: "The connection didn't finish", text: "Go back to TaskForce and try again." },
};

/** La page que le navigateur montre à la fin, claire et sombre comme celle de la connexion au compte. */
export function page(outcome: CallbackOutcome): string {
  const { title, text } = TEXTS[outcome];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#1c1b19;background:#fbfbfc;display:grid;
place-items:center;height:100vh;margin:0}main{max-width:420px;text-align:center}h1{font-size:20px;margin:0 0 8px}
p{color:#5c5a55;margin:0}@media (prefers-color-scheme:dark){body{color:#ecebe8;background:#0e1116}p{color:#9a978f}}</style>
</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;
}

/** Écoute sur le premier port libre de la liste ; échoue si tous sont pris. */
function listen(server: Server, ports: number[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (index: number) => {
      const port = ports[index];
      if (port === undefined) {
        reject(new Error("The connection ports are all in use: close other TaskForce windows and try again"));
        return;
      }
      const onError = () => {
        server.removeListener("listening", onListening);
        tryPort(index + 1);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    };
    tryPort(0);
  });
}

/** Ce que le backend local a répondu : comment la connexion continue, et la page de l'app où la finir. */
interface Forwarded {
  outcome: CallbackOutcome;
  path: string | null;
}

/** Le code remis au backend local ; son adresse de redirection dit comment la connexion continue. */
function forward(backendPort: number, search: string): Promise<Forwarded> {
  return new Promise((resolve) => {
    const upstream = request(
      {
        host: "127.0.0.1",
        port: backendPort,
        method: "GET",
        path: BACKEND_CALLBACK + search,
        headers: { host: `127.0.0.1:${backendPort}` },
        timeout: 60_000,
      },
      (response: IncomingMessage) => {
        response.resume();
        const redirected = response.statusCode === 302 || response.statusCode === 303;
        const location = redirected ? response.headers.location : undefined;
        resolve({ outcome: redirected ? outcomeOf(location) : "error", path: appPathOf(location) });
      },
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => resolve({ outcome: "error", path: null }));
    upstream.end();
  });
}

/**
 * Le retour des connexions aux outils, ouvert le temps que l'app tourne. `onDone` ramène la fenêtre de l'app au
 * premier plan ; avec `finish`, sur la page du retour (`path`), où l'app, connectée, finit la connexion.
 */
export class McpCallback {
  port = 0;
  private server: Server | null = null;
  private backendPort = 0;

  constructor(
    private readonly onDone: (outcome: CallbackOutcome, path: string | null) => void = () => undefined,
    private readonly ports: number[] = MCP_CALLBACK_PORTS,
  ) {}

  /** Ouvre le retour et rend son adresse, que le backend inscrit chez l'éditeur. */
  async start(): Promise<string> {
    const server = createServer((req, res) => void this.handle(req, res));
    this.port = await listen(server, this.ports);
    this.server = server;
    return this.redirectUri();
  }

  redirectUri(): string {
    return `http://127.0.0.1:${this.port}${MCP_CALLBACK_PATH}`;
  }

  /** Relie le retour au backend local, une fois prêt. */
  connect(backendPort: number): void {
    this.backendPort = backendPort;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== MCP_CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    const { outcome, path } = this.backendPort
      ? await forward(this.backendPort, url.search)
      : { outcome: "error" as const, path: null };
    // Pas de connexion gardée ouverte : le navigateur la réutiliserait pour la connexion suivante.
    res.writeHead(outcome === "error" && !this.backendPort ? 503 : 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "close",
    });
    res.end(page(outcome));
    this.onDone(outcome, outcome === "finish" ? path : null);
  }
}
