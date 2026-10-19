import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { createServer } from "node:net";

/** Port libre sur 127.0.0.1, tiré par le système. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("No free port"))));
    });
  });
}

/** Jeton aléatoire préfixé, encodé en base64url (32 octets par défaut). */
export function randomToken(prefix: string, bytes = 32): string {
  return prefix + randomBytes(bytes).toString("base64url");
}

/** Statut HTTP d'un GET sur 127.0.0.1, ou 0 si personne ne répond. */
export function httpStatus(port: number, path: string, timeoutMs = 2000): Promise<number> {
  return new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(0));
    req.end();
  });
}

/**
 * Attend qu'une adresse locale réponde 200, en abandonnant au bout de `timeoutMs` ou dès que `stillRunning` dit que
 * le processus attendu s'est arrêté (inutile d'attendre un serveur mort).
 */
export async function waitForOk(
  port: number,
  path: string,
  timeoutMs: number,
  stillRunning: () => boolean = () => true,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!stillRunning()) throw new Error(`The process behind 127.0.0.1:${port} stopped while starting`);
    if ((await httpStatus(port, path)) === 200) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`127.0.0.1:${port}${path} did not answer within ${Math.round(timeoutMs / 1000)} s`);
}
