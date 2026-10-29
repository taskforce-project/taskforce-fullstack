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

import jakarta.annotation.PostConstruct;

/**
 * <b>Catalogue des intégrations</b> (ADR-020) : trois intégrations natives et des préréglages de serveurs MCP.
 *
 * <ul>
 *   <li><b>Natives</b> (Plane, GitHub, Slack) : flux de connexion dédié, lecture dans le Brain OS, actions
 *       écrites à la main.</li>
 *   <li><b>Préréglages MCP</b> : outils dont le serveur MCP hébergé officiel a été vérifié ; son URL est
 *       préremplie dans le dialogue de connexion. Leurs outils sont proposés à Cortex ; une écriture attend la
 *       validation d'un propriétaire ou d'un administrateur.</li>
 * </ul>
 *
 * <p>Jusqu'au lot 6 du plan open source, le catalogue affichait 138 tuiles : 104 ne demandaient que l'URL d'un
 * serveur MCP sans en proposer aucune, et 6 étaient « bientôt ». Il ne montre plus que ce qui fonctionne.</p>
 */
@Component
public class ConnectorCatalog {

    private final Map<String, ConnectorDescriptor> byKey = new LinkedHashMap<>();

    @PostConstruct
    public void build() {
        // URL des préréglages : serveurs officiels en HTTP « Streamable » ; sonde initialize du 03/09/2026
        // (401 avec WWW-Authenticate OAuth pour la plupart, donc OAuth en un clic possible).

        // ── Gestion de projet ────────────────────────────────────────────────
        nativeIntegration("plane", "Plane", ConnectorCategory.PROJECT_MANAGEMENT, ConnectorAuthType.API_KEY,
            "Projects and work items, synced into your workspace's knowledge",
            "https://developers.plane.so/api-reference/introduction",
            "In Plane: your avatar > Settings > Personal access tokens > Add token, then paste the key here. "
            + "The workspace slug is in the URL: app.plane.so/<slug>/...",
            List.of(ConnectorField.secret("apiKey", "Plane API key"),
                    ConnectorField.text("planeWorkspace", "Plane workspace slug")),
            List.of("observe"), "https://plane.so");
        mcp("linear",   "Linear",     ConnectorCategory.PROJECT_MANAGEMENT, "Issues & projects",            "https://mcp.linear.app/mcp",       "https://linear.app");
        mcp("jira",     "Jira",       ConnectorCategory.PROJECT_MANAGEMENT, "Issues & sprints (Atlassian)", "https://mcp.atlassian.com/v2/mcp", "https://www.atlassian.com/software/jira");
        mcp("asana",    "Asana",      ConnectorCategory.PROJECT_MANAGEMENT, "Tasks & projects",             "https://mcp.asana.com/v2/mcp",     "https://asana.com");
        mcp("clickup",  "ClickUp",    ConnectorCategory.PROJECT_MANAGEMENT, "Tasks, docs, goals",           "https://mcp.clickup.com/mcp",      "https://clickup.com");
        mcp("monday",   "monday.com", ConnectorCategory.PROJECT_MANAGEMENT, "Work OS & boards",             "https://mcp.monday.com/sse",       "https://monday.com");
        mcp("airtable", "Airtable",   ConnectorCategory.PROJECT_MANAGEMENT, "No-code bases & tables",       "https://mcp.airtable.com/mcp",     "https://airtable.com");

        // ── Dev & CI/CD ──────────────────────────────────────────────────────
        nativeIntegration("github", "GitHub", ConnectorCategory.DEV_CICD, ConnectorAuthType.OAUTH2,
            "Repos, issues, pull requests", "https://docs.github.com",
            "One-click connect: you are redirected to GitHub to authorize access. Nothing to copy.",
            List.of(), List.of("observe", "act"), "https://github.com");
        mcp("sentry",  "Sentry",  ConnectorCategory.DEV_CICD, "Error & performance tracking", "https://mcp.sentry.dev/mcp",    "https://sentry.io");
        mcp("gitlab",  "GitLab",  ConnectorCategory.DEV_CICD, "Repos, MRs, CI pipelines",     "https://gitlab.com/api/v4/mcp", "https://gitlab.com");
        mcp("grafana", "Grafana", ConnectorCategory.DEV_CICD, "Dashboards & metrics",         "https://mcp.grafana.com/mcp",   "https://grafana.com");

        // ── Hébergement & Infra ──────────────────────────────────────────────
        mcp("vercel",     "Vercel",     ConnectorCategory.HOSTING_INFRA, "Frontend deploys & logs", "https://mcp.vercel.com",         "https://vercel.com");
        mcp("cloudflare", "Cloudflare", ConnectorCategory.HOSTING_INFRA, "DNS, CDN, WAF",           "https://mcp.cloudflare.com/mcp", "https://www.cloudflare.com");

        // ── Bases de données ─────────────────────────────────────────────────
        mcp("supabase", "Supabase", ConnectorCategory.DATABASE, "Postgres, auth, storage", "https://mcp.supabase.com/mcp", "https://supabase.com");
        mcp("neon",     "Neon",     ConnectorCategory.DATABASE, "Serverless Postgres",     "https://mcp.neon.tech/sse",    "https://neon.tech");

        // ── Paiements & Finance ──────────────────────────────────────────────
        mcp("stripe", "Stripe", ConnectorCategory.PAYMENTS, "MRR, customers, invoices", "https://mcp.stripe.com",       "https://stripe.com");
        mcp("paypal", "PayPal", ConnectorCategory.PAYMENTS, "Payments & payouts",       "https://mcp.paypal.com/mcp",   "https://www.paypal.com");
        mcp("square", "Square", ConnectorCategory.PAYMENTS, "Payments & POS",           "https://mcp.squareup.com/sse", "https://squareup.com");

        // ── CRM & Ventes ─────────────────────────────────────────────────────
        mcp("hubspot",  "HubSpot",  ConnectorCategory.CRM_SALES, "CRM, deals, marketing",            "https://mcp.hubspot.com/anthropic", "https://www.hubspot.com");
        mcp("intercom", "Intercom", ConnectorCategory.CRM_SALES, "Support & customer conversations", "https://mcp.intercom.com/mcp",      "https://www.intercom.com");
        mcp("attio",    "Attio",    ConnectorCategory.CRM_SALES, "Modern data-driven CRM",           "https://mcp.attio.com/mcp",         "https://attio.com");

        // ── Communication ────────────────────────────────────────────────────
        nativeIntegration("slack", "Slack", ConnectorCategory.COMMUNICATION, ConnectorAuthType.OAUTH2,
            "Issue notifications in your channels, channel history in the Brain OS", "https://api.slack.com",
            "One-click connect: you are redirected to Slack to authorize the app. Nothing to copy.",
            List.of(), List.of("observe", "act"), "https://slack.com");

        // ── Productivité & Docs ──────────────────────────────────────────────
        mcp("notion", "Notion", ConnectorCategory.PRODUCTIVITY, "Docs & knowledge bases", "https://mcp.notion.com/mcp", "https://www.notion.so");

        // ── Design & Média ───────────────────────────────────────────────────
        mcp("figma",   "Figma",   ConnectorCategory.DESIGN_MEDIA, "Files & design system", "https://mcp.figma.com/mcp",   "https://www.figma.com");
        mcp("canva",   "Canva",   ConnectorCategory.DESIGN_MEDIA, "Designs & assets",      "https://mcp.canva.com/mcp",   "https://www.canva.com");
        mcp("webflow", "Webflow", ConnectorCategory.DESIGN_MEDIA, "Sites & CMS",           "https://mcp.webflow.com/sse", "https://webflow.com");
        mcp("wix",     "Wix",     ConnectorCategory.DESIGN_MEDIA, "Sites & CMS",           "https://mcp.wix.com/sse",     "https://www.wix.com");

        // ── Automatisation ───────────────────────────────────────────────────
        mcp("zapier", "Zapier", ConnectorCategory.AUTOMATION, "No-code automations", "https://mcp.zapier.com/api/mcp/mcp", "https://zapier.com");
    }

    /** Tous les outils, dans l'ordre de déclaration (l'interface les groupe par catégorie dans cet ordre). */
    public List<ConnectorDescriptor> all() {
        return new ArrayList<>(byKey.values());
    }

    public Optional<ConnectorDescriptor> byKey(String key) {
        return Optional.ofNullable(key == null ? null : byKey.get(key));
    }

    /** Préréglage de serveur MCP ? (faux pour une intégration native et pour une clé inconnue) */
    public boolean isMcpPreset(String key) {
        return byKey(key).map(d -> d.authType() == ConnectorAuthType.MCP).orElse(false);
    }

    // -------------------------------------------------------------------------

    private void nativeIntegration(String key, String name, ConnectorCategory cat, ConnectorAuthType auth,
                                   String description, String docsUrl, String setupHint,
                                   List<ConnectorField> fields, List<String> caps, String websiteUrl) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, auth, fields, caps, docsUrl, description, setupHint,
            websiteUrl, null));
    }

    /** Préréglage MCP : serveur hébergé officiel, connecté par OAuth en un clic, par jeton ou par en-tête. */
    private void mcp(String key, String name, ConnectorCategory cat, String description, String mcpUrl,
                     String websiteUrl) {
        byKey.put(key, new ConnectorDescriptor(key, name, cat, ConnectorAuthType.MCP, List.of(), List.of("mcp"),
            null, description, null, websiteUrl, mcpUrl));
    }
}
