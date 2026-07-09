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
        planned("linear", "Linear", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Issues & projets (GraphQL)");
        planned("asana", "Asana", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.OAUTH2, "Tâches & projets");
        planned("clickup", "ClickUp", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY, "Tâches, docs, objectifs");

        // ── Dev & CI/CD ──────────────────────────────────────────────────────
        available("github", "GitHub", ConnectorCategory.DEV_CICD, ConnectorAuthType.OAUTH2,
            "Repos, issues, PR (gestion côté code)", "https://docs.github.com",
            "Connexion en 1 clic : tu es redirigé vers GitHub pour autoriser l'accès (OAuth). Rien à copier.",
            List.of(), List.of("observe", "act"));
        planned("jenkins", "Jenkins", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Builds & pipelines CI");
        planned("docker", "Docker", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Images & registries");
        planned("kubernetes", "Kubernetes", ConnectorCategory.DEV_CICD, ConnectorAuthType.CONFIG, "Déploiements & état cluster");

        // ── Hébergement & Infra ──────────────────────────────────────────────
        planned("vercel", "Vercel", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "Déploiements front & logs");
        planned("render", "Render", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.API_KEY, "Services & déploiements (ou Railway)");
        planned("cloudflare", "Cloudflare", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.TOKEN, "DNS, CDN, WAF");
        planned("aws", "Amazon Web Services", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Suite AWS (EC2, S3, …)");
        planned("vps", "VPS", ConnectorCategory.HOSTING_INFRA, ConnectorAuthType.CONFIG, "Serveur générique (SSH, métriques)");

        // ── Bases de données ─────────────────────────────────────────────────
        planned("supabase", "Supabase", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Postgres, auth, storage");
        planned("neon", "Neon", ConnectorCategory.DATABASE, ConnectorAuthType.API_KEY, "Postgres serverless");
        planned("mongodb-atlas", "MongoDB Atlas", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Clusters MongoDB");
        planned("redis-cloud", "Redis Cloud", ConnectorCategory.DATABASE, ConnectorAuthType.CONFIG, "Cache & data store");

        // ── Publicité ────────────────────────────────────────────────────────
        planned("google-ads", "Google Ads", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Campagnes & dépenses");
        planned("meta-ads", "Meta Ads", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Facebook/Instagram Ads");
        planned("linkedin-ads", "LinkedIn Campaign Manager", ConnectorCategory.ADS, ConnectorAuthType.OAUTH2, "Campagnes B2B");

        // ── Analytics & Produit ──────────────────────────────────────────────
        planned("google-analytics", "Google Analytics", ConnectorCategory.ANALYTICS, ConnectorAuthType.OAUTH2, "Audience & conversions (GA4)");
        planned("posthog", "PostHog", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Product analytics & events");
        planned("microsoft-clarity", "Microsoft Clarity", ConnectorCategory.ANALYTICS, ConnectorAuthType.API_KEY, "Heatmaps & sessions");

        // ── Paiements & Finance ──────────────────────────────────────────────
        planned("stripe", "Stripe", ConnectorCategory.PAYMENTS, ConnectorAuthType.API_KEY, "MRR, clients, factures");

        // ── CRM & Ventes ─────────────────────────────────────────────────────
        planned("hubspot", "HubSpot", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "CRM, deals, marketing");
        planned("salesforce", "Salesforce", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "CRM entreprise");
        planned("zoho", "Zoho", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Suite CRM & business");
        planned("intercom", "Intercom", ConnectorCategory.CRM_SALES, ConnectorAuthType.OAUTH2, "Support & conversations clients");

        // ── Communication & Email ────────────────────────────────────────────
        available("slack", "Slack", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2,
            "Canaux, messages, miroir d'issues", "https://api.slack.com",
            "Connexion en 1 clic : tu es redirigé vers Slack pour autoriser l'app (OAuth). Rien à copier.",
            List.of(), List.of("observe", "act"));
        planned("twilio", "Twilio", ConnectorCategory.COMMUNICATION, ConnectorAuthType.CONFIG, "SMS & voix");
        planned("resend", "Resend", ConnectorCategory.COMMUNICATION, ConnectorAuthType.API_KEY, "Emails transactionnels");
        planned("mail-smtp", "Mail (SMTP)", ConnectorCategory.COMMUNICATION, ConnectorAuthType.CONFIG, "Boîte email générique");

        // ── Identité & Auth ──────────────────────────────────────────────────
        planned("clerk", "Clerk", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.API_KEY, "Auth & gestion utilisateurs");
        planned("keycloak", "Keycloak", ConnectorCategory.IDENTITY_AUTH, ConnectorAuthType.CONFIG, "IAM open-source");

        // ── Sécurité & Secrets ───────────────────────────────────────────────
        planned("bitwarden", "Bitwarden", ConnectorCategory.SECURITY, ConnectorAuthType.CONFIG, "Coffre de secrets");

        // ── Productivité & Docs ──────────────────────────────────────────────
        planned("notion", "Notion", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Docs & bases de connaissances");
        planned("google-workspace", "Google Workspace", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Gmail, Drive, Docs, Calendar…");
        planned("microsoft-365", "Microsoft 365", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.OAUTH2, "Outlook, OneDrive, Teams…");
        planned("granola", "Granola", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Notes de réunion IA");
        planned("raycast", "Raycast", ConnectorCategory.PRODUCTIVITY, ConnectorAuthType.TOKEN, "Lanceur & scripts");

        // ── Design & Média ───────────────────────────────────────────────────
        planned("canva", "Canva", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.OAUTH2, "Designs & assets");
        planned("figma", "Figma", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.TOKEN, "Fichiers & design system");
        planned("elevenlabs", "ElevenLabs", ConnectorCategory.DESIGN_MEDIA, ConnectorAuthType.API_KEY, "Voix & audio IA");

        // ── E-commerce ───────────────────────────────────────────────────────
        planned("shopify", "Shopify", ConnectorCategory.ECOMMERCE, ConnectorAuthType.OAUTH2, "Boutique, commandes, produits");

        // ── Automatisation ───────────────────────────────────────────────────
        planned("n8n", "n8n", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Workflows self-hosted");
        planned("zapier", "Zapier", ConnectorCategory.AUTOMATION, ConnectorAuthType.API_KEY, "Automatisations no-code");

        // ── Modèles IA ───────────────────────────────────────────────────────
        planned("groq", "Groq", ConnectorCategory.AI_MODELS, ConnectorAuthType.API_KEY, "Inference LLM rapide (ou autre gateway)");
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
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, ConnectorStatus.AVAILABLE, fields, caps, docsUrl, description, setupHint));
    }

    private void planned(String key, String name, ConnectorCategory cat, ConnectorAuthType auth, String description) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, ConnectorStatus.PLANNED, List.of(), List.of("observe"), null, description, null));
    }
}
