import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

import type { Account } from "./settings";

/**
 * Connexion au compte TaskForce hébergé (Keycloak), comme une app installée : code d'autorisation avec PKCE et retour
 * sur 127.0.0.1 (RFC 8252). Le mot de passe ne passe jamais par l'app : la personne le saisit dans son navigateur,
 * sur la page du compte. L'app ne garde que le jeton de rafraîchissement, chiffré par le système.
 */

/** Adresse du compte hébergé ; `TF_DESKTOP_ISSUER` la remplace en développement (Keycloak local). */
export const ISSUER = process.env.TF_DESKTOP_ISSUER ?? "https://auth.taskforce-project.fr/realms/taskforce-prod";
export const CLIENT_ID = process.env.TF_DESKTOP_CLIENT_ID ?? "taskforce-desktop";

/** Ports de retour déclarés dans le client Keycloak (`http://127.0.0.1:<port>/callback`), essayés dans l'ordre. */
export const CALLBACK_PORTS = [47812, 47813, 47814, 47815];

/** Session longue : le jeton de rafraîchissement hors ligne évite de se reconnecter à chaque lancement. */
const SCOPES = "openid profile email offline_access";

export interface SignInResult {
  account: Account;
  refreshToken: string;
}

interface Endpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

const base64url = (buffer: Buffer): string => buffer.toString("base64url");

/** Vérificateur et défi PKCE (S256). */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Charge utile d'un jeton d'identité, vérifiée sur ce que l'app attend : émetteur, destinataire, nonce et expiration.
 * Le jeton vient directement du point de jeton, en HTTPS, en échange du code : sa signature n'a pas à être revérifiée
 * ici (OpenID Connect Core §3.1.3.7).
 */
export function readIdToken(idToken: string, expected: { issuer: string; clientId: string; nonce?: string }, now = Date.now()): Account {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("Malformed identity token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (claims.iss !== expected.issuer) throw new Error("Identity token from another issuer");
  if (!audiences.includes(expected.clientId)) throw new Error("Identity token for another application");
  if (expected.nonce !== undefined && claims.nonce !== expected.nonce) throw new Error("Identity token replayed");
  if (typeof claims.exp === "number" && claims.exp * 1000 < now - 60_000) throw new Error("Identity token expired");
  const text = (name: string): string => (typeof claims[name] === "string" ? (claims[name] as string) : "");
  if (!text("sub") || !text("email")) throw new Error("The account has no address: sign in again");
  return {
    issuer: expected.issuer,
    subject: text("sub"),
    email: text("email"),
    givenName: text("given_name"),
    familyName: text("family_name"),
  };
}

async function discover(): Promise<Endpoints> {
  const response = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`The TaskForce account service answered ${response.status}`);
  return (await response.json()) as Endpoints;
}

async function tokenRequest(endpoint: string, form: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || body.error) {
    throw new Error(body.error_description || body.error || `The TaskForce account service answered ${response.status}`);
  }
  return body;
}

const PAGE = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#1c1b19;background:#fbfbfc;display:grid;
place-items:center;height:100vh;margin:0}main{max-width:420px;text-align:center}h1{font-size:20px;margin:0 0 8px}
p{color:#5c5a55;margin:0}</style></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

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
 * Connexion (ou création du compte, `signUp`) dans le navigateur de la personne. `openBrowser` ouvre l'adresse ;
 * la promesse se résout au retour du navigateur, ou échoue au bout de 10 minutes.
 */
export async function signIn(openBrowser: (url: string) => Promise<void>, signUp = false): Promise<SignInResult> {
  const endpoints = await discover();
  const { verifier, challenge } = pkce();
  const state = base64url(randomBytes(16));
  const nonce = base64url(randomBytes(16));
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
      const error = url.searchParams.get("error");
      const received = url.searchParams.get("code");
      const ok = !error && received && url.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(ok
        ? PAGE("You're signed in", "You can close this tab and go back to TaskForce.")
        : PAGE("Sign-in didn't finish", "Go back to TaskForce and try again."));
      clearTimeout(timer);
      server.close();
      if (ok && received) resolve(received);
      else reject(new Error(error === "access_denied" ? "Sign-in was cancelled" : "Sign-in didn't finish: try again"));
    });

    const authorize = new URL(endpoints.authorization_endpoint);
    authorize.search = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(signUp ? { prompt: "create" } : {}),
    }).toString();
    openBrowser(authorize.toString()).catch((error: Error) => {
      clearTimeout(timer);
      server.close();
      reject(error);
    });
  });

  const tokens = await tokenRequest(endpoints.token_endpoint, {
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (!tokens.id_token || !tokens.refresh_token) throw new Error("The TaskForce account service did not open a session");
  return {
    account: readIdToken(tokens.id_token, { issuer: ISSUER, clientId: CLIENT_ID, nonce }),
    refreshToken: tokens.refresh_token,
  };
}

/**
 * Renouvelle la session en ligne et relit le compte (adresse ou nom changés sur la page du compte). Hors ligne,
 * l'appelant garde le compte connu : l'app marche sans réseau après la première connexion.
 */
export async function refresh(refreshToken: string): Promise<SignInResult> {
  const endpoints = await discover();
  const tokens = await tokenRequest(endpoints.token_endpoint, {
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
    scope: SCOPES,
  });
  if (!tokens.id_token) throw new Error("The TaskForce account service did not return the account");
  return {
    account: readIdToken(tokens.id_token, { issuer: ISSUER, clientId: CLIENT_ID }),
    refreshToken: tokens.refresh_token ?? refreshToken,
  };
}

/** Ferme la session côté compte hébergé ; sans réseau, l'app oublie quand même la session locale. */
export async function revoke(refreshToken: string): Promise<void> {
  const endpoints = await discover();
  const endpoint = endpoints.revocation_endpoint ?? `${ISSUER}/protocol/openid-connect/revoke`;
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, token: refreshToken, token_type_hint: "refresh_token" }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Page du compte hébergé : nom, mot de passe, double authentification, suppression. */
export const accountPageUrl = (): string => `${ISSUER}/account`;

/** Échec de connexion dit pour la personne ; le message technique reste dans le journal de l'app. */
export function signInError(message: string): string {
  if (/cancelled/i.test(message)) return "Sign-in was cancelled. Try again when you're ready.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|timed? ?out|aborted|answered 5\d\d/i.test(message)) {
    return "TaskForce couldn't reach your account. Check your connection and try again.";
  }
  if (/offline tokens not allowed/i.test(message)) {
    return "This account can't stay signed in on a computer yet. Write to contact@taskforce-project.fr and we'll fix it.";
  }
  return "Sign-in didn't finish. Try again.";
}
