/**
 * Connexion de l'app desktop par la webapp. L'app ouvre `/auth/desktop?code_challenge=…&redirect_uri=…&state=…` dans
 * le navigateur. Si la personne n'est pas connectée, la demande attend dans le stockage de l'onglet le temps de la
 * connexion ou de l'inscription (la page change, GitHub et Google passent par leur site) ; une fois connectée, la
 * webapp revient sur `/auth/desktop` au lieu de l'accueil, pour l'accord.
 */

const STORAGE_KEY = "tf.desktopSignIn";

/** Au-delà, une demande oubliée dans l'onglet ne détourne plus une connexion ordinaire. */
const MAX_AGE_MS = 30 * 60_000;

/** Page de l'accord à l'app desktop. */
export const DESKTOP_SIGN_IN_PATH = "/auth/desktop";

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const REDIRECT_URI = /^http:\/\/127\.0\.0\.1:4781[2-5]\/callback$/;
const STATE = /^[A-Za-z0-9_-]{8,128}$/;

export interface DesktopSignInRequest {
  codeChallenge: string;
  redirectUri: string;
  state: string;
  /** L'app a demandé la création d'un compte (« Create an account »). */
  signUp: boolean;
  savedAt: number;
}

/** La demande de l'app, lue dans l'adresse de la page ; null si elle manque ou n'a pas la forme attendue. */
export function readDesktopRequest(params: URLSearchParams, now = Date.now()): DesktopSignInRequest | null {
  const codeChallenge = params.get("code_challenge") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  if (!CHALLENGE.test(codeChallenge) || !REDIRECT_URI.test(redirectUri) || !STATE.test(state)) return null;
  return { codeChallenge, redirectUri, state, signUp: params.get("signup") === "1", savedAt: now };
}

export function saveDesktopRequest(request: DesktopSignInRequest): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request));
  } catch {
    /* stockage indisponible : la connexion reviendra à l'accueil, la personne relancera depuis l'app */
  }
}

/** La demande en attente dans cet onglet, si elle est récente et bien formée. */
export function pendingDesktopRequest(now = Date.now()): DesktopSignInRequest | null {
  let saved: Partial<DesktopSignInRequest> | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    saved = raw ? (JSON.parse(raw) as Partial<DesktopSignInRequest>) : null;
  } catch {
    saved = null;
  }
  if (!saved) return null;
  const valid = typeof saved.savedAt === "number" && now - saved.savedAt < MAX_AGE_MS
    && CHALLENGE.test(saved.codeChallenge ?? "") && REDIRECT_URI.test(saved.redirectUri ?? "") && STATE.test(saved.state ?? "");
  if (!valid) {
    clearDesktopRequest();
    return null;
  }
  return saved as DesktopSignInRequest;
}

export function clearDesktopRequest(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* rien à effacer */
  }
}

/** Où aller après une connexion réussie : l'accord à l'app desktop si une demande attend, sinon `fallback`. */
export function afterSignInPath(fallback: string): string {
  return pendingDesktopRequest() ? DESKTOP_SIGN_IN_PATH : fallback;
}
