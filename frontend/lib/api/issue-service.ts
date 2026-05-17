/**
 * Service pour les opérations sur les issues.
 * Toutes les routes sont scopées par workspace slug + project id.
 */

import { apiClient } from "./client";
import { ISSUE_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssuePriority = "NONE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type IssueStatusCategory = "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELLED";
export type IssueRelationType = "BLOCKS" | "BLOCKED_BY" | "DUPLICATE" | "RELATES_TO";
export type IssueActivityType =
  | "CREATED" | "STATUS_CHANGED" | "PRIORITY_CHANGED" | "ASSIGNEE_CHANGED"
  | "TYPE_CHANGED" | "TITLE_CHANGED" | "DESCRIPTION_CHANGED" | "LABEL_ADDED"
  | "LABEL_REMOVED" | "DUE_DATE_CHANGED" | "START_DATE_CHANGED" | "PARENT_CHANGED"
  | "COMMENT_ADDED" | "COMMENT_DELETED" | "COMPLETED" | "REOPENED";

export interface UserSummary {
  id: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface IssueStatus {
  id: number;
  name: string;
  color: string;
  category: IssueStatusCategory;
  position: number;
  isDefault: boolean;
}

export interface IssueType {
  id: number;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export interface IssueLabel {
  id: number;
  name: string;
  color: string;
}

export interface IssueSummary {
  id: number;
  sequenceNumber: number;
  identifier: string;
  title: string;
  status: IssueStatus;
}

export interface Issue {
  id: number;
  sequenceNumber: number;
  identifier: string;
  title: string;
  description: string | null;
  priority: IssuePriority;
  status: IssueStatus;
  type: IssueType | null;
  assignee: UserSummary | null;
  reporter: UserSummary;
  parent: IssueSummary | null;
  childCount: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  labels: IssueLabel[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: number;
  author: UserSummary;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueActivity {
  id: number;
  actor: UserSummary | null;
  action: IssueActivityType;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface CreateIssuePayload {
  title: string;
  description?: string;
  statusId?: number;
  typeId?: number;
  priority?: IssuePriority;
  assigneeId?: number;
  parentId?: number;
  startDate?: string;
  dueDate?: string;
}

export interface UpdateIssuePayload {
  title?: string;
  description?: string;
  statusId?: number;
  typeId?: number;
  priority?: IssuePriority;
  assigneeId?: number | null;
  parentId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  position?: number;
}

export interface StatusPosition {
  id: number;
  position: number;
}

export interface ReorderStatusesPayload {
  statuses: StatusPosition[];
}

export interface IssueRelation {
  id: number;
  relationType: IssueRelationType;
  issue: IssueSummary;
  relatedIssue: IssueSummary;
  createdBy: UserSummary;
  createdAt: string;
}

export interface CreateIssueRelationPayload {
  targetIssueId: number;
  relationType: IssueRelationType;
}

export interface CreateIssueStatusPayload {
  name: string;
  color?: string;
  category: IssueStatusCategory;
  position?: number;
}

export interface UpdateIssueStatusPayload {
  name?: string;
  color?: string;
  position?: number;
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function listIssues(slug: string, projectId: number): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(ISSUE_ROUTES.LIST(slug, projectId));
  return res.data.data;
}

export async function getIssue(slug: string, projectId: number, issueId: number): Promise<Issue> {
  const res = await apiClient.get<{ data: Issue }>(ISSUE_ROUTES.BY_ID(slug, projectId, issueId));
  return res.data.data;
}

export async function createIssue(
  slug: string,
  projectId: number,
  payload: CreateIssuePayload
): Promise<Issue> {
  const res = await apiClient.post<{ data: Issue }>(ISSUE_ROUTES.CREATE(slug, projectId), payload);
  return res.data.data;
}

export async function updateIssue(
  slug: string,
  projectId: number,
  issueId: number,
  payload: UpdateIssuePayload
): Promise<Issue> {
  const res = await apiClient.patch<{ data: Issue }>(ISSUE_ROUTES.UPDATE(slug, projectId, issueId), payload);
  return res.data.data;
}

export async function deleteIssue(
  slug: string,
  projectId: number,
  issueId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.DELETE(slug, projectId, issueId));
}

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

export async function listStatuses(slug: string, projectId: number): Promise<IssueStatus[]> {
  const res = await apiClient.get<{ data: IssueStatus[] }>(ISSUE_ROUTES.STATUSES(slug, projectId));
  return res.data.data;
}

export async function createStatus(
  slug: string,
  projectId: number,
  payload: CreateIssueStatusPayload
): Promise<IssueStatus> {
  const res = await apiClient.post<{ data: IssueStatus }>(ISSUE_ROUTES.STATUSES(slug, projectId), payload);
  return res.data.data;
}

export async function updateStatus(
  slug: string,
  projectId: number,
  statusId: number,
  payload: UpdateIssueStatusPayload
): Promise<IssueStatus> {
  const res = await apiClient.patch<{ data: IssueStatus }>(ISSUE_ROUTES.STATUS(slug, projectId, statusId), payload);
  return res.data.data;
}

export async function deleteStatus(
  slug: string,
  projectId: number,
  statusId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.STATUS(slug, projectId, statusId));
}

// ---------------------------------------------------------------------------
// Types d'issues
// ---------------------------------------------------------------------------

export async function listTypes(slug: string, projectId: number): Promise<IssueType[]> {
  const res = await apiClient.get<{ data: IssueType[] }>(ISSUE_ROUTES.TYPES(slug, projectId));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Commentaires
// ---------------------------------------------------------------------------

export async function listComments(
  slug: string,
  projectId: number,
  issueId: number
): Promise<IssueComment[]> {
  const res = await apiClient.get<{ data: IssueComment[] }>(ISSUE_ROUTES.COMMENTS(slug, projectId, issueId));
  return res.data.data;
}

export async function addComment(
  slug: string,
  projectId: number,
  issueId: number,
  content: string
): Promise<IssueComment> {
  const res = await apiClient.post<{ data: IssueComment }>(
    ISSUE_ROUTES.COMMENTS(slug, projectId, issueId),
    { content }
  );
  return res.data.data;
}

export async function updateComment(
  slug: string,
  projectId: number,
  issueId: number,
  commentId: number,
  content: string
): Promise<IssueComment> {
  const res = await apiClient.patch<{ data: IssueComment }>(
    ISSUE_ROUTES.COMMENT(slug, projectId, issueId, commentId),
    { content }
  );
  return res.data.data;
}

export async function deleteComment(
  slug: string,
  projectId: number,
  issueId: number,
  commentId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.COMMENT(slug, projectId, issueId, commentId));
}

// ---------------------------------------------------------------------------
// Activité
// ---------------------------------------------------------------------------

export async function listActivity(
  slug: string,
  projectId: number,
  issueId: number
): Promise<IssueActivity[]> {
  const res = await apiClient.get<{ data: IssueActivity[] }>(ISSUE_ROUTES.ACTIVITY(slug, projectId, issueId));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Reorder statuts
// ---------------------------------------------------------------------------

export async function reorderStatuses(
  slug: string,
  projectId: number,
  payload: ReorderStatusesPayload
): Promise<IssueStatus[]> {
  const res = await apiClient.post<{ data: IssueStatus[] }>(
    ISSUE_ROUTES.STATUSES_REORDER(slug, projectId),
    payload
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export async function listRelations(
  slug: string,
  projectId: number,
  issueId: number
): Promise<IssueRelation[]> {
  const res = await apiClient.get<{ data: IssueRelation[] }>(
    ISSUE_ROUTES.RELATIONS(slug, projectId, issueId)
  );
  return res.data.data;
}

export async function addRelation(
  slug: string,
  projectId: number,
  issueId: number,
  payload: CreateIssueRelationPayload
): Promise<IssueRelation> {
  const res = await apiClient.post<{ data: IssueRelation }>(
    ISSUE_ROUTES.RELATIONS(slug, projectId, issueId),
    payload
  );
  return res.data.data;
}

export async function deleteRelation(
  slug: string,
  projectId: number,
  issueId: number,
  relationId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.RELATION(slug, projectId, issueId, relationId));
}
