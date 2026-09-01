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
 * <b>Catalogue déclaratif d'intégrations</b> — la source unique du « pool » d'outils branchables sur
 * le Brain OS. Ajouter un outil = une ligne ici (puis un connecteur quand on l'implémente).
 *
 * <p>Chaque outil est décrit par un {@link ConnectorDescriptor} (catégorie, mode d'auth, champs de
 * connexion, capacités, statut). Les {@code AVAILABLE} sont connectables ; les {@code PLANNED} sont
 * affichés dans le pool (roadmap) mais pas encore branchables. C'est ce catalogue qui pilote l'UI
 * générique — plus besoin d'un écran spécifique par outil.
 */
@Component
public class ConnectorCatalog {

    private final Map<String, ConnectorDescriptor> byKey = new LinkedHashMap<>();

    @PostConstruct
    void build() {
        // ── Gestion de projet ────────────────────────────────────────────────
        available("plane", "Plane", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY,
            "Projets & work-items (Jira-like open-source) → Brain OS",
            "https://developers.plane.so/api-reference/introduction",
            "Dans Plane : clique ton avatar → Settings → « Personal access tokens » → « Add token », "
            + "copie la clé ici. Le « slug du workspace » est dans l'URL : app.plane.so/<slug>/…",
            List.of(ConnectorField.secret("apiKey", "Clé API Plane"),
                    ConnectorField.text("planeWorkspace", "Slug du workspace Plane")),
            List.of("observe"));
        connectable("linear", "Linear", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Issues & projets (GraphQL)");
        connectable("asana", "Asana", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.OAUTH2, "Tâches & projets");
        connectable("clickup", "ClickUp", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Tâches, docs, objectifs");
        connectable("jira", "Jira", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.OAUTH2, "Issues & sprints (Atlassian)");
        connectable("trello", "Trello", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Boards Kanban");
        connectable("monday", "monday.com", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.TOKEN, "Work OS & boards");
        connectable("airtable", "Airtable", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.TOKEN, "Bases & tables no-code");
        connectable("shortcut", "Shortcut", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.TOKEN, "Stories & itérations dev");

        // ── Dev & CI/CD ──────────────────────────────────────────────────────
        available("github", "GitHub", ConnectorCategory.DEV_CICD, ConnectorAuthType.OAUTH2,
            "Repos, issues, PR (gestion côté code)", "https://docs.github.com",
            "Connexion en 1 clic : tu es redirigé vers GitHub pour autoriser l'accès (OAuth). Rien à copier.",
            List.of(), List.of("observe", "act"));
        connectable("jenkins", "Jenkins", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Builds & pipelines CI");
        connectable("docker", "Docker", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Images & registries");
        connectable("kubernetes", "Kubernetes", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Déploiements & état cluster");
        connectable("gitlab", "GitLab", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Repos, MR, pipelines CI");
        connectable("bitbucket", "Bitbucket", ConnectorCategory.DEV_CICD, ConnectorAuthType.OAUTH2, "Repos & pipelines (Atlassian)");
        connectable("postman", "Postman", ConnectorCategory.DEV_CICD, ConnectorAuthType.API_KEY, "Collections & tests d'API automatisés");
        connectable("insomnia", "Insomnia", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Client & tests d'API");
        connectable("vscode", "Visual Studio Code", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Éditeur & extensions");
        connectable("cursor", "Cursor", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Éditeur IA");
        connectable("sentry", "Sentry", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Suivi d'erreurs & performances");
        connectable("datadog", "Datadog", ConnectorCategory.DEV_CICD, ConnectorAuthType.API_KEY, "Observabilité & monitoring");
        connectable("grafana", "Grafana", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Dashboards & métriques");
        connectable("sonarqube", "SonarQube", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Qualité & sécurité du code");
        connectable("circleci", "CircleCI", ConnectorCategory.DEV_CICD, ConnectorAuthType.TOKEN, "Pipelines CI/CD");
        connectable("terraform", "Terraform", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Infrastructure as code");

        // ── Hébergement & Infra ──────────────────────────────────────────────
        connectable("vercel", "Vercel", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Déploiements front & logs");
        connectable("render", "Render", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.API_KEY, "Services & déploiements (ou Railway)");
        connectable("cloudflare", "Cloudflare", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "DNS, CDN, WAF");
        connectable("aws", "Amazon Web Services", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Suite AWS (EC2, S3, …)");
        connectable("azure", "Microsoft Azure", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Cloud Microsoft");
        connectable("gcp", "Google Cloud", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Cloud Google (GCP)");
        connectable("netlify", "Netlify", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Déploiements front & edge");
        connectable("railway", "Railway", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Déploiements & services");
        connectable("fly", "Fly.io", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Apps proches des utilisateurs");
        connectable("digitalocean", "DigitalOcean", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Droplets, apps, bases");
        connectable("heroku", "Heroku", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.API_KEY, "Apps & dynos");
        connectable("firebase", "Firebase", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Backend, auth, hosting (Google)");
        connectable("vps", "VPS", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Serveur générique (SSH, métriques)");

        // ── Bases de données ─────────────────────────────────────────────────
        connectable("supabase", "Supabase", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Postgres, auth, storage");
        connectable("neon", "Neon", ConnectorCategory.DATABASE, ConnectorAuthType.API_KEY, "Postgres serverless");
        connectable("mongodb-atlas", "MongoDB Atlas", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Clusters MongoDB");
        connectable("redis-cloud", "Redis Cloud", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Cache & data store");
        connectable("postgresql", "PostgreSQL", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Base relationnelle");
        connectable("planetscale", "PlanetScale", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "MySQL serverless");
        connectable("prisma", "Prisma", ConnectorCategory.DATABASE, ConnectorAuthType.TOKEN, "ORM & Data Platform");
        connectable("elasticsearch", "Elasticsearch", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Recherche & indexation");
        connectable("snowflake", "Snowflake", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Data warehouse");

        // ── Publicité ────────────────────────────────────────────────────────
        connectable("google-ads", "Google Ads", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Campagnes & dépenses");
        connectable("meta-ads", "Meta Ads", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Facebook/Instagram Ads");
        connectable("linkedin-ads", "LinkedIn Campaign Manager", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Campagnes B2B");

        // ── Analytics & Produit ──────────────────────────────────────────────
        connectable("google-analytics", "Google Analytics", ConnectorCategory.ANALYTICS, ConnectorAuthType.OAUTH2, "Audience & conversions (GA4)");
        connectable("posthog", "PostHog", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Product analytics & events");
        connectable("microsoft-clarity", "Microsoft Clarity", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Heatmaps & sessions");
        connectable("mixpanel", "Mixpanel", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Product analytics & events");
        connectable("amplitude", "Amplitude", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Analytics produit & rétention");
        connectable("segment", "Segment", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "CDP & routage d'events");
        connectable("plausible", "Plausible", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Analytics web respectueux");
        connectable("hotjar", "Hotjar", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Heatmaps & retours utilisateurs");

        // ── Paiements & Finance ──────────────────────────────────────────────
        connectable("stripe", "Stripe", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "MRR, clients, factures");
        connectable("paypal", "PayPal", ConnectorCategory.PAYMENTS, ConnectorAuthType.OAUTH2, "Paiements & payouts");
        connectable("paddle", "Paddle", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "Merchant of record SaaS");
        connectable("lemonsqueezy", "Lemon Squeezy", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "Ventes & abonnements");
        connectable("wise", "Wise", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "Paiements internationaux");

        // ── CRM & Ventes ─────────────────────────────────────────────────────
        connectable("hubspot", "HubSpot", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "CRM, deals, marketing");
        connectable("salesforce", "Salesforce", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "CRM entreprise");
        connectable("zoho", "Zoho", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Suite CRM & business");
        connectable("intercom", "Intercom", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Support & conversations clients");
        connectable("pipedrive", "Pipedrive", ConnectorCategory.CRM_SALES, ConnectorAuthType.API_KEY, "Pipeline commercial");
        connectable("zendesk", "Zendesk", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Support & tickets");
        connectable("freshworks", "Freshworks", ConnectorCategory.CRM_SALES, ConnectorAuthType.API_KEY, "CRM & support client");
        connectable("attio", "Attio", ConnectorCategory.CRM_SALES, ConnectorAuthType.API_KEY, "CRM moderne orienté données");

        // ── Communication & Email ────────────────────────────────────────────
        available("slack", "Slack", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2,
            "Canaux, messages, miroir d'issues", "https://api.slack.com",
            "Connexion en 1 clic : tu es redirigé vers Slack pour autoriser l'app (OAuth). Rien à copier.",
            List.of(), List.of("observe", "act"));
        connectable("twilio", "Twilio", ConnectorCategory.COMMUNICATION, ConnectorAuthType.CONFIG, "SMS & voix");
        connectable("resend", "Resend", ConnectorCategory.COMMUNICATION, ConnectorAuthType.API_KEY, "Emails transactionnels");
        connectable("mail-smtp", "Mail (SMTP)", ConnectorCategory.COMMUNICATION, ConnectorAuthType.CONFIG, "Boîte email générique");
        connectable("discord", "Discord", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Serveurs & salons");
        connectable("microsoft-teams", "Microsoft Teams", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Chat & réunions (Microsoft)");
        connectable("zoom", "Zoom", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Visioconférence");
        connectable("telegram", "Telegram", ConnectorCategory.COMMUNICATION, ConnectorAuthType.TOKEN, "Bots & messages");
        connectable("whatsapp", "WhatsApp Business", ConnectorCategory.COMMUNICATION, ConnectorAuthType.TOKEN, "Messagerie clients");
        connectable("sendgrid", "SendGrid", ConnectorCategory.COMMUNICATION, ConnectorAuthType.API_KEY, "Emails à grande échelle");
        connectable("mailchimp", "Mailchimp", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2, "Email marketing");

        // ── Identité & Auth ──────────────────────────────────────────────────
        connectable("clerk", "Clerk", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "Auth & gestion utilisateurs");
        connectable("keycloak", "Keycloak", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.CONFIG, "IAM open-source");
        connectable("auth0", "Auth0", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "Auth as a service");
        connectable("okta", "Okta", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "SSO & identité entreprise");

        // ── Sécurité & Secrets ───────────────────────────────────────────────
        connectable("bitwarden", "Bitwarden", ConnectorCategory.SECURITY, ConnectorAuthType.CONFIG, "Coffre de secrets");
        connectable("1password", "1Password", ConnectorCategory.SECURITY, ConnectorAuthType.TOKEN, "Coffre & secrets d'équipe");
        connectable("doppler", "Doppler", ConnectorCategory.SECURITY, ConnectorAuthType.TOKEN, "Gestion de secrets");
        connectable("snyk", "Snyk", ConnectorCategory.SECURITY, ConnectorAuthType.TOKEN, "Sécurité des dépendances");

        // ── Productivité & Docs ──────────────────────────────────────────────
        connectable("notion", "Notion", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Docs & bases de connaissances");
        connectable("google-workspace", "Google Workspace", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Gmail, Drive, Docs, Calendar…");
        connectable("microsoft-365", "Microsoft 365", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Outlook, OneDrive, Teams…");
        connectable("granola", "Granola", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Notes de réunion IA");
        connectable("raycast", "Raycast", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Lanceur & scripts");
        connectable("gmail", "Gmail", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Email (Google)");
        connectable("google-drive", "Google Drive", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Fichiers & stockage (Google)");
        connectable("google-calendar", "Google Calendar", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Agenda (Google)");
        connectable("google-sheets", "Google Sheets", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Tableurs (Google)");
        connectable("google-meet", "Google Meet", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Visioconférence (Google)");
        connectable("outlook", "Outlook", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Email & agenda (Microsoft)");
        connectable("onedrive", "OneDrive", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Stockage (Microsoft)");
        connectable("confluence", "Confluence", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Wiki & docs (Atlassian)");
        connectable("dropbox", "Dropbox", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Stockage de fichiers");
        connectable("miro", "Miro", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Tableau blanc collaboratif");
        connectable("loom", "Loom", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Vidéos & captures d'écran");
        connectable("todoist", "Todoist", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Tâches personnelles");
        connectable("obsidian", "Obsidian", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.CONFIG, "Notes en Markdown");

        // ── Design & Média ───────────────────────────────────────────────────
        connectable("canva", "Canva", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.OAUTH2, "Designs & assets");
        connectable("figma", "Figma", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Fichiers & design system");
        connectable("elevenlabs", "ElevenLabs", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.API_KEY, "Voix & audio IA");
        connectable("framer", "Framer", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Sites & prototypes");
        connectable("sketch", "Sketch", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Design d'interface");
        connectable("adobe", "Adobe Creative Cloud", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.OAUTH2, "Photoshop, Illustrator…");

        // ── E-commerce ───────────────────────────────────────────────────────
        connectable("shopify", "Shopify", ConnectorCategory.ECOMMERCE, ConnectorAuthType.OAUTH2, "Boutique, commandes, produits");

        // ── Automatisation ───────────────────────────────────────────────────
        connectable("n8n", "n8n", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Workflows self-hosted");
        connectable("zapier", "Zapier", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Automatisations no-code");
        connectable("make", "Make", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Scénarios d'automatisation");
        connectable("pipedream", "Pipedream", ConnectorCategory.AUTOMATION, ConnectorAuthType.TOKEN, "Workflows pour développeurs");

        // ── Modèles IA ───────────────────────────────────────────────────────
        connectable("groq", "Groq", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Inference LLM rapide (ou autre gateway)");
        connectable("openai", "OpenAI", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "GPT & embeddings");
        connectable("anthropic", "Anthropic (Claude)", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Claude — peut aussi piloter Taskforce via MCP");
        connectable("gemini", "Google Gemini", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Modèles Gemini (Google)");
        connectable("mistral", "Mistral AI", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "LLM européens");
        connectable("huggingface", "Hugging Face", ConnectorCategory.AI_MODELS, ConnectorAuthType.TOKEN, "Modèles & inference");
        connectable("ollama", "Ollama", ConnectorCategory.AI_MODELS, ConnectorAuthType.CONFIG, "LLM locaux");
        connectable("perplexity", "Perplexity", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Recherche augmentée par IA");
        connectable("cohere", "Cohere", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "LLM & rerank");
        connectable("replicate", "Replicate", ConnectorCategory.AI_MODELS, ConnectorAuthType.TOKEN, "Modèles hébergés à la demande");

        // ── UI & Composants (roadmap) ────────────────────────────────────────
        // Bibliothèques de composants « génératives/officielles » : la valeur visée est la RECOMMANDATION
        // de composants par Cortex sur une tâche UI/UX. Déclarées PLANNED (affichées « Bientôt », non
        // branchables) tant que le moteur de reco n'est pas livré — pas de fausse connexion.
        planned("shadcn", "shadcn/ui", ConnectorCategory.UI_COMPONENTS,
            "Composants React (Radix + Tailwind) copiables — reco. via Cortex (à venir)", "https://ui.shadcn.com");
        planned("21st-dev", "21st.dev", ConnectorCategory.UI_COMPONENTS,
            "Place de marché de composants React/Tailwind — reco. via Cortex (à venir)", "https://21st.dev");
        planned("radix-ui", "Radix UI", ConnectorCategory.UI_COMPONENTS,
            "Primitives accessibles non stylées (base de shadcn) — reco. via Cortex (à venir)", "https://www.radix-ui.com");
        planned("aceternity-ui", "Aceternity UI", ConnectorCategory.UI_COMPONENTS,
            "Composants animés prêts à l'emploi (Framer Motion) — reco. via Cortex (à venir)", "https://ui.aceternity.com");
        planned("magic-ui", "Magic UI", ConnectorCategory.UI_COMPONENTS,
            "Composants & effets animés open-source — reco. via Cortex (à venir)", "https://magicui.design");
        planned("origin-ui", "Origin UI", ConnectorCategory.UI_COMPONENTS,
            "Large collection de composants Tailwind — reco. via Cortex (à venir)", "https://originui.com");
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
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, ConnectorStatus.AVAILABLE, fields, caps, docsUrl, description, setupHint, website(key)));
    }

    /**
     * Outil du catalogue affiché en <b>roadmap</b> ({@code PLANNED}) : visible dans le pool avec le badge
     * « Bientôt », mais pas encore branchable (aucun formulaire, aucune fausse connexion). Sert à annoncer
     * une intégration à venir. La capacité {@code recommend} porte l'intention (recommandation IA de
     * composants) ; la {@code docsUrl} pointe vers la bibliothèque.
     */
    private void planned(String key, String name, ConnectorCategory cat, String description, String docsUrl) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, ConnectorAuthType.NONE, ConnectorStatus.PLANNED,
            List.of(), List.of("recommend"), docsUrl, description, null, website(key)));
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
            defaultFields(auth), List.of("observe", "mcp"), null, description, defaultHint(auth), website(key)));
    }

    /** Champs de connexion par défaut selon le mode d'auth (pour les connecteurs génériques). */
    private List<ConnectorField> defaultFields(ConnectorAuthType auth) {
        return switch (auth) {
            case API_KEY -> List.of(ConnectorField.secret("apiKey", "Clé API"));
            case TOKEN   -> List.of(ConnectorField.secret("token", "Token d'accès"));
            // Pas d'app OAuth enregistrée pour ces services → connexion par token personnel (honnête).
            case OAUTH2  -> List.of(ConnectorField.secret("token", "Token d'accès personnel"));
            case CONFIG  -> List.of(ConnectorField.text("endpoint", "URL / endpoint"),
                                    ConnectorField.secret("apiKey", "Clé / identifiants"));
            case NONE    -> List.of();
        };
    }

    private String defaultHint(ConnectorAuthType auth) {
        return switch (auth) {
            case API_KEY -> "Colle la clé API générée dans les réglages développeur du service.";
            case TOKEN   -> "Colle un token d'accès valide (réglages → tokens/API du service).";
            case OAUTH2  -> "Colle un token d'accès personnel du service (l'OAuth 1-clic dédié arrive plus tard).";
            case CONFIG  -> "Renseigne l'endpoint et la clé/les identifiants d'accès.";
            case NONE    -> null;
        };
    }

    /**
     * Sites officiels (homepage) des services du catalogue — lien RÉEL affiché dans la fiche détaillée.
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
