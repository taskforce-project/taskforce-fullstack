import { API_URL, SessionEndedError, WEB_URL } from "./account";
import { isWorkspaceSlug } from "./claude";

/**
 * Déplacement de projets entre la webapp et cet ordinateur, à la demande de la personne : la coque parle à la webapp
 * avec la session de l'app (`tfa_`, qui ne quitte jamais la coque) et à l'API locale avec le jeton de lancement. Le
 * projet voyage dans un fichier de projet TaskForce (zip), le même que celui du menu Export : il arrive avec ses
 * tickets, leur historique, ses pages et ses pièces jointes. L'original reste où il était.
 */

export interface WebProject {
  id: number;
  name: string;
  identifier: string;
  issueCount: number;
}

/** Un espace de la personne dans la webapp, avec les projets qu'elle y voit. */
export interface WebWorkspace {
  slug: string;
  name: string;
  projects: WebProject[];
}

/** Projet créé de l'autre côté. */
export interface MovedProject {
  id: number;
  name: string;
  workspace: string;
  /** Adresse du projet dans la webapp, pour un projet envoyé en ligne. */
  url?: string;
}

/** Espace créé de l'autre côté, avec tout son travail. */
export interface MovedWorkspace {
  slug: string;
  name: string;
  /** Adresse de l'espace dans la webapp, pour un espace envoyé en ligne. */
  url?: string;
}

/** API locale, jointe par le relais de la fenêtre avec le jeton de lancement. */
export interface LocalApi {
  origin: string;
  launchToken: string;
}

/** Plus gros fichier de projet déplacé (ProjectBundleController.MAX_UPLOAD_BYTES). */
export const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;

/** Un gros projet peut prendre du temps : chaque étape a 10 minutes. */
const STEP_TIMEOUT_MS = 10 * 60_000;

/** Demande de déplacement venue de la page, vérifiée avant que la coque n'appelle quoi que ce soit. */
export function readMove(input: unknown): { workspace: string; projectId: number; target: string } | null {
  const { workspace, projectId, target } = (input ?? {}) as Record<string, unknown>;
  if (!isWorkspaceSlug(workspace) || !isWorkspaceSlug(target)) return null;
  if (typeof projectId !== "number" || !Number.isSafeInteger(projectId) || projectId <= 0) return null;
  return { workspace, projectId, target };
}

async function failure(response: Response, fallback: string, online: boolean): Promise<Error> {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (online && response.status === 401) return new SessionEndedError(payload.message || "The session ended: sign in again");
  return new Error(payload.message || `${fallback} (${response.status})`);
}

/** Corps d'un fichier de projet, borné. */
async function bundleOf(response: Response): Promise<ArrayBuffer> {
  if (Number(response.headers.get("content-length") ?? "0") > MAX_BUNDLE_BYTES) {
    throw new Error("This project is too large to move");
  }
  const bundle = await response.arrayBuffer();
  if (bundle.byteLength > MAX_BUNDLE_BYTES) throw new Error("This project is too large to move");
  return bundle;
}

function readWorkspaces(value: unknown): WebWorkspace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): WebWorkspace[] => {
    const workspace = (entry ?? {}) as Record<string, unknown>;
    if (typeof workspace.slug !== "string" || typeof workspace.name !== "string") return [];
    const projects = Array.isArray(workspace.projects) ? workspace.projects : [];
    return [{
      slug: workspace.slug,
      name: workspace.name,
      projects: projects.flatMap((item): WebProject[] => {
        const project = (item ?? {}) as Record<string, unknown>;
        if (typeof project.id !== "number" || typeof project.name !== "string") return [];
        return [{
          id: project.id,
          name: project.name,
          identifier: typeof project.identifier === "string" ? project.identifier : "",
          issueCount: typeof project.issueCount === "number" ? project.issueCount : 0,
        }];
      }),
    }];
  });
}

/** Espace demandé par la page, vérifié avant que la coque n'appelle quoi que ce soit. */
export function readWorkspaceMove(input: unknown): { workspace: string } | null {
  const { workspace } = (input ?? {}) as Record<string, unknown>;
  return isWorkspaceSlug(workspace) ? { workspace } : null;
}

function createdWorkspace(payload: unknown): MovedWorkspace {
  const workspace = ((payload ?? {}) as { data?: { slug?: unknown; name?: unknown } }).data ?? {};
  if (typeof workspace.slug !== "string") throw new Error("The workspace was not created");
  return { slug: workspace.slug, name: typeof workspace.name === "string" ? workspace.name : workspace.slug };
}

function createdProject(payload: unknown, workspace: string): MovedProject {
  const project = ((payload ?? {}) as { data?: { id?: unknown; name?: unknown } }).data ?? {};
  if (typeof project.id !== "number") throw new Error("The project was not created");
  return { id: project.id, name: typeof project.name === "string" ? project.name : "", workspace };
}

export class Transfer {
  constructor(
    private readonly apiUrl: string = API_URL,
    private readonly webUrl: string = WEB_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Espaces de la personne dans la webapp, et les projets qu'elle y voit. */
  async webProjects(sessionToken: string): Promise<WebWorkspace[]> {
    const response = await this.fetchImpl(`${this.apiUrl}/api/auth/desktop/transfer/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: sessionToken }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw await failure(response, "The web app didn't list your projects", true);
    const payload = (await response.json()) as { data?: { workspaces?: unknown } };
    return readWorkspaces(payload.data?.workspaces);
  }

  /** Copie un projet de la webapp dans un espace de cet ordinateur. */
  async bring(
    sessionToken: string,
    from: { workspace: string; projectId: number },
    into: string,
    local: LocalApi,
  ): Promise<MovedProject> {
    const download = await this.fetchImpl(`${this.apiUrl}/api/auth/desktop/transfer/bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: sessionToken, workspace: from.workspace, projectId: from.projectId }),
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!download.ok) throw await failure(download, "The web app didn't send the project", true);
    const bundle = await bundleOf(download);
    const created = await this.fetchImpl(`${local.origin}/api/workspaces/${into}/projects/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${local.launchToken}`, "Content-Type": "application/zip" },
      body: bundle,
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!created.ok) throw await failure(created, "TaskForce couldn't create the project", false);
    return createdProject(await created.json(), into);
  }

  /** Copie un projet de cet ordinateur dans un espace de la webapp. */
  async send(
    sessionToken: string,
    from: { workspace: string; projectId: number },
    to: string,
    local: LocalApi,
  ): Promise<MovedProject> {
    const download = await this.fetchImpl(`${local.origin}/api/workspaces/${from.workspace}/projects/${from.projectId}/bundle`, {
      headers: { Authorization: `Bearer ${local.launchToken}` },
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!download.ok) throw await failure(download, "TaskForce couldn't pack the project", false);
    const bundle = await bundleOf(download);
    const created = await this.fetchImpl(`${this.apiUrl}/api/auth/desktop/transfer/import?workspace=${to}`, {
      method: "POST",
      headers: { "X-TaskForce-Session": sessionToken, "Content-Type": "application/zip" },
      body: bundle,
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!created.ok) throw await failure(created, "The web app didn't create the project", true);
    const project = createdProject(await created.json(), to);
    return { ...project, url: `${this.webUrl}/${to}/projects/${project.id}` };
  }

  /** Copie un espace entier de la webapp (Brain OS et projets) sur cet ordinateur, comme un nouvel espace. */
  async bringWorkspace(sessionToken: string, workspace: string, local: LocalApi): Promise<MovedWorkspace> {
    const download = await this.fetchImpl(`${this.apiUrl}/api/auth/desktop/transfer/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: sessionToken, workspace }),
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!download.ok) throw await failure(download, "The web app didn't send the workspace", true);
    const bundle = await bundleOf(download);
    const created = await this.fetchImpl(`${local.origin}/api/workspaces/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${local.launchToken}`, "Content-Type": "application/zip" },
      body: bundle,
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!created.ok) throw await failure(created, "TaskForce couldn't create the workspace", false);
    return createdWorkspace(await created.json());
  }

  /** Copie un espace entier de cet ordinateur (Brain OS et projets) dans la webapp, comme un nouvel espace. */
  async sendWorkspace(sessionToken: string, workspace: string, local: LocalApi): Promise<MovedWorkspace> {
    const download = await this.fetchImpl(`${local.origin}/api/workspaces/${workspace}/bundle`, {
      headers: { Authorization: `Bearer ${local.launchToken}` },
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!download.ok) throw await failure(download, "TaskForce couldn't pack the workspace", false);
    const bundle = await bundleOf(download);
    const created = await this.fetchImpl(`${this.apiUrl}/api/auth/desktop/transfer/workspace-import`, {
      method: "POST",
      headers: { "X-TaskForce-Session": sessionToken, "Content-Type": "application/zip" },
      body: bundle,
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    if (!created.ok) throw await failure(created, "The web app didn't create the workspace", true);
    const moved = createdWorkspace(await created.json());
    return { ...moved, url: `${this.webUrl}/${moved.slug}` };
  }

  /** Message d'un déplacement qui échoue, dit pour la personne ; le message du serveur est gardé quand il y en a un. */
  static errorMessage(message: string): string {
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|timed? ?out|aborted/i.test(message)) {
      return "TaskForce couldn't reach the web app. Check your connection and try again.";
    }
    return message;
  }

  /** Adresse de la webapp que l'app peut ouvrir dans le navigateur (un projet envoyé en ligne). */
  isWebAddress(url: unknown): url is string {
    return typeof url === "string" && url.startsWith(`${this.webUrl}/`);
  }
}
