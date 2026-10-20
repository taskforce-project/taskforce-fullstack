/**
 * Release desktop servie par le site : lue au BUILD dans les GitHub Releases du dépôt (une requête par build,
 * mise en cache dans le module). Aucune donnée inventée : sans release desktop publiée, `getDesktopRelease()`
 * rend `null` et les pages affichent l'état « pas encore publiée » au lieu de liens morts.
 *
 * Le dépôt publie aussi les releases des services web (landing-v*, backend-v*…) : le « latest » de GitHub peut
 * donc tomber sur l'une d'elles. On cherche explicitement le préfixe DESKTOP_TAG_PREFIX et on sert les liens
 * versionnés de ses fichiers. Conséquence : après une release desktop, le site doit être reconstruit.
 *
 * Noms de fichiers reconnus (sorties d'electron-builder) : `.dmg` arm64 / x64 / universal, `.exe` (installeur
 * NSIS), `.AppImage`, `.deb`.
 */

import { REPO } from "./site";

export const DESKTOP_TAG_PREFIX = "desktop-v";

/**
 * Builds signés par plateforme (décision du CEO : compte Apple Developer, certificat Windows). Tant qu'un build
 * n'est pas signé, la page de téléchargement explique l'avertissement du système et comment ouvrir l'app.
 */
export const SIGNED_BUILDS: { mac: boolean; windows: boolean } = { mac: false, windows: false };

export type Platform = "mac-arm64" | "mac-x64" | "windows" | "linux-appimage" | "linux-deb";
export type OsFamily = "mac" | "windows" | "linux";

export interface DesktopAsset {
  platform: Platform;
  name: string;
  url: string;
  size: number;
  /** Empreinte SHA-256 calculée par GitHub, pour vérifier le fichier téléchargé. */
  sha256?: string;
  /** Rapport VirusTotal du fichier, quand le workflow « Desktop - VirusTotal » l'a envoyé. */
  virustotal?: string;
}

export interface DesktopRelease {
  version: string;
  tag: string;
  date: string;
  url: string;
  notes: string;
  prerelease: boolean;
  assets: Partial<Record<Platform, DesktopAsset>>;
}

/** Présentation des fichiers, dans l'ordre d'affichage. */
export const PLATFORMS: { platform: Platform; os: OsFamily; label: string; detail: string }[] = [
  { platform: "mac-arm64", os: "mac", label: "macOS", detail: "Apple silicon (M1 and later)" },
  { platform: "mac-x64", os: "mac", label: "macOS", detail: "Intel" },
  { platform: "windows", os: "windows", label: "Windows", detail: "Windows 10 and 11, 64-bit" },
  { platform: "linux-appimage", os: "linux", label: "Linux", detail: "AppImage, 64-bit" },
  { platform: "linux-deb", os: "linux", label: "Linux", detail: "Debian and Ubuntu (.deb), 64-bit" },
];

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  /** « sha256:… », calculé par GitHub à la publication. */
  digest?: string | null;
}
interface GithubRelease {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  body: string | null;
  assets: GithubAsset[];
}

/** Rattache un fichier de release à une plateforme (null = fichier annexe : blockmap, latest.yml…). */
export function platformOf(name: string): Platform[] {
  const n = name.toLowerCase();
  if (n.endsWith(".blockmap") || n.endsWith(".yml") || n.endsWith(".yaml") || n.endsWith(".zip")) return [];
  if (n.endsWith(".dmg")) {
    if (n.includes("universal")) return ["mac-arm64", "mac-x64"];
    return n.includes("arm64") || n.includes("aarch64") ? ["mac-arm64"] : ["mac-x64"];
  }
  if (n.endsWith(".exe")) return ["windows"];
  if (n.endsWith(".appimage")) return ["linux-appimage"];
  if (n.endsWith(".deb")) return ["linux-deb"];
  return [];
}

/** Titre de la section des notes où le workflow « Desktop - VirusTotal » liste les rapports, un par fichier. */
export const VIRUSTOTAL_HEADING = "### VirusTotal";

/** Rapports VirusTotal listés dans les notes d'une release : nom du fichier → adresse du rapport. */
export function virustotalReports(body: string): Map<string, string> {
  const reports = new Map<string, string>();
  for (const m of body.matchAll(/\[([^\]]+)\]\((https:\/\/www\.virustotal\.com\/gui\/file\/[0-9a-f]{64})\)/g)) {
    reports.set(m[1], m[2]);
  }
  return reports;
}

export function toDesktopRelease(rel: GithubRelease): DesktopRelease {
  const body = rel.body ?? "";
  const reports = virustotalReports(body);
  const assets: Partial<Record<Platform, DesktopAsset>> = {};
  for (const a of rel.assets) {
    for (const platform of platformOf(a.name)) {
      // Un fichier dédié l'emporte sur l'universel s'il y a les deux.
      const existing = assets[platform];
      if (existing && !existing.name.toLowerCase().includes("universal")) continue;
      assets[platform] = {
        platform,
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
        sha256: a.digest?.startsWith("sha256:") ? a.digest.slice("sha256:".length) : undefined,
        virustotal: reports.get(a.name),
      };
    }
  }
  return {
    version: rel.tag_name.slice(DESKTOP_TAG_PREFIX.length),
    tag: rel.tag_name,
    date: rel.published_at ?? "",
    url: rel.html_url,
    // Les rapports VirusTotal s'affichent à côté des fichiers, pas dans les nouveautés.
    notes: body.split(VIRUSTOTAL_HEADING)[0].trim(),
    prerelease: rel.prerelease,
    assets,
  };
}

/** Variables d'environnement du build (Node) ; le site n'embarque pas les types de Node. */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

async function load(): Promise<DesktopRelease | null> {
  // Build hors ligne ou volontairement sans release (ex. aperçu) : DESKTOP_RELEASE=none.
  if (env.DESKTOP_RELEASE === "none") return null;
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "taskforce-site-build",
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=40`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as GithubRelease[];
    const rel = list.find(
      (r) => !r.draft && r.tag_name.startsWith(DESKTOP_TAG_PREFIX) && r.assets.some((a) => platformOf(a.name).length > 0),
    );
    return rel ? toDesktopRelease(rel) : null;
  } catch {
    return null; // réseau indisponible au build : état « pas encore publiée », jamais de lien inventé
  }
}

let cached: Promise<DesktopRelease | null> | null = null;

export function getDesktopRelease(): Promise<DesktopRelease | null> {
  cached ??= load();
  return cached;
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Lien de téléchargement par famille d'OS, pour le bouton qui détecte le système du visiteur. */
export function downloadTargets(release: DesktopRelease | null): Record<OsFamily, string | null> {
  const a = release?.assets ?? {};
  return {
    mac: a["mac-arm64"]?.url ?? a["mac-x64"]?.url ?? null,
    windows: a.windows?.url ?? null,
    linux: a["linux-appimage"]?.url ?? a["linux-deb"]?.url ?? null,
  };
}
