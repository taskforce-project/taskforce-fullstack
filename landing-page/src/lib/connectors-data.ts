// AUTOGENERE par scripts/generate-connectors.mjs - ne pas editer a la main.
// Source : catalogue backend (ConnectorCatalog) via GET /integrations/catalog. Regenerer : voir le script.

export type ConnectorAuth = "oauth" | "apikey" | "token" | "config" | "none";

export interface Connector {
  key: string;
  name: string;
  cat: string;
  /** Comment on le connecte. "none" = pas de moyen de connexion aujourd'hui. */
  auth: ConnectorAuth;
  /** Serveur MCP hebergé verifié -> connexion 1 clic, utilisable par l'agent. */
  mcp: boolean;
  /** Profondeur native reelle au-dela du connectable ("Memory" = ingestion, "Actions" = actions). */
  native: string | null;
  /** A un moyen de connexion (auth !== "none"). */
  reachable: boolean;
  desc: string;
}

export const CONNECTORS: Connector[] = [
  {
    "key": "plane",
    "name": "Plane",
    "cat": "pm",
    "auth": "apikey",
    "mcp": false,
    "native": "Memory",
    "reachable": true,
    "desc": "Projects & work-items (open-source Jira-like) to Brain OS"
  },
  {
    "key": "linear",
    "name": "Linear",
    "cat": "pm",
    "auth": "apikey",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Issues & projects (GraphQL)"
  },
  {
    "key": "asana",
    "name": "Asana",
    "cat": "pm",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Tasks & projects"
  },
  {
    "key": "clickup",
    "name": "ClickUp",
    "cat": "pm",
    "auth": "apikey",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Tasks, docs, goals"
  },
  {
    "key": "jira",
    "name": "Jira",
    "cat": "pm",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Issues & sprints (Atlassian)"
  },
  {
    "key": "trello",
    "name": "Trello",
    "cat": "pm",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Kanban boards"
  },
  {
    "key": "monday",
    "name": "monday.com",
    "cat": "pm",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Work OS & boards"
  },
  {
    "key": "airtable",
    "name": "Airtable",
    "cat": "pm",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "No-code bases & tables"
  },
  {
    "key": "shortcut",
    "name": "Shortcut",
    "cat": "pm",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Dev stories & iterations"
  },
  {
    "key": "github",
    "name": "GitHub",
    "cat": "dev",
    "auth": "oauth",
    "mcp": false,
    "native": "Actions",
    "reachable": true,
    "desc": "Repos, issues, PRs (code-side management)"
  },
  {
    "key": "jenkins",
    "name": "Jenkins",
    "cat": "dev",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Builds & CI pipelines"
  },
  {
    "key": "docker",
    "name": "Docker",
    "cat": "dev",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Images & registries"
  },
  {
    "key": "kubernetes",
    "name": "Kubernetes",
    "cat": "dev",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Deployments & cluster status"
  },
  {
    "key": "gitlab",
    "name": "GitLab",
    "cat": "dev",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Repos, MRs, CI pipelines"
  },
  {
    "key": "bitbucket",
    "name": "Bitbucket",
    "cat": "dev",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Repos & pipelines (Atlassian)"
  },
  {
    "key": "postman",
    "name": "Postman",
    "cat": "dev",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Collections & automated API tests"
  },
  {
    "key": "insomnia",
    "name": "Insomnia",
    "cat": "dev",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "API client & testing"
  },
  {
    "key": "vscode",
    "name": "Visual Studio Code",
    "cat": "dev",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Editor & extensions"
  },
  {
    "key": "cursor",
    "name": "Cursor",
    "cat": "dev",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "AI editor"
  },
  {
    "key": "sentry",
    "name": "Sentry",
    "cat": "dev",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Error & performance tracking"
  },
  {
    "key": "datadog",
    "name": "Datadog",
    "cat": "dev",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Observability & monitoring"
  },
  {
    "key": "grafana",
    "name": "Grafana",
    "cat": "dev",
    "auth": "config",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Dashboards & metrics"
  },
  {
    "key": "sonarqube",
    "name": "SonarQube",
    "cat": "dev",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Code quality & security"
  },
  {
    "key": "circleci",
    "name": "CircleCI",
    "cat": "dev",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "CI/CD pipelines"
  },
  {
    "key": "terraform",
    "name": "Terraform",
    "cat": "dev",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Infrastructure as code"
  },
  {
    "key": "vercel",
    "name": "Vercel",
    "cat": "infra",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Frontend deploys & logs"
  },
  {
    "key": "render",
    "name": "Render",
    "cat": "infra",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Services & deploys (or Railway)"
  },
  {
    "key": "cloudflare",
    "name": "Cloudflare",
    "cat": "infra",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "DNS, CDN, WAF"
  },
  {
    "key": "aws",
    "name": "Amazon Web Services",
    "cat": "infra",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "AWS suite (EC2, S3, …)"
  },
  {
    "key": "azure",
    "name": "Microsoft Azure",
    "cat": "infra",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Microsoft cloud"
  },
  {
    "key": "gcp",
    "name": "Google Cloud",
    "cat": "infra",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Google Cloud (GCP)"
  },
  {
    "key": "netlify",
    "name": "Netlify",
    "cat": "infra",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Frontend & edge deploys"
  },
  {
    "key": "railway",
    "name": "Railway",
    "cat": "infra",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Deploys & services"
  },
  {
    "key": "fly",
    "name": "Fly.io",
    "cat": "infra",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Apps close to your users"
  },
  {
    "key": "digitalocean",
    "name": "DigitalOcean",
    "cat": "infra",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Droplets, apps, databases"
  },
  {
    "key": "heroku",
    "name": "Heroku",
    "cat": "infra",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Apps & dynos"
  },
  {
    "key": "firebase",
    "name": "Firebase",
    "cat": "infra",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Backend, auth, hosting (Google)"
  },
  {
    "key": "vps",
    "name": "VPS",
    "cat": "infra",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Generic server (SSH, metrics)"
  },
  {
    "key": "supabase",
    "name": "Supabase",
    "cat": "db",
    "auth": "config",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Postgres, auth, storage"
  },
  {
    "key": "neon",
    "name": "Neon",
    "cat": "db",
    "auth": "apikey",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Serverless Postgres"
  },
  {
    "key": "mongodb-atlas",
    "name": "MongoDB Atlas",
    "cat": "db",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "MongoDB clusters"
  },
  {
    "key": "redis-cloud",
    "name": "Redis Cloud",
    "cat": "db",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Cache & data store"
  },
  {
    "key": "postgresql",
    "name": "PostgreSQL",
    "cat": "db",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Relational database"
  },
  {
    "key": "planetscale",
    "name": "PlanetScale",
    "cat": "db",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Serverless MySQL"
  },
  {
    "key": "prisma",
    "name": "Prisma",
    "cat": "db",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "ORM & Data Platform"
  },
  {
    "key": "elasticsearch",
    "name": "Elasticsearch",
    "cat": "db",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Search & indexing"
  },
  {
    "key": "snowflake",
    "name": "Snowflake",
    "cat": "db",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Data warehouse"
  },
  {
    "key": "google-ads",
    "name": "Google Ads",
    "cat": "ads",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Campaigns & spend"
  },
  {
    "key": "meta-ads",
    "name": "Meta Ads",
    "cat": "ads",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Facebook/Instagram Ads"
  },
  {
    "key": "linkedin-ads",
    "name": "LinkedIn Campaign Manager",
    "cat": "ads",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "B2B campaigns"
  },
  {
    "key": "google-analytics",
    "name": "Google Analytics",
    "cat": "analytics",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Audience & conversions (GA4)"
  },
  {
    "key": "posthog",
    "name": "PostHog",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Product analytics & events"
  },
  {
    "key": "microsoft-clarity",
    "name": "Microsoft Clarity",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Heatmaps & sessions"
  },
  {
    "key": "mixpanel",
    "name": "Mixpanel",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Product analytics & events"
  },
  {
    "key": "amplitude",
    "name": "Amplitude",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Product analytics & retention"
  },
  {
    "key": "segment",
    "name": "Segment",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "CDP & event routing"
  },
  {
    "key": "plausible",
    "name": "Plausible",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Privacy-friendly web analytics"
  },
  {
    "key": "hotjar",
    "name": "Hotjar",
    "cat": "analytics",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Heatmaps & user feedback"
  },
  {
    "key": "stripe",
    "name": "Stripe",
    "cat": "payments",
    "auth": "apikey",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "MRR, customers, invoices"
  },
  {
    "key": "paypal",
    "name": "PayPal",
    "cat": "payments",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Payments & payouts"
  },
  {
    "key": "paddle",
    "name": "Paddle",
    "cat": "payments",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "SaaS merchant of record"
  },
  {
    "key": "lemonsqueezy",
    "name": "Lemon Squeezy",
    "cat": "payments",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Sales & subscriptions"
  },
  {
    "key": "wise",
    "name": "Wise",
    "cat": "payments",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "International payments"
  },
  {
    "key": "square",
    "name": "Square",
    "cat": "payments",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Payments & POS"
  },
  {
    "key": "hubspot",
    "name": "HubSpot",
    "cat": "crm",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "CRM, deals, marketing"
  },
  {
    "key": "salesforce",
    "name": "Salesforce",
    "cat": "crm",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Enterprise CRM"
  },
  {
    "key": "zoho",
    "name": "Zoho",
    "cat": "crm",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "CRM & business suite"
  },
  {
    "key": "intercom",
    "name": "Intercom",
    "cat": "crm",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Support & customer conversations"
  },
  {
    "key": "pipedrive",
    "name": "Pipedrive",
    "cat": "crm",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Sales pipeline"
  },
  {
    "key": "zendesk",
    "name": "Zendesk",
    "cat": "crm",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Support & tickets"
  },
  {
    "key": "freshworks",
    "name": "Freshworks",
    "cat": "crm",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "CRM & customer support"
  },
  {
    "key": "attio",
    "name": "Attio",
    "cat": "crm",
    "auth": "apikey",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Modern data-driven CRM"
  },
  {
    "key": "slack",
    "name": "Slack",
    "cat": "comms",
    "auth": "oauth",
    "mcp": false,
    "native": "Actions",
    "reachable": true,
    "desc": "Channels, messages, issue mirroring"
  },
  {
    "key": "twilio",
    "name": "Twilio",
    "cat": "comms",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "SMS & voice"
  },
  {
    "key": "resend",
    "name": "Resend",
    "cat": "comms",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Transactional emails"
  },
  {
    "key": "mail-smtp",
    "name": "Mail (SMTP)",
    "cat": "comms",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Generic email inbox"
  },
  {
    "key": "discord",
    "name": "Discord",
    "cat": "comms",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Servers & channels"
  },
  {
    "key": "microsoft-teams",
    "name": "Microsoft Teams",
    "cat": "comms",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Chat & meetings (Microsoft)"
  },
  {
    "key": "zoom",
    "name": "Zoom",
    "cat": "comms",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Video conferencing"
  },
  {
    "key": "telegram",
    "name": "Telegram",
    "cat": "comms",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Bots & messages"
  },
  {
    "key": "whatsapp",
    "name": "WhatsApp Business",
    "cat": "comms",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Customer messaging"
  },
  {
    "key": "sendgrid",
    "name": "SendGrid",
    "cat": "comms",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Email at scale"
  },
  {
    "key": "mailchimp",
    "name": "Mailchimp",
    "cat": "comms",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Email marketing"
  },
  {
    "key": "clerk",
    "name": "Clerk",
    "cat": "identity",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Auth & user management"
  },
  {
    "key": "keycloak",
    "name": "Keycloak",
    "cat": "identity",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Open-source IAM"
  },
  {
    "key": "auth0",
    "name": "Auth0",
    "cat": "identity",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Auth as a service"
  },
  {
    "key": "okta",
    "name": "Okta",
    "cat": "identity",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "SSO & enterprise identity"
  },
  {
    "key": "bitwarden",
    "name": "Bitwarden",
    "cat": "security",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Secrets vault"
  },
  {
    "key": "1password",
    "name": "1Password",
    "cat": "security",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Team vault & secrets"
  },
  {
    "key": "doppler",
    "name": "Doppler",
    "cat": "security",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Secrets management"
  },
  {
    "key": "snyk",
    "name": "Snyk",
    "cat": "security",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Dependency security"
  },
  {
    "key": "notion",
    "name": "Notion",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Docs & knowledge bases"
  },
  {
    "key": "google-workspace",
    "name": "Google Workspace",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Gmail, Drive, Docs, Calendar…"
  },
  {
    "key": "microsoft-365",
    "name": "Microsoft 365",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Outlook, OneDrive, Teams…"
  },
  {
    "key": "granola",
    "name": "Granola",
    "cat": "productivity",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "AI meeting notes"
  },
  {
    "key": "raycast",
    "name": "Raycast",
    "cat": "productivity",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Launcher & scripts"
  },
  {
    "key": "gmail",
    "name": "Gmail",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Email (Google)"
  },
  {
    "key": "google-drive",
    "name": "Google Drive",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Files & storage (Google)"
  },
  {
    "key": "google-calendar",
    "name": "Google Calendar",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Calendar (Google)"
  },
  {
    "key": "google-sheets",
    "name": "Google Sheets",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Spreadsheets (Google)"
  },
  {
    "key": "google-meet",
    "name": "Google Meet",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Video conferencing (Google)"
  },
  {
    "key": "outlook",
    "name": "Outlook",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Email & calendar (Microsoft)"
  },
  {
    "key": "onedrive",
    "name": "OneDrive",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Storage (Microsoft)"
  },
  {
    "key": "confluence",
    "name": "Confluence",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Wiki & docs (Atlassian)"
  },
  {
    "key": "dropbox",
    "name": "Dropbox",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "File storage"
  },
  {
    "key": "miro",
    "name": "Miro",
    "cat": "productivity",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Collaborative whiteboard"
  },
  {
    "key": "loom",
    "name": "Loom",
    "cat": "productivity",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Videos & screen recordings"
  },
  {
    "key": "todoist",
    "name": "Todoist",
    "cat": "productivity",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Personal tasks"
  },
  {
    "key": "obsidian",
    "name": "Obsidian",
    "cat": "productivity",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Markdown notes"
  },
  {
    "key": "canva",
    "name": "Canva",
    "cat": "design",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Designs & assets"
  },
  {
    "key": "figma",
    "name": "Figma",
    "cat": "design",
    "auth": "token",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Files & design system"
  },
  {
    "key": "elevenlabs",
    "name": "ElevenLabs",
    "cat": "design",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "AI voice & audio"
  },
  {
    "key": "framer",
    "name": "Framer",
    "cat": "design",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Sites & prototypes"
  },
  {
    "key": "sketch",
    "name": "Sketch",
    "cat": "design",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Interface design"
  },
  {
    "key": "adobe",
    "name": "Adobe Creative Cloud",
    "cat": "design",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Photoshop, Illustrator…"
  },
  {
    "key": "webflow",
    "name": "Webflow",
    "cat": "design",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Sites & CMS"
  },
  {
    "key": "wix",
    "name": "Wix",
    "cat": "design",
    "auth": "oauth",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "Sites & CMS"
  },
  {
    "key": "shopify",
    "name": "Shopify",
    "cat": "ecommerce",
    "auth": "oauth",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Store, orders, products"
  },
  {
    "key": "n8n",
    "name": "n8n",
    "cat": "automation",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Self-hosted workflows"
  },
  {
    "key": "zapier",
    "name": "Zapier",
    "cat": "automation",
    "auth": "apikey",
    "mcp": true,
    "native": null,
    "reachable": true,
    "desc": "No-code automations"
  },
  {
    "key": "make",
    "name": "Make",
    "cat": "automation",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Automation scenarios"
  },
  {
    "key": "pipedream",
    "name": "Pipedream",
    "cat": "automation",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Workflows for developers"
  },
  {
    "key": "groq",
    "name": "Groq",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Fast LLM inference (or other gateway)"
  },
  {
    "key": "openai",
    "name": "OpenAI",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "GPT & embeddings"
  },
  {
    "key": "anthropic",
    "name": "Anthropic (Claude)",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Claude - can also drive TaskForce via MCP"
  },
  {
    "key": "gemini",
    "name": "Google Gemini",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Gemini models (Google)"
  },
  {
    "key": "mistral",
    "name": "Mistral AI",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "European LLMs"
  },
  {
    "key": "huggingface",
    "name": "Hugging Face",
    "cat": "ai",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Models & inference"
  },
  {
    "key": "ollama",
    "name": "Ollama",
    "cat": "ai",
    "auth": "config",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "Local LLMs"
  },
  {
    "key": "perplexity",
    "name": "Perplexity",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "AI-powered search"
  },
  {
    "key": "cohere",
    "name": "Cohere",
    "cat": "ai",
    "auth": "apikey",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "LLMs & rerank"
  },
  {
    "key": "replicate",
    "name": "Replicate",
    "cat": "ai",
    "auth": "token",
    "mcp": false,
    "native": null,
    "reachable": true,
    "desc": "On-demand hosted models"
  },
  {
    "key": "shadcn",
    "name": "shadcn/ui",
    "cat": "ui",
    "auth": "none",
    "mcp": false,
    "native": null,
    "reachable": false,
    "desc": "Copyable React components (Radix + Tailwind) - Cortex recommendations (coming soon)"
  },
  {
    "key": "21st-dev",
    "name": "21st.dev",
    "cat": "ui",
    "auth": "none",
    "mcp": false,
    "native": null,
    "reachable": false,
    "desc": "React/Tailwind component marketplace - Cortex recommendations (coming soon)"
  },
  {
    "key": "radix-ui",
    "name": "Radix UI",
    "cat": "ui",
    "auth": "none",
    "mcp": false,
    "native": null,
    "reachable": false,
    "desc": "Unstyled accessible primitives (shadcn's foundation) - Cortex recommendations (coming soon)"
  },
  {
    "key": "aceternity-ui",
    "name": "Aceternity UI",
    "cat": "ui",
    "auth": "none",
    "mcp": false,
    "native": null,
    "reachable": false,
    "desc": "Ready-to-use animated components (Framer Motion) - Cortex recommendations (coming soon)"
  },
  {
    "key": "magic-ui",
    "name": "Magic UI",
    "cat": "ui",
    "auth": "none",
    "mcp": false,
    "native": null,
    "reachable": false,
    "desc": "Open-source animated components & effects - Cortex recommendations (coming soon)"
  },
  {
    "key": "origin-ui",
    "name": "Origin UI",
    "cat": "ui",
    "auth": "none",
    "mcp": false,
    "native": null,
    "reachable": false,
    "desc": "Large collection of Tailwind components - Cortex recommendations (coming soon)"
  }
];
