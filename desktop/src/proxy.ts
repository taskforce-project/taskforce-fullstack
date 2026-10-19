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
 */
export class Proxy {
  port = 0;
  private server: Server | null = null;

  /** Réserve le port du relais : le backend doit connaître l'origine de la fenêtre avant de démarrer. */
  async reserve(): Promise<string> {
    this.port = await freePort();
    return this.origin();
  }

  async start(backendPort: number, frontendPort: number): Promise<void> {
    if (!this.port) await this.reserve();
    const target = (url: string | undefined) => (routeTo(url) === "backend" ? backendPort : frontendPort);

    const server = createServer((req, res) => {
      const port = target(req.url);
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

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.port, "127.0.0.1", () => resolve());
    });
    this.server = server;
  }

  origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }
}
