import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { canonicalJson, type Json } from "./engine/rules-engine.js";

/**
 * L'action exacte d'une écriture (R198 : « au moins l'empreinte du contenu écrit, que le relevé des fichiers permet de
 * retrouver ») : avant qu'elle parte, ce que le fichier contiendra si elle passe. Le relevé final des fichiers porte la
 * même empreinte pour le contenu qui reste ({@link contentHash}) : une écriture jugée par les règles se retrouve ainsi
 * dans le résultat. Rien n'est écrit ici ; un fichier qui peut porter un secret n'a pas d'empreinte.
 */

/** `sha256:` et l'empreinte hexadécimale. */
export function sha256(data: string | Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

/**
 * L'empreinte de l'entrée d'un outil, l'action exacte qu'il fera : le SHA-256 de son JSON canonique (celui du dossier,
 * RFC 8785 sur ces valeurs). La session brute de l'agent porte cette entrée : un tiers la retrouve.
 */
export function inputHash(input: unknown): string | null {
  try {
    return sha256(canonicalJson((input ?? {}) as Json));
  } catch {
    // Un nombre décimal dans l'entrée : le JSON canonique du dossier les refuse.
    return sha256(JSON.stringify(input ?? {}));
  }
}

/** Une écriture de fichier : le chemin dans la copie, et l'empreinte de ce que le fichier contiendra. */
export interface Written {
  path: string;
  sha256?: string;
  bytes?: number;
}

/** Au-delà, un fichier n'est pas relu pour calculer ce qu'une modification y laissera. */
const MAX_READ = 20_000_000;

const SENSITIVE = [
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|asc|gpg)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|git-credentials)$/i,
  /(^|\/)(credentials|secrets?)(\.[a-z0-9]+)?$/i,
];

/** Un fichier qui peut porter un secret : son empreinte pourrait confirmer un secret court, elle n'est pas calculée. */
export function sensitivePath(path: string): boolean {
  return SENSITIVE.some((pattern) => pattern.test(path));
}

function shown(file: string, workDir: string): string {
  if (!isAbsolute(file)) return file.replaceAll("\\", "/");
  const rel = relative(workDir, file);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.replaceAll("\\", "/") : file.split(/[\\/]/).pop() ?? file;
}

function read(file: string): string | null {
  try {
    const bytes = readFileSync(file);
    return bytes.length > MAX_READ ? null : bytes.toString("utf8");
  } catch {
    return null;
  }
}

/** Remplace comme l'outil Edit de Claude Code : la première occurrence, ou toutes ; rien si le texte n'y est pas. */
function replaced(content: string, oldText: string, newText: string, all: boolean): string | null {
  if (!oldText || !content.includes(oldText)) return null;
  return all ? content.split(oldText).join(newText) : content.replace(oldText, () => newText);
}

/**
 * Ce qu'une écriture de Claude Code laissera dans le fichier : `Write` écrit son contenu ; `Edit` et `MultiEdit`
 * remplacent dans le fichier tel qu'il est. Null pour un outil qui n'écrit pas de fichier. Sans empreinte quand on ne
 * sait pas la calculer (le texte à remplacer n'y est pas, un carnet Jupyter) ou qu'on ne doit pas (un fichier sensible).
 */
export function written(tool: string, input: unknown, workDir: string): Written | null {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const target = args.file_path ?? args.notebook_path;
  if (!["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool) || typeof target !== "string" || !target) return null;
  const file = isAbsolute(target) ? target : join(workDir, target);
  const path = shown(target, workDir);
  if (sensitivePath(path) || tool === "NotebookEdit") return { path };
  let content: string | null = null;
  if (tool === "Write") {
    content = typeof args.content === "string" ? args.content : null;
  } else if (tool === "Edit") {
    const current = read(file);
    content = current === null ? null
      : replaced(current, String(args.old_string ?? ""), String(args.new_string ?? ""), args.replace_all === true);
  } else {
    let current = read(file);
    const edits = Array.isArray(args.edits) ? (args.edits as Array<Record<string, unknown>>) : [];
    for (const edit of edits) {
      if (current === null) break;
      current = replaced(current, String(edit.old_string ?? ""), String(edit.new_string ?? ""), edit.replace_all === true);
    }
    content = edits.length > 0 ? current : null;
  }
  if (content === null) return { path };
  const bytes = Buffer.from(content, "utf8");
  return { path, sha256: sha256(bytes), bytes: bytes.length };
}

/** L'empreinte du contenu d'un fichier tel qu'il est sur le disque, pour le relevé final ; null s'il n'est pas lisible. */
export function contentHash(file: string): { sha256: string; bytes: number } | null {
  try {
    const bytes = readFileSync(file);
    return bytes.length > MAX_READ ? null : { sha256: sha256(bytes), bytes: bytes.length };
  } catch {
    return null;
  }
}
