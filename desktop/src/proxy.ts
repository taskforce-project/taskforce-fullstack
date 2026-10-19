import { createServer, request, type IncomingMessage, type Server } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";

import { freePort } from "./net";

/**
 * Chemins servis par le backend : l'API, le temps réel et les sondes. Comparés segment par segment : un workspace
 * nommé « wsteam » (`/wsteam/dashboard`) reste à l'interface. Tout le reste est l'interface.
 */
const BACKEND_ROOTS = ["/api", "/ws", "/ws-sockjs", "/readyz", "/livez"];

export function routeTo(url: string | undefined): "backend" | "frontend" {
  const path = (url ?? "/").split("?")[0] ?? "/";
  return BACKEND_ROOTS.some((root) => path === root || path.startsWith(root + "/")) ? "backend" : "frontend";
}

/** En-têtes relayés vers un service local, avec l'hôte du service (le backend refuse un autre hôte). */
function forwardHeaders(req: IncomingMessage, port: number): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers[name] = value;
  }
  headers.host = `127.0.0.1:${port}`;
  return headers;
}

/**
 * Relais de la fenêtre : une seule origine (`http://127.0.0.1:<port>`) pour l'interface et l'API. L'interface appelle
 * `/api/...` en relatif ; aucune adresse de backend n'est figée à la construction, et il n'y a pas de CORS entre
 * deux ports à gérer.
 *
 * Le port reste le même d'un lancement à l'autre quand il est libre : l'origine de la fenêtre ne change pas, et ce que
 * l'interface garde dans le navigateur (préférences, visite guidée déjà vue) survit au redémarrage.
 */
export class Proxy {
  port = 0;
  private server: Server | null = null;
  private targets: { backend: number; frontend: number } | null = null;

  /**
   * Ouvre le relais, sur `preferred` s'il est libre, sinon sur un port libre : le backend doit connaître l'origine de la
   * fenêtre avant de démarrer. Jusqu'à `start`, il répond que l'app démarre.
   */
  async reserve(preferred?: number): Promise<string> {
    const server = this.createServer();
    try {
      if (!preferred) throw new Error("no preferred port");
      await listen(server, preferred);
    } catch {
      await listen(server, await freePort());
    }
    const address = server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
    this.server = server;
    return this.origin();
  }

  /** Relie le relais aux services, une fois prêts. */
  async start(backendPort: number, frontendPort: number): Promise<void> {
    if (!this.server) await this.reserve();
    this.targets = { backend: backendPort, frontend: frontendPort };
  }

  private createServer(): Server {
    const target = (url: string | undefined) => {
      if (!this.targets) return 0;
      return routeTo(url) === "backend" ? this.targets.backend : this.targets.frontend;
    };

    const server = createServer((req, res) => {
      const port = target(req.url);
      if (!port) {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("TaskForce is starting.");
        return;
      }
      const upstream = request(
        { host: "127.0.0.1", port, method: req.method, path: req.url, headers: forwardHeaders(req, port) },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.statusMessage, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
        res.end("TaskForce is starting or stopping.");
      });
      req.pipe(upstream);
    });

    // WebSocket (temps réel) : la requête d'ouverture est réécrite vers le service, puis les deux flux sont reliés.
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const port = target(req.url);
      if (!port) {
        socket.destroy();
        return;
      }
      const upstream = connect(port, "127.0.0.1", () => {
        const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
        for (const [name, value] of Object.entries(forwardHeaders(req, port))) {
          for (const item of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${item}`);
        }
        upstream.write(lines.join("\r\n") + "\r\n\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
      const close = () => {
        socket.destroy();
        upstream.destroy();
      };
      upstream.on("error", close);
      socket.on("error", close);
    });

    return server;
  }

  origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
    this.targets = null;
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}
