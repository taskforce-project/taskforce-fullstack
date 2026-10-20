import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_AI_SETTINGS, type AiSettings } from "./ai";

/** Compte TaskForce connecté, tel que l'API du compte le rend à la connexion. */
export interface Account {
  /** Service de comptes qui l'a connecté : un compte d'un autre service (développement, nouvelle adresse) ne s'ouvre pas. */
  issuer: string;
  subject: string;
  email: string;
  givenName: string;
  familyName: string;
  /**
   * Réglages du compte en ligne (rôle, profil de compétences, préférences de notification, onboarding fait), rendus
   * par l'API à la connexion et à chaque lancement : l'app les reprend une fois par poste, là où elle n'a pas encore
   * les siens.
   */
  profile?: Record<string, unknown>;
  /**
   * Photo de profil du compte en ligne (chemin de l'API ou adresse du fournisseur de connexion), que l'app reprend une
   * fois par poste ; `null` sans photo, absente pour un compte gardé par une version qui ne la lisait pas.
   */
  avatarUrl?: string | null;
}

/** Secrets d'un compte sur ce poste, chiffrés par le système (DPAPI, Trousseau, libsecret). */
interface AccountSecrets {
  /** Jeton de session de l'app (`tfa_`), ouvert par la connexion dans la webapp et prolongé à chaque lancement. */
  sessionToken?: string;
  /** Ancienne session Keycloak (avant la connexion par la webapp) : plus lue, effacée à la déconnexion. */
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
  /** Port de la fenêtre, par identifiant de compte : une origine stable garde le stockage du navigateur. */
  windowPorts?: Record<string, number>;
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
      if (entry) secrets[current.account.subject] = { ...entry, sessionToken: undefined, refreshToken: undefined };
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

  windowPort(subject: string): number | undefined {
    return read().windowPorts?.[subject];
  },

  setWindowPort(subject: string, port: number): void {
    const current = read();
    if (current.windowPorts?.[subject] === port) return;
    write({ ...current, windowPorts: { ...(current.windowPorts ?? {}), [subject]: port } });
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
