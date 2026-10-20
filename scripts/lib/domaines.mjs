/**
 * Classement des tables par domaine fonctionnel.
 *
 * Source unique, partagée par les générateurs de documentation d'architecture
 * (`generate-schema-docs.mjs`, `generate-class-diagram.mjs`). Deux classifications séparées
 * auraient divergé, ce qui est précisément le défaut que ces scripts corrigent.
 *
 * Toute table de la base absente de ce classement fait ÉCHOUER les générateurs. C'est
 * volontaire : entre le 05/07 et le 23/07/2026, 10 tables ont été ajoutées sans jamais apparaître
 * dans la documentation, faute d'un contrôle bloquant.
 */

export const DOMAINES = [
  {
    id: "4.1", titre: "IAM et Workspace",
    intro: "Le socle multi-tenant. Toute donnée métier est rattachée à un workspace, et l'appartenance à un workspace conditionne l'accès.",
    tables: ["users", "workspaces", "workspace_members", "workspace_invitations", "teams", "team_members", "companies"],
  },
  {
    id: "4.2", titre: "Projets et Issues (coeur métier)",
    intro: "Le domaine que le cahier des charges décrit : les tâches, leur affectation, la charge et les compétences qui la conditionnent.",
    tables: [
      "projects", "project_members", "project_teams", "project_labels", "project_favorites",
      "issues", "issue_statuses", "issue_types", "issue_comments", "issue_activity",
      "issue_checklist_items", "issue_relations", "issue_label_assignments", "issue_worklogs",
      "issue_sequence_counters", "cycles", "cycle_issues", "attachments",
      "member_leaves", "member_skill_profiles", "assignment_events",
    ],
  },
  {
    id: "4.3", titre: "IA, affectation intelligente et graphe de connaissances",
    intro: "Le moteur d'affectation et sa mémoire. `knowledge_nodes` porte les vecteurs d'embedding utilisés par la recherche sémantique.",
    tables: [
      "ai_conversation", "ai_message", "ai_documents", "ai_runs", "ai_generations", "ai_token_usage",
      "ai_insight_snapshots", "brain_workspaces", "knowledge_nodes", "knowledge_edges",
      "analysis_job", "decision_brief", "decision_priority", "saved_chart",
    ],
  },
  {
    id: "4.4", titre: "Authentification et sécurité",
    intro: "Les comptes et les mots de passe sont délégués à Keycloak. L'application garde ce qu'elle gère elle-même : double authentification (TOTP), clés d'accès (passkeys), jetons d'accès personnels, sessions de l'app desktop, codes à usage unique, jetons anti-CSRF et journal d'audit.",
    tables: [
      "otp_verification", "oauth_states", "audit_logs", "user_two_factor", "user_credentials",
      "personal_access_tokens", "desktop_sessions",
    ],
  },
  {
    id: "4.5", titre: "Facturation",
    intro: "Abonnements et historique. Aucune donnée de carte n'est stockée : la facturation est déléguée au prestataire de paiement.",
    tables: ["subscriptions", "subscription_history"],
  },
  {
    id: "4.6", titre: "Intégrations et communications",
    intro: "Connecteurs externes, webhooks et leurs envois, notifications et leurs préférences. Les identifiants de connecteurs sont chiffrés en base (AES-256-GCM).",
    tables: [
      "integrations", "connector_connection", "mcp_oauth_states", "webhooks", "webhook_deliveries",
      "slack_channels", "issue_github_links", "notifications", "notification_preferences",
    ],
  },
  {
    id: "4.7", titre: "Documentation, tableaux de bord, prospects et retours",
    intro: "Pages de documentation collaborative, composition du tableau de bord par utilisateur, demandes commerciales, et retours envoyés depuis l'app.",
    tables: ["pages", "dashboard_cards", "enterprise_inquiries", "feedback"],
  },
  {
    id: "4.8", titre: "Délégation aux agents de code",
    intro: "Les tickets confiés à un agent de code (Claude Code par le runner local, ou GitHub Copilot) : chaque exécution, sa chronologie, et les actions de l'agent qui attendent la décision de la personne qui a délégué.",
    tables: ["delivery_runs", "delivery_run_events", "delivery_run_approvals"],
  },
];

/** Tables techniques, présentes en base mais hors périmètre métier. */
export const HORS_METIER = ["flyway_schema_history"];

/** Renvoie le domaine portant une table donnée, ou `undefined`. */
export function domaineDeTable(table) {
  return DOMAINES.find((d) => d.tables.includes(table));
}
