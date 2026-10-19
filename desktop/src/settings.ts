import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_AI_SETTINGS, type AiSettings } from "./ai";

/** Compte TaskForce connecté, lu dans le jeton d'identité du compte hébergé. */
export interface Account {
  /** Service de comptes qui l'a connecté : un compte d'un autre service (développement, nouvelle adresse) ne s'ouvre pas. */
  issuer: string;
  subject: string;
  email: string;
  givenName: string;
  familyName: string;
}

/** Secrets d'un compte sur ce poste, chiffrés par le système (DPAPI, Trousseau, libsecret). */
interface AccountSecrets {
  /** Jeton de rafraîchissement du compte hébergé (session longue, renouvelée en ligne). */
  refreshToken?: string;
  /** Mot de passe de la base embarquée du compte. */
  databasePassword?: string;
  /** Clé de chiffrement des jetons et clés en base (`TF_ENCRYPTION_KEY`). */
  encryptionKey?: string;
  /** Clé de l'API d'IA choisie par la personne (fournisseur compatible OpenAI). */
  aiApiKey?: string;
}

interface StoredSettings {
  account?: Account;
  /** Fournisseur d'IA choisi, par identifiant de compte (sans la clé, gardée avec les secrets). */
  ai?: Record<string, AiSettings>;
  /** Secrets chiffrés, par identifiant de compte (base64 du texte chiffré). */
  secrets?: Record<string, Record<keyof AccountSecrets, string | undefined>>;
}

const file = (): string => join(app.getPath("userData"), "settings.json");

function read(): StoredSettings {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as StoredSettings) : {};
  } catch {
    return {};
  }
}

/** Écriture atomique : un fichier à moitié écrit ne doit jamais faire perdre la session. */
function write(settings: StoredSettings): void {
  mkdirSync(dirname(file()), { recursive: true });
  const tmp = file() + ".tmp";
  writeFileSync(tmp, JSON.stringify(settings, null, 2));
  renameSync(tmp, file());
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("The system keychain is not available: TaskForce cannot keep your session safely");
  }
  return safeStorage.encryptString(value).toString("base64");
}

function decrypt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return undefined;
  }
}

export const settings = {
  account(): Account | undefined {
    return read().account;
  },

  setAccount(account: Account): void {
    const current = read();
    write({ ...current, account });
  },

  /** Oublie le compte connecté sur ce poste (ses données restent sur le disque, pour sa prochaine connexion). */
  clearAccount(): void {
    const current = read();
    if (current.account) {
      const secrets = { ...(current.secrets ?? {}) };
      const entry = secrets[current.account.subject];
      if (entry) secrets[current.account.subject] = { ...entry, refreshToken: undefined };
      write({ ...current, account: undefined, secrets });
    }
  },

  aiSettings(subject: string): AiSettings {
    return { ...DEFAULT_AI_SETTINGS, ...(read().ai?.[subject] ?? {}) };
  },

  setAiSettings(subject: string, ai: AiSettings): void {
    const current = read();
    write({ ...current, ai: { ...(current.ai ?? {}), [subject]: ai } });
  },

  secret(subject: string, name: keyof AccountSecrets): string | undefined {
    return decrypt(read().secrets?.[subject]?.[name]);
  },

  setSecret(subject: string, name: keyof AccountSecrets, value: string | undefined): void {
    const current = read();
    const secrets = { ...(current.secrets ?? {}) };
    const entry = { ...(secrets[subject] ?? {}) } as Record<keyof AccountSecrets, string | undefined>;
    entry[name] = value === undefined ? undefined : encrypt(value);
    secrets[subject] = entry;
    write({ ...current, secrets });
  },
};
