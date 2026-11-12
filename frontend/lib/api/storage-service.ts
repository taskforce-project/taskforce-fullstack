/**
 * Où TaskForce range ce qu'il écrit (R156, séance n°22) : chaque espace choisit, et chaque projet peut choisir le sien,
 * entre le serveur de TaskForce, un dossier de l'ordinateur (app desktop) et le stockage de l'entreprise. Le serveur
 * vérifie le dossier chez l'éditeur ; l'écran dit en phrases ce qu'il rend.
 */
import { apiClient } from "./client"
import { STORAGE_ROUTES } from "../config/api-routes"

export type StorageKind = "server" | "machine" | "google-drive" | "onedrive"

/** Ce que la personne doit faire avant d'y ranger : rien, se connecter à l'outil, ou y accorder l'écriture. */
export type StorageReadiness = "ready" | "connect" | "allow-changes"

/** D'où vient la cible : le projet, l'espace, ou le défaut (rien n'est choisi). */
export type StorageOrigin = "project" | "workspace" | "default"

export interface StorageTargetView {
  storage: StorageKind
  folderName: string | null
  folderUrl: string | null
  path: string | null
  from: StorageOrigin
  chosenBy: string | null
}

export interface StorageChoice {
  storage: StorageKind
  state: StorageReadiness
}

export interface StoredDocumentView {
  id: number
  title: string
  fileName: string
  storage: StorageKind
  folderName: string | null
  webUrl: string | null
  version: string | null
  sizeBytes: number
  /** Date-heure du serveur, en UTC sans fuseau : la lire avec parseServerDate(). */
  savedAt: string | null
  projectId: number | null
  savedFor: string | null
  approvedBy: string | null
}

export interface StorageOverview {
  scope: "workspace" | "project"
  target: StorageTargetView
  /** Pour un projet : le choix de l'espace, qu'il reprend tant qu'il n'a pas le sien. */
  inherited: StorageTargetView | null
  canEdit: boolean
  choices: StorageChoice[]
  documents: StoredDocumentView[]
}

/** Ce que la personne choisit : la cible et son dossier (chez l'éditeur, ou le chemin sur l'ordinateur). */
export interface StorageTargetRequest {
  storage: StorageKind
  folderId?: string
  driveId?: string
  path?: string
}

function route(slug: string, projectId: number | null): string {
  return projectId === null ? STORAGE_ROUTES.WORKSPACE(slug) : STORAGE_ROUTES.PROJECT(slug, projectId)
}

export async function getStorage(slug: string, projectId: number | null): Promise<StorageOverview> {
  const res = await apiClient.get<{ data: StorageOverview }>(route(slug, projectId), { silentError: true })
  return res.data.data
}

export async function chooseStorage(slug: string, projectId: number | null,
                                    request: StorageTargetRequest): Promise<StorageOverview> {
  const res = await apiClient.put<{ data: StorageOverview }>(route(slug, projectId), request)
  return res.data.data
}

export async function resetStorage(slug: string, projectId: number | null): Promise<StorageOverview> {
  const res = await apiClient.delete<{ data: StorageOverview }>(route(slug, projectId))
  return res.data.data
}

/** Le lien qui ouvre un document rangé : chez l'éditeur, ou un lien temporaire de TaskForce ; null sur l'ordinateur. */
export async function getDocumentLink(slug: string, documentId: number): Promise<string | null> {
  const res = await apiClient.get<{ data: { url: string | null } }>(STORAGE_ROUTES.DOCUMENT_LINK(slug, documentId))
  return res.data.data.url
}
