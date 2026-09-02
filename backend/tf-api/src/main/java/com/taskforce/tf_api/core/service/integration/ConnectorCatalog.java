package com.taskforce.tf_api.core.service.integration;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ConnectorDescriptor;
import com.taskforce.tf_api.core.dto.response.ConnectorField;
import com.taskforce.tf_api.core.enums.ConnectorAuthType;
import com.taskforce.tf_api.core.enums.ConnectorCategory;
import com.taskforce.tf_api.core.enums.ConnectorStatus;

import jakarta.annotation.PostConstruct;

/**
 * <b>Catalogue déclaratif d'intégrations</b> - la source unique du « pool » d'outils branchables sur
 * le Brain OS. Ajouter un outil = une ligne ici (puis un connecteur quand on l'implémente).
 *
 * <p>Chaque outil est décrit par un {@link ConnectorDescriptor} (catégorie, mode d'auth, champs de
 * connexion, capacités, statut). Les {@code AVAILABLE} sont connectables ; les {@code PLANNED} sont
 * affichés dans le pool (roadmap) mais pas encore branchables. C'est ce catalogue qui pilote l'UI
 * générique - plus besoin d'un écran spécifique par outil.
 */
@Component
public class ConnectorCatalog {

    private final Map<String, ConnectorDescriptor> byKey = new LinkedHashMap<>();

    @PostConstruct
    void build() {
        // ── Gestion de projet ────────────────────────────────────────────────
        available("plane", "Plane", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY,
            "Projects & work-items (open-source Jira-like) → Brain OS",
            "https://developers.plane.so/api-reference/introduction",
            "In Plane: click your avatar → Settings → « Personal access tokens » → « Add token », "
            + "then copy the key here. The « workspace slug » is in the URL: app.plane.so/<slug>/…",
            List.of(ConnectorField.secret("apiKey", "Plane API key"),
                    ConnectorField.text("planeWorkspace", "Plane workspace slug")),
            List.of("observe"));
        connectable("linear", "Linear", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Issues & projects (GraphQL)");
        connectable("asana", "Asana", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.OAUTH2, "Tasks & projects");
        connectable("clickup", "ClickUp", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Tasks, docs, goals");
        connectable("jira", "Jira", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.OAUTH2, "Issues & sprints (Atlassian)");
        connectable("trello", "Trello", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Kanban boards");
        connectable("monday", "monday.com", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.TOKEN, "Work OS & boards");
        connectable("airtable", "Airtable", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.TOKEN, "No-code bases & tables");
        connectable("shortcut", "Shortcut", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.TOKEN, "Dev stories & iterations");

        // ── Dev & CI/CD ──────────────────────────────────────────────────────
        available("github", "GitHub", ConnectorCategory.DEV_CICD, ConnectorAuthType.OAUTH2,
            "Repos, issues, PRs (code-side management)", "https://docs.github.com",
            "One-click connect: you are redirected to GitHub to authorize access (OAuth). Nothing to copy.",
            List.of(), List.of("observe", "act"));
        connectable("jenkins", "Jenkins", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Builds & CI pipelines");
        connectable("docker", "Docker", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Images & registries");
        connectable("kubernetes", "Kubernetes", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Deployments & cluster status");
        connectable("gitlab", "GitLab", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Repos, MRs, CI pipelines");
        connectable("bitbucket", "Bitbucket", ConnectorCategory.DEV_CICD, ConnectorAuthType.OAUTH2, "Repos & pipelines (Atlassian)");
        connectable("postman", "Postman", ConnectorCategory.DEV_CICD, ConnectorAuthType.API_KEY, "Collections & automated API tests");
        connectable("insomnia", "Insomnia", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "API client & testing");
        connectable("vscode", "Visual Studio Code", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Editor & extensions");
        connectable("cursor", "Cursor", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "AI editor");
        connectable("sentry", "Sentry", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Error & performance tracking");
        connectable("datadog", "Datadog", ConnectorCategory.DEV_CICD, ConnectorAuthType.API_KEY, "Observability & monitoring");
        connectable("grafana", "Grafana", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Dashboards & metrics");
        connectable("sonarqube", "SonarQube", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Code quality & security");
        connectable("circleci", "CircleCI", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "CI/CD pipelines");
        connectable("terraform", "Terraform", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Infrastructure as code");

        // ── Hébergement & Infra ──────────────────────────────────────────────
        connectable("vercel", "Vercel", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Frontend deploys & logs");
        connectable("render", "Render", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.API_KEY, "Services & deploys (or Railway)");
        connectable("cloudflare", "Cloudflare", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "DNS, CDN, WAF");
        connectable("aws", "Amazon Web Services", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "AWS suite (EC2, S3, …)");
        connectable("azure", "Microsoft Azure", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Microsoft cloud");
        connectable("gcp", "Google Cloud", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Google Cloud (GCP)");
        connectable("netlify", "Netlify", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Frontend & edge deploys");
        connectable("railway", "Railway", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Deploys & services");
        connectable("fly", "Fly.io", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Apps close to your users");
        connectable("digitalocean", "DigitalOcean", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Droplets, apps, databases");
        connectable("heroku", "Heroku", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.API_KEY, "Apps & dynos");
        connectable("firebase", "Firebase", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Backend, auth, hosting (Google)");
        connectable("vps", "VPS", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Generic server (SSH, metrics)");

        // ── Bases de données ─────────────────────────────────────────────────
        connectable("supabase", "Supabase", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Postgres, auth, storage");
        connectable("neon", "Neon", ConnectorCategory.DATABASE, ConnectorAuthType.API_KEY, "Serverless Postgres");
        connectable("mongodb-atlas", "MongoDB Atlas", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "MongoDB clusters");
        connectable("redis-cloud", "Redis Cloud", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Cache & data store");
        connectable("postgresql", "PostgreSQL", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Relational database");
        connectable("planetscale", "PlanetScale", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Serverless MySQL");
        connectable("prisma", "Prisma", ConnectorCategory.DATABASE, ConnectorAuthType.TOKEN, "ORM & Data Platform");
        connectable("elasticsearch", "Elasticsearch", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Search & indexing");
        connectable("snowflake", "Snowflake", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Data warehouse");

        // ── Publicité ────────────────────────────────────────────────────────
        connectable("google-ads", "Google Ads", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Campaigns & spend");
        connectable("meta-ads", "Meta Ads", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Facebook/Instagram Ads");
        connectable("linkedin-ads", "LinkedIn Campaign Manager", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "B2B campaigns");

        // ── Analytics & Produit ──────────────────────────────────────────────
        connectable("google-analytics", "Google Analytics", ConnectorCategory.ANALYTICS, ConnectorAuthType.OAUTH2, "Audience & conversions (GA4)");
        connectable("posthog", "PostHog", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Product analytics & events");
        connectable("microsoft-clarity", "Microsoft Clarity", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Heatmaps & sessions");
        connectable("mixpanel", "Mixpanel", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Product analytics & events");
        connectable("amplitude", "Amplitude", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Product analytics & retention");
        connectable("segment", "Segment", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "CDP & event routing");
        connectable("plausible", "Plausible", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Privacy-friendly web analytics");
        connectable("hotjar", "Hotjar", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Heatmaps & user feedback");

        // ── Paiements & Finance ──────────────────────────────────────────────
        connectable("stripe", "Stripe", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "MRR, customers, invoices");
        connectable("paypal", "PayPal", ConnectorCategory.PAYMENTS, ConnectorAuthType.OAUTH2, "Payments & payouts");
        connectable("paddle", "Paddle", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "SaaS merchant of record");
        connectable("lemonsqueezy", "Lemon Squeezy", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "Sales & subscriptions");
        connectable("wise", "Wise", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "International payments");

        // ── CRM & Ventes ─────────────────────────────────────────────────────
        connectable("hubspot", "HubSpot", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "CRM, deals, marketing");
        connectable("salesforce", "Salesforce", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Enterprise CRM");
        connectable("zoho", "Zoho", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "CRM & business suite");
        connectable("intercom", "Intercom", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Support & customer conversations");
        connectable("pipedrive", "Pipedrive", ConnectorCategory.CRM_SALES, ConnectorAuthType.API_KEY, "Sales pipeline");
        connectable("zendesk", "Zendesk", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Support & tickets");
        connectable("freshworks", "Freshworks", ConnectorCategory.CRM_SALES, ConnectorAuthType.API_KEY, "CRM & customer support");
        connectable("attio", "Attio", ConnectorCategory.CRM_SALES, ConnectorAuthType.API_KEY, "Modern data-driven CRM");

        // ── Communication & Email ────────────────────────────────────────────
        available("slack", "Slack", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2,
            "Channels, messages, issue mirroring", "https://api.slack.com",
            "One-click connect: you are redirected to Slack to authorize the app (OAuth). Nothing to copy.",
            List.of(), List.of("observe", "act"));
        connectable("twilio", "Twilio", ConnectorCategory.COMMUNICATION, ConnectorAuthType.CONFIG, "SMS & voice");
        connectable("resend", "Resend", ConnectorCategory.COMMUNICATION, ConnectorAuthType.API_KEY, "Transactional emails");
        connectable("mail-smtp", "Mail (SMTP)", ConnectorCategory.COMMUNICATION, ConnectorAuthType.CONFIG, "Generic email inbox");
        connectable("discord", "Discord", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Servers & channels");
        connectable("microsoft-teams", "Microsoft Teams", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Chat & meetings (Microsoft)");
        connectable("zoom", "Zoom", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Video conferencing");
        connectable("telegram", "Telegram", ConnectorCategory.COMMUNICATION, ConnectorAuthType.TOKEN, "Bots & messages");
        connectable("whatsapp", "WhatsApp Business", ConnectorCategory.COMMUNICATION, ConnectorAuthType.TOKEN, "Customer messaging");
        connectable("sendgrid", "SendGrid", ConnectorCategory.COMMUNICATION, ConnectorAuthType.API_KEY, "Email at scale");
        connectable("mailchimp", "Mailchimp", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Email marketing");

        // ── Identité & Auth ──────────────────────────────────────────────────
        connectable("clerk", "Clerk", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "Auth & user management");
        connectable("keycloak", "Keycloak", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.CONFIG, "Open-source IAM");
        connectable("auth0", "Auth0", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "Auth as a service");
        connectable("okta", "Okta", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "SSO & enterprise identity");

        // ── Sécurité & Secrets ───────────────────────────────────────────────
        connectable("bitwarden", "Bitwarden", ConnectorCategory.SECURITY, ConnectorAuthType.CONFIG, "Secrets vault");
        connectable("1password", "1Password", ConnectorCategory.SECURITY, ConnectorAuthType.TOKEN, "Team vault & secrets");
        connectable("doppler", "Doppler", ConnectorCategory.SECURITY, ConnectorAuthType.TOKEN, "Secrets management");
        connectable("snyk", "Snyk", ConnectorCategory.SECURITY, ConnectorAuthType.TOKEN, "Dependency security");

        // ── Productivité & Docs ──────────────────────────────────────────────
        connectable("notion", "Notion", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Docs & knowledge bases");
        connectable("google-workspace", "Google Workspace", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Gmail, Drive, Docs, Calendar…");
        connectable("microsoft-365", "Microsoft 365", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Outlook, OneDrive, Teams…");
        connectable("granola", "Granola", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "AI meeting notes");
        connectable("raycast", "Raycast", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Launcher & scripts");
        connectable("gmail", "Gmail", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Email (Google)");
        connectable("google-drive", "Google Drive", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Files & storage (Google)");
        connectable("google-calendar", "Google Calendar", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Calendar (Google)");
        connectable("google-sheets", "Google Sheets", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Spreadsheets (Google)");
        connectable("google-meet", "Google Meet", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Video conferencing (Google)");
        connectable("outlook", "Outlook", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Email & calendar (Microsoft)");
        connectable("onedrive", "OneDrive", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Storage (Microsoft)");
        connectable("confluence", "Confluence", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Wiki & docs (Atlassian)");
        connectable("dropbox", "Dropbox", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "File storage");
        connectable("miro", "Miro", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Collaborative whiteboard");
        connectable("loom", "Loom", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Videos & screen recordings");
        connectable("todoist", "Todoist", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Personal tasks");
        connectable("obsidian", "Obsidian", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.CONFIG, "Markdown notes");

        // ── Design & Média ───────────────────────────────────────────────────
        connectable("canva", "Canva", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.OAUTH2, "Designs & assets");
        connectable("figma", "Figma", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Files & design system");
        connectable("elevenlabs", "ElevenLabs", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.API_KEY, "AI voice & audio");
        connectable("framer", "Framer", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Sites & prototypes");
        connectable("sketch", "Sketch", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Interface design");
        connectable("adobe", "Adobe Creative Cloud", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.OAUTH2, "Photoshop, Illustrator…");

        // ── E-commerce ───────────────────────────────────────────────────────
        connectable("shopify", "Shopify", ConnectorCategory.ECOMMERCE, ConnectorAuthType.OAUTH2, "Store, orders, products");

        // ── Automatisation ───────────────────────────────────────────────────
        connectable("n8n", "n8n", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Self-hosted workflows");
        connectable("zapier", "Zapier", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "No-code automations");
        connectable("make", "Make", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Automation scenarios");
        connectable("pipedream", "Pipedream", ConnectorCategory.AUTOMATION, ConnectorAuthType.TOKEN, "Workflows for developers");

        // ── Modèles IA ───────────────────────────────────────────────────────
        connectable("groq", "Groq", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Fast LLM inference (or other gateway)");
        connectable("openai", "OpenAI", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "GPT & embeddings");
        connectable("anthropic", "Anthropic (Claude)", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Claude - can also drive TaskForce via MCP");
        connectable("gemini", "Google Gemini", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Gemini models (Google)");
        connectable("mistral", "Mistral AI", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "European LLMs");
        connectable("huggingface", "Hugging Face", ConnectorCategory.AI_MODELS, ConnectorAuthType.TOKEN, "Models & inference");
        connectable("ollama", "Ollama", ConnectorCategory.AI_MODELS, ConnectorAuthType.CONFIG, "Local LLMs");
        connectable("perplexity", "Perplexity", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "AI-powered search");
        connectable("cohere", "Cohere", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "LLMs & rerank");
        connectable("replicate", "Replicate", ConnectorCategory.AI_MODELS, ConnectorAuthType.TOKEN, "On-demand hosted models");

        // ── UI & Composants (roadmap) ────────────────────────────────────────
        // Bibliothèques de composants « génératives/officielles » : la valeur visée est la RECOMMANDATION
        // de composants par Cortex sur une tâche UI/UX. Déclarées PLANNED (affichées « Bientôt », non
        // branchables) tant que le moteur de reco n'est pas livré - pas de fausse connexion.
        planned("shadcn", "shadcn/ui", ConnectorCategory.UI_COMPONENTS,
            "Copyable React components (Radix + Tailwind) - Cortex recommendations (coming soon)", "https://ui.shadcn.com");
        planned("21st-dev", "21st.dev", ConnectorCategory.UI_COMPONENTS,
            "React/Tailwind component marketplace - Cortex recommendations (coming soon)", "https://21st.dev");
        planned("radix-ui", "Radix UI", ConnectorCategory.UI_COMPONENTS,
            "Unstyled accessible primitives (shadcn's foundation) - Cortex recommendations (coming soon)", "https://www.radix-ui.com");
        planned("aceternity-ui", "Aceternity UI", ConnectorCategory.UI_COMPONENTS,
            "Ready-to-use animated components (Framer Motion) - Cortex recommendations (coming soon)", "https://ui.aceternity.com");
        planned("magic-ui", "Magic UI", ConnectorCategory.UI_COMPONENTS,
            "Open-source animated components & effects - Cortex recommendations (coming soon)", "https://magicui.design");
        planned("origin-ui", "Origin UI", ConnectorCategory.UI_COMPONENTS,
            "Large collection of Tailwind components - Cortex recommendations (coming soon)", "https://originui.com");

        // « MCP-ready » : connecteurs dont un serveur MCP DISTANT hébergé (officiel) existe → URL suggérée
        // pré-remplie (éditable) dans le dialog Connect. Endpoints vérifiés sur le web (actuels, Streamable
        // HTTP, auth par token via le champ optionnel). Les autres restent en bring-your-own.
        suggestMcp("sentry",     "https://mcp.sentry.dev/mcp");
        suggestMcp("linear",     "https://mcp.linear.app/mcp");
        suggestMcp("cloudflare", "https://mcp.cloudflare.com/mcp");
        suggestMcp("asana",      "https://mcp.asana.com/v2/mcp");
        suggestMcp("jira",       "https://mcp.atlassian.com/v2/mcp");
        suggestMcp("gitlab",     "https://gitlab.com/api/v4/mcp");
        suggestMcp("vercel",     "https://mcp.vercel.com");
    }

    /** Tous les descripteurs, dans l'ordre de déclaration. */
    public List<ConnectorDescriptor> all() {
        return new ArrayList<>(byKey.values());
    }

    public Optional<ConnectorDescriptor> byKey(String key) {
        return Optional.ofNullable(byKey.get(key));
    }

    public boolean isAvailable(String key) {
        ConnectorDescriptor d = byKey.get(key);
        return d != null && d.status() == ConnectorStatus.AVAILABLE;
    }

    // -------------------------------------------------------------------------

    private void available(String key, String name, ConnectorCategory cat, ConnectorAuthType auth,
                           String description, String docsUrl, String setupHint,
                           List<ConnectorField> fields, List<String> caps) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, ConnectorStatus.AVAILABLE, fields, caps, docsUrl, description, setupHint, website(key), null));
    }

    /**
     * Outil du catalogue affiché en <b>roadmap</b> ({@code PLANNED}) : visible dans le pool avec le badge
     * « Bientôt », mais pas encore branchable (aucun formulaire, aucune fausse connexion). Sert à annoncer
     * une intégration à venir. La capacité {@code recommend} porte l'intention (recommandation IA de
     * composants) ; la {@code docsUrl} pointe vers la bibliothèque.
     */
    private void planned(String key, String name, ConnectorCategory cat, String description, String docsUrl) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, ConnectorAuthType.NONE, ConnectorStatus.PLANNED,
            List.of(), List.of("recommend"), docsUrl, description, null, website(key), null));
    }

    /**
     * Connecteur du catalogue branchable via le <b>flux générique</b> : un formulaire déclaratif
     * (champs déduits du mode d'auth) dont les valeurs sont stockées chiffrées. La connexion est
     * réelle et persistée ; la sync des données par service viendra ensuite (comme pour Plane).
     */
    private void connectable(String key, String name, ConnectorCategory cat, ConnectorAuthType auth, String description) {
        // Capability "mcp" : ces connecteurs peuvent être branchés comme SERVEUR MCP (l'utilisateur colle
        // l'URL du serveur MCP de l'outil) → leurs outils deviennent live dans Cortex, écritures validées.
        // C'est le pont qui rend le catalogue concret sans coder chaque intégration à la main.
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, ConnectorStatus.AVAILABLE,
            defaultFields(auth), List.of("observe", "mcp"), null, description, defaultHint(auth), website(key), null));
    }

    /**
     * Pré-remplit l'URL d'un serveur MCP DISTANT hébergé (officiel) pour un connecteur déjà déclaré →
     * « MCP-ready » 1-clic dans le dialog Connect (URL éditable). Endpoints vérifiés sur le web.
     */
    private void suggestMcp(String key, String url) {
        ConnectorDescriptor d = byKey.get(key);
        if (d == null) return;
        byKey.put(key, new ConnectorDescriptor(d.key(), d.name(), d.category(), d.authType(), d.status(),
            d.fields(), d.capabilities(), d.docsUrl(), d.description(), d.setupHint(), d.websiteUrl(), url));
    }

    /** Champs de connexion par défaut selon le mode d'auth (pour les connecteurs génériques). */
    private List<ConnectorField> defaultFields(ConnectorAuthType auth) {
        return switch (auth) {
            case API_KEY -> List.of(ConnectorField.secret("apiKey", "API key"));
            case TOKEN   -> List.of(ConnectorField.secret("token", "Access token"));
            // Pas d'app OAuth enregistrée pour ces services → connexion par token personnel (honnête).
            case OAUTH2  -> List.of(ConnectorField.secret("token", "Personal access token"));
            case CONFIG  -> List.of(ConnectorField.text("endpoint", "URL / endpoint"),
                                    ConnectorField.secret("apiKey", "Key / credentials"));
            case NONE    -> List.of();
        };
    }

    private String defaultHint(ConnectorAuthType auth) {
        return switch (auth) {
            case API_KEY -> "Paste the API key generated in the service's developer settings.";
            case TOKEN   -> "Paste a valid access token (service settings → tokens/API).";
            case OAUTH2  -> "Paste a personal access token from the service (dedicated one-click OAuth is coming later).";
            case CONFIG  -> "Enter the endpoint and the access key/credentials.";
            case NONE    -> null;
        };
    }

    /**
     * Sites officiels (homepage) des services du catalogue - lien RÉEL affiché dans la fiche détaillée.
     * URLs publiques, jamais inventées. Les services purement génériques (VPS, SMTP) n'en ont pas → {@code null}.
     */
    private static final Map<String, String> WEBSITES = Map.ofEntries(
        // Gestion de projet
        Map.entry("plane", "https://plane.so"), Map.entry("linear", "https://linear.app"),
        Map.entry("asana", "https://asana.com"), Map.entry("clickup", "https://clickup.com"),
        Map.entry("jira", "https://www.atlassian.com/software/jira"), Map.entry("trello", "https://trello.com"),
        Map.entry("monday", "https://monday.com"), Map.entry("airtable", "https://airtable.com"),
        Map.entry("shortcut", "https://www.shortcut.com"),
        // Dev & CI/CD
        Map.entry("github", "https://github.com"), Map.entry("jenkins", "https://www.jenkins.io"),
        Map.entry("docker", "https://www.docker.com"), Map.entry("kubernetes", "https://kubernetes.io"),
        Map.entry("gitlab", "https://gitlab.com"), Map.entry("bitbucket", "https://bitbucket.org"),
        Map.entry("postman", "https://www.postman.com"), Map.entry("insomnia", "https://insomnia.rest"),
        Map.entry("vscode", "https://code.visualstudio.com"), Map.entry("cursor", "https://cursor.com"),
        Map.entry("sentry", "https://sentry.io"), Map.entry("datadog", "https://www.datadoghq.com"),
        Map.entry("grafana", "https://grafana.com"), Map.entry("sonarqube", "https://www.sonarsource.com/products/sonarqube"),
        Map.entry("circleci", "https://circleci.com"), Map.entry("terraform", "https://www.terraform.io"),
        // Hébergement & Infra
        Map.entry("vercel", "https://vercel.com"), Map.entry("render", "https://render.com"),
        Map.entry("cloudflare", "https://www.cloudflare.com"), Map.entry("aws", "https://aws.amazon.com"),
        Map.entry("azure", "https://azure.microsoft.com"), Map.entry("gcp", "https://cloud.google.com"),
        Map.entry("netlify", "https://www.netlify.com"), Map.entry("railway", "https://railway.app"),
        Map.entry("fly", "https://fly.io"), Map.entry("digitalocean", "https://www.digitalocean.com"),
        Map.entry("heroku", "https://www.heroku.com"), Map.entry("firebase", "https://firebase.google.com"),
        // Bases de données
        Map.entry("supabase", "https://supabase.com"), Map.entry("neon", "https://neon.tech"),
        Map.entry("mongodb-atlas", "https://www.mongodb.com/atlas"), Map.entry("redis-cloud", "https://redis.io"),
        Map.entry("postgresql", "https://www.postgresql.org"), Map.entry("planetscale", "https://planetscale.com"),
        Map.entry("prisma", "https://www.prisma.io"), Map.entry("elasticsearch", "https://www.elastic.co/elasticsearch"),
        Map.entry("snowflake", "https://www.snowflake.com"),
        // Publicité
        Map.entry("google-ads", "https://ads.google.com"), Map.entry("meta-ads", "https://www.facebook.com/business"),
        Map.entry("linkedin-ads", "https://business.linkedin.com/marketing-solutions"),
        // Analytics & Produit
        Map.entry("google-analytics", "https://analytics.google.com"), Map.entry("posthog", "https://posthog.com"),
        Map.entry("microsoft-clarity", "https://clarity.microsoft.com"), Map.entry("mixpanel", "https://mixpanel.com"),
        Map.entry("amplitude", "https://amplitude.com"), Map.entry("segment", "https://segment.com"),
        Map.entry("plausible", "https://plausible.io"), Map.entry("hotjar", "https://www.hotjar.com"),
        // Paiements & Finance
        Map.entry("stripe", "https://stripe.com"), Map.entry("paypal", "https://www.paypal.com"),
        Map.entry("paddle", "https://www.paddle.com"), Map.entry("lemonsqueezy", "https://www.lemonsqueezy.com"),
        Map.entry("wise", "https://wise.com"),
        // CRM & Ventes
        Map.entry("hubspot", "https://www.hubspot.com"), Map.entry("salesforce", "https://www.salesforce.com"),
        Map.entry("zoho", "https://www.zoho.com"), Map.entry("intercom", "https://www.intercom.com"),
        Map.entry("pipedrive", "https://www.pipedrive.com"), Map.entry("zendesk", "https://www.zendesk.com"),
        Map.entry("freshworks", "https://www.freshworks.com"), Map.entry("attio", "https://attio.com"),
        // Communication & Email
        Map.entry("slack", "https://slack.com"), Map.entry("twilio", "https://www.twilio.com"),
        Map.entry("resend", "https://resend.com"), Map.entry("discord", "https://discord.com"),
        Map.entry("microsoft-teams", "https://www.microsoft.com/microsoft-teams"), Map.entry("zoom", "https://zoom.us"),
        Map.entry("telegram", "https://telegram.org"), Map.entry("whatsapp", "https://business.whatsapp.com"),
        Map.entry("sendgrid", "https://sendgrid.com"), Map.entry("mailchimp", "https://mailchimp.com"),
        // Identité & Auth
        Map.entry("clerk", "https://clerk.com"), Map.entry("keycloak", "https://www.keycloak.org"),
        Map.entry("auth0", "https://auth0.com"), Map.entry("okta", "https://www.okta.com"),
        // Sécurité & Secrets
        Map.entry("bitwarden", "https://bitwarden.com"), Map.entry("1password", "https://1password.com"),
        Map.entry("doppler", "https://www.doppler.com"), Map.entry("snyk", "https://snyk.io"),
        // Productivité & Docs
        Map.entry("notion", "https://www.notion.so"), Map.entry("google-workspace", "https://workspace.google.com"),
        Map.entry("microsoft-365", "https://www.microsoft.com/microsoft-365"), Map.entry("granola", "https://www.granola.ai"),
        Map.entry("raycast", "https://www.raycast.com"), Map.entry("gmail", "https://mail.google.com"),
        Map.entry("google-drive", "https://drive.google.com"), Map.entry("google-calendar", "https://calendar.google.com"),
        Map.entry("google-sheets", "https://sheets.google.com"), Map.entry("google-meet", "https://meet.google.com"),
        Map.entry("outlook", "https://outlook.com"), Map.entry("onedrive", "https://www.microsoft.com/microsoft-365/onedrive"),
        Map.entry("confluence", "https://www.atlassian.com/software/confluence"), Map.entry("dropbox", "https://www.dropbox.com"),
        Map.entry("miro", "https://miro.com"), Map.entry("loom", "https://www.loom.com"),
        Map.entry("todoist", "https://todoist.com"), Map.entry("obsidian", "https://obsidian.md"),
        // Design & Média
        Map.entry("canva", "https://www.canva.com"), Map.entry("figma", "https://www.figma.com"),
        Map.entry("elevenlabs", "https://elevenlabs.io"), Map.entry("framer", "https://www.framer.com"),
        Map.entry("sketch", "https://www.sketch.com"), Map.entry("adobe", "https://www.adobe.com/creativecloud.html"),
        // UI & Composants
        Map.entry("shadcn", "https://ui.shadcn.com"), Map.entry("21st-dev", "https://21st.dev"),
        Map.entry("radix-ui", "https://www.radix-ui.com"), Map.entry("aceternity-ui", "https://ui.aceternity.com"),
        Map.entry("magic-ui", "https://magicui.design"), Map.entry("origin-ui", "https://originui.com"),
        // E-commerce
        Map.entry("shopify", "https://www.shopify.com"),
        // Automatisation
        Map.entry("n8n", "https://n8n.io"), Map.entry("zapier", "https://zapier.com"),
        Map.entry("make", "https://www.make.com"), Map.entry("pipedream", "https://pipedream.com"),
        // Modèles IA
        Map.entry("groq", "https://groq.com"), Map.entry("openai", "https://openai.com"),
        Map.entry("anthropic", "https://www.anthropic.com"), Map.entry("gemini", "https://gemini.google.com"),
        Map.entry("mistral", "https://mistral.ai"), Map.entry("huggingface", "https://huggingface.co"),
        Map.entry("ollama", "https://ollama.com"), Map.entry("perplexity", "https://www.perplexity.ai"),
        Map.entry("cohere", "https://cohere.com"), Map.entry("replicate", "https://replicate.com")
    );

    /** Site officiel d'un connecteur, ou {@code null} s'il n'en a pas de pertinent (services génériques). */
    private static String website(String key) {
        return WEBSITES.get(key);
    }
}
