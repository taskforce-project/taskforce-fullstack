import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { hostname } from "node:os";

import type { Account } from "./settings";

/**
 * Connexion au compte TaskForce par la webapp, comme Claude Desktop : l'app ouvre la page `/auth/desktop` de la webapp
 * dans le navigateur ; la personne s'y connecte comme d'habitude (mot de passe et double authentification, GitHub,
 * Google, passkey) ou crée son compte, puis accepte ; la webapp renvoie le navigateur vers l'app, sur 127.0.0.1, avec
 * un code à usage unique que l'app échange, avec son vérificateur PKCE, contre une session (RFC 8252, sans écran
 * Keycloak). Le mot de passe ne passe jamais par l'app ; elle ne garde que le jeton de session, chiffré par le système.
 */

const trim = (url: string) => url.replace(/\/+$/, "");

/** La webapp et son API ; `TF_DESKTOP_WEB_URL` et `TF_DESKTOP_API_URL` les remplacent en développement. */
export const WEB_URL = trim(process.env.TF_DESKTOP_WEB_URL ?? "https://app.taskforce-project.fr");
export const API_URL = trim(process.env.TF_DESKTOP_API_URL ?? "https://api.taskforce-project.fr");

/** Service de comptes d'où vient une session : un compte connecté ailleurs (développement, ancienne adresse) se reconnecte. */
export const ACCOUNT_SERVER = API_URL;

/** Ports de retour admis par l'API (`DesktopSessionService.CALLBACK_PORTS`), essayés dans l'ordre. */
export const CALLBACK_PORTS = [47812, 47813, 47814, 47815];

export interface SignInResult {
  account: Account;
  sessionToken: string;
}

/** La session n'est plus valable (fermée depuis les réglages de la webapp, expirée, compte désactivé). */
export class SessionEndedError extends Error {}

const base64url = (buffer: Buffer): string => buffer.toString("base64url");

/** Vérificateur et défi PKCE (S256). */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Nom de l'ordinateur dans les réglages de la webapp (« Ordinateur de Pierre, Windows »). */
export function deviceName(host = hostname(), platform: NodeJS.Platform = process.platform): string {
  const system = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";
  const name = host.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 60);
  return name ? `${name} (${system})` : system;
}

/** Compte rendu par l'API, vérifié sur ce que l'app attend, et rattaché au service de comptes qui l'a rendu. */
export function readAccount(value: unknown, server: string = ACCOUNT_SERVER): Account {
  const account = (value ?? {}) as Record<string, unknown>;
  const text = (name: string): string => (typeof account[name] === "string" ? (account[name] as string) : "");
  if (!text("subject") || !text("email")) throw new Error("The account has no address: sign in again");
  const profile = account.profile;
  return {
    issuer: server,
    subject: text("subject"),
    email: text("email"),
    givenName: text("givenName"),
    familyName: text("familyName"),
    avatarUrl: text("avatarUrl") || null,
    ...(profile !== null && typeof profile === "object" && !Array.isArray(profile)
      ? { profile: profile as Record<string, unknown> }
      : {}),
  };
}

/** Appel à l'API du compte ; l'enveloppe `ApiResponse` est ouverte ici. */
async function api<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; message?: string };
  if (response.status === 401) throw new SessionEndedError(payload.message || "The session ended: sign in again");
  if (!response.ok) throw new Error(payload.message || `The TaskForce account service answered ${response.status}`);
  return payload.data as T;
}

const PAGE = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#1c1b19;background:#fbfbfc;display:grid;
place-items:center;height:100vh;margin:0}main{max-width:420px;text-align:center}h1{font-size:20px;margin:0 0 8px}
p{color:#5c5a55;margin:0}@media (prefers-color-scheme:dark){body{color:#ecebe8;background:#0e1116}p{color:#9a978f}}</style>
</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

/** Écoute le retour du navigateur sur le premier port libre de la liste. */
function listen(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const tryPort = (index: number) => {
      const port = CALLBACK_PORTS[index];
      if (port === undefined) return reject(new Error("The sign-in ports are all in use: close other TaskForce windows and try again"));
      const server = createServer();
      server.once("error", () => tryPort(index + 1));
      server.listen(port, "127.0.0.1", () => resolve({ server, port }));
    };
    tryPort(0);
  });
}

/**
 * Connexion (ou création du compte, `signUp`) dans le navigateur de la personne. `openBrowser` ouvre l'adresse ; la
 * promesse se résout au retour du navigateur, ou échoue au bout de 10 minutes.
 */
export async function signIn(openBrowser: (url: string) => Promise<void>, signUp = false): Promise<SignInResult> {
  const { verifier, challenge } = pkce();
  const state = base64url(randomBytes(16));
  const { server, port } = await listen();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Sign-in timed out: try again"));
    }, 10 * 60_000);
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const received = url.searchParams.get("code");
      const ok = received && url.searchParams.get("state") === state;
      // Pas de connexion gardée ouverte : le navigateur la réutiliserait pour une connexion suivante, qui arriverait à
      // ce serveur-ci (fermé) au lieu du nouveau.
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", Connection: "close" });
      res.on("finish", () => server.closeAllConnections());
      res.end(ok
        ? PAGE("You're signed in", "You can close this tab and go back to TaskForce.")
        : PAGE("Sign-in didn't finish", "Go back to TaskForce and try again."));
      clearTimeout(timer);
      server.close();
      if (ok && received) resolve(received);
      else reject(new Error(url.searchParams.get("error") === "access_denied" ? "Sign-in was cancelled" : "Sign-in didn't finish: try again"));
    });

    const page = new URL(`${WEB_URL}/auth/desktop`);
    page.search = new URLSearchParams({
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      state,
      ...(signUp ? { signup: "1" } : {}),
    }).toString();
    openBrowser(page.toString()).catch((error: Error) => {
      clearTimeout(timer);
      server.close();
      reject(error);
    });
  });

  const session = await api<{ token?: string; account?: unknown }>("/api/auth/desktop/token", {
    code,
    codeVerifier: verifier,
    redirectUri,
    deviceName: deviceName(),
  });
  if (!session?.token) throw new Error("The TaskForce account service did not open a session");
  return { account: readAccount(session.account), sessionToken: session.token };
}

/**
 * Relit le compte (adresse ou nom changés en ligne) et prolonge la session. Hors ligne, l'appelant garde le compte
 * connu : l'app marche sans réseau après la première connexion. {@link SessionEndedError} si la session est fermée.
 */
export async function refresh(sessionToken: string): Promise<Account> {
  const session = await api<{ account?: unknown }>("/api/auth/desktop/session", { token: sessionToken });
  return readAccount(session?.account);
}

/** Ferme la session côté compte ; sans réseau, l'app oublie quand même la session locale. */
export async function revoke(sessionToken: string): Promise<void> {
  await api("/api/auth/desktop/revoke", { token: sessionToken });
}

/** Page du compte dans la webapp : adresse, mot de passe, double authentification, passkeys, ordinateurs connectés. */
export const accountPageUrl = (): string => `${WEB_URL}/account`;

/** Échec de connexion dit pour la personne ; le message technique reste dans le journal de l'app. */
export function signInError(message: string): string {
  if (/cancelled/i.test(message)) return "Sign-in was cancelled. Try again when you're ready.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|timed? ?out|aborted|answered 5\d\d/i.test(message)) {
    return "TaskForce couldn't reach your account. Check your connection and try again.";
  }
  if (/expired or is invalid/i.test(message)) return "The sign-in took too long. Try again.";
  return "Sign-in didn't finish. Try again.";
}
