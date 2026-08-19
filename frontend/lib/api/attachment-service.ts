/**
 * Service REST pour les pièces jointes (attachments) d'issues.
 */
import { apiClient } from "./client"
import { ATTACHMENT_ROUTES } from "../config/api-routes"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Attachment {
  id: number
  issueId: number
  originalName: string
  contentType: string
  fileSize: number
  createdAt: string
  uploadedByName: string
  downloadUrl: string | null
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listAttachments(
  slug: string,
  projectId: number,
  issueId: number,
): Promise<Attachment[]> {
  const res = await apiClient.get<{ data: Attachment[] }>(
    ATTACHMENT_ROUTES.LIST(slug, projectId, issueId),
  )
  return res.data.data
}

export async function uploadAttachment(
  slug: string,
  projectId: number,
  issueId: number,
  file: File,
): Promise<Attachment> {
  const form = new FormData()
  form.append("file", file)
  const res = await apiClient.post<{ data: Attachment }>(
    ATTACHMENT_ROUTES.UPLOAD(slug, projectId, issueId),
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  )
  return res.data.data
}

export async function deleteAttachment(
  slug: string,
  projectId: number,
  issueId: number,
  attachmentId: number,
): Promise<void> {
  await apiClient.delete(
    ATTACHMENT_ROUTES.DELETE(slug, projectId, issueId, attachmentId),
  )
}

/** Formate la taille en Ko / Mo */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
