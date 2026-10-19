/**
 * Passkeys côté navigateur (WebAuthn). Le serveur (Spring Security) vérifie tout : ici on traduit ses options pour
 * l'API du navigateur, puis la réponse du navigateur en JSON pour le serveur.
 *
 * Le JSON envoyé reprend les champs du script de Spring Security (id, rawId, type, response, clientExtensionResults,
 * authenticatorAttachment), sans plus : le `toJSON()` des navigateurs en ajoute que le serveur n'attend pas.
 */

type Json = Record<string, unknown>;

/** Réponse du navigateur, prête pour le serveur. */
export type PasskeyCredentialJson = Json;

/** Échec d'une cérémonie : `exists` = cet appareil a déjà une passkey de ce compte, `failed` = autre refus. */
export class PasskeyError extends Error {
  readonly reason: "exists" | "failed";

  constructor(reason: "exists" | "failed") {
    super(reason === "exists" ? "This device already has a passkey for this account." : "The browser couldn't use a passkey.");
    this.name = "PasskeyError";
    this.reason = reason;
  }
}

/** Le navigateur sait-il créer et utiliser des passkeys ici (adresse sûre : https ou localhost) ? */
export function passkeysSupported(): boolean {
  return globalThis.window !== undefined
    && globalThis.isSecureContext === true
    && typeof globalThis.PublicKeyCredential === "function"
    && globalThis.navigator?.credentials !== undefined;
}

/** Le navigateur propose-t-il les passkeys dans le champ e-mail (« conditional mediation ») ? */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  if (!passkeysSupported() || typeof PublicKeyCredential.isConditionalMediationAvailable !== "function") return false;
  try {
    return await PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

export function base64urlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sans les null du serveur : le navigateur refuse null là où il attend une valeur ou rien. */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, withoutNulls(v)]));
  }
  return value;
}

function descriptors(list: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((d: { id: string; type: PublicKeyCredentialType; transports?: AuthenticatorTransport[] }) =>
    ({ ...d, id: base64urlToBuffer(d.id) }));
}

/** Options de création du serveur (JSON WebAuthn) pour `navigator.credentials.create`. */
export function creationOptions(json: Json): PublicKeyCredentialCreationOptions {
  const o = withoutNulls(json) as Json & { challenge: string; user: Json & { id: string }; excludeCredentials?: unknown };
  return {
    ...o,
    challenge: base64urlToBuffer(o.challenge),
    user: { ...o.user, id: base64urlToBuffer(o.user.id) },
    excludeCredentials: descriptors(o.excludeCredentials),
  } as unknown as PublicKeyCredentialCreationOptions;
}

/** Options de connexion du serveur (JSON WebAuthn) pour `navigator.credentials.get`. */
export function requestOptions(json: Json): PublicKeyCredentialRequestOptions {
  const o = withoutNulls(json) as Json & { challenge: string; allowCredentials?: unknown };
  return {
    ...o,
    challenge: base64urlToBuffer(o.challenge),
    allowCredentials: descriptors(o.allowCredentials),
  } as unknown as PublicKeyCredentialRequestOptions;
}

/** Réponse du navigateur en JSON pour le serveur : création (attestation) ou connexion (assertion). */
export function credentialJson(credential: PublicKeyCredential): PasskeyCredentialJson {
  const response = credential.response;
  const common = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
  if ("attestationObject" in response) {
    const created = response as AuthenticatorAttestationResponse;
    return {
      ...common,
      response: {
        attestationObject: bufferToBase64url(created.attestationObject),
        clientDataJSON: bufferToBase64url(created.clientDataJSON),
        transports: typeof created.getTransports === "function" ? created.getTransports() : [],
      },
    };
  }
  const signed = response as AuthenticatorAssertionResponse;
  return {
    ...common,
    response: {
      authenticatorData: bufferToBase64url(signed.authenticatorData),
      clientDataJSON: bufferToBase64url(signed.clientDataJSON),
      signature: bufferToBase64url(signed.signature),
      userHandle: signed.userHandle ? bufferToBase64url(signed.userHandle) : undefined,
    },
  };
}

/** La personne a fermé la fenêtre du navigateur, ou la demande a été annulée : rien à signaler. */
function cancelled(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}

/** Crée une passkey pour ces options. Null si la personne renonce ; {@link PasskeyError} sinon. */
export async function createPasskey(options: Json): Promise<PasskeyCredentialJson | null> {
  try {
    const credential = await navigator.credentials.create({ publicKey: creationOptions(options) });
    return credential ? credentialJson(credential as PublicKeyCredential) : null;
  } catch (error) {
    if (cancelled(error)) return null;
    throw new PasskeyError(error instanceof DOMException && error.name === "InvalidStateError" ? "exists" : "failed");
  }
}

/**
 * Signe ce défi avec une passkey de ce site. `conditional` : la demande attend que la personne choisisse une passkey
 * dans le champ e-mail. Null si la personne renonce ou si la demande est annulée ; {@link PasskeyError} sinon.
 */
export async function getPasskey(
  options: Json,
  { conditional = false, signal }: { conditional?: boolean; signal?: AbortSignal } = {},
): Promise<PasskeyCredentialJson | null> {
  try {
    const credential = await navigator.credentials.get({
      publicKey: requestOptions(options),
      ...(conditional ? { mediation: "conditional" as CredentialMediationRequirement } : {}),
      signal,
    });
    return credential ? credentialJson(credential as PublicKeyCredential) : null;
  } catch (error) {
    if (cancelled(error)) return null;
    throw new PasskeyError("failed");
  }
}

/**
 * Nom donné à une passkey qui vient d'être créée, pour la reconnaître dans les réglages : l'appareil quand elle y
 * reste, sinon une clé de sécurité ou un téléphone.
 */
export function passkeyLabel(attachment: unknown, userAgent: string): string {
  if (attachment === "cross-platform") return "Security key or phone";
  const device = /iPhone/.test(userAgent) ? "iPhone"
    : /iPad/.test(userAgent) ? "iPad"
    : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X|Macintosh/.test(userAgent) ? "Mac"
    : /CrOS/.test(userAgent) ? "ChromeOS"
    : /Linux/.test(userAgent) ? "Linux"
    : null;
  return device ? `Passkey on ${device}` : "Passkey";
}
