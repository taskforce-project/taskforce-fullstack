import type { Issue } from "@/lib/api/issue-service";

/** Échappe une valeur pour le format CSV (RFC 4180). */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRow(issue: Issue): (string | number | null)[] {
  return [
    issue.identifier,
    issue.title,
    issue.status?.name ?? "",
    issue.priority,
    issue.assignee?.displayName ?? issue.assignee?.email ?? "",
    issue.reporter?.displayName ?? issue.reporter?.email ?? "",
    issue.labels.map((l) => l.name).join(" | "),
    issue.storyPoints ?? "",
    issue.dueDate ?? "",
    issue.createdAt,
  ];
}

const HEADER = [
  "Identifier", "Title", "Status", "Priority", "Assignee",
  "Reporter", "Labels", "Story Points", "Due Date", "Created At",
];

/**
 * Exporte une liste d'issues en CSV et déclenche le téléchargement (PROD-1.7).
 * BOM UTF-8 ajouté pour qu'Excel ouvre correctement les accents.
 */
export function exportIssuesToCsv(issues: Issue[], filenameBase = "issues"): void {
  const rows = [HEADER, ...issues.map(toRow)];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${filenameBase}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
