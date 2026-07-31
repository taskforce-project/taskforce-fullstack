import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logoSrc } from "../BrandLogo";
import { cn } from "@/lib/utils";

/**
 * IntegrationCatalogue — le VRAI pool de connecteurs, en zone cherchable.
 *
 * Source de vérité : `backend/.../core/service/integration/ConnectorCatalog.java` — un catalogue
 * DÉCLARATIF (ajouter un outil = une ligne). On le reproduit fidèlement ici : **129 connecteurs,
 * 16 catégories**, mêmes clés que la webapp (donc mêmes logos). Le compteur ne triche pas.
 *
 * HONNÊTETÉ (calée sur le LabBanner de l'app) : TOUT le catalogue est **connectable** aujourd'hui
 * (identifiants stockés chiffrés), mais la **synchronisation des données par outil** n'est pas
 * encore active partout. Les trois connecteurs éprouvés portent un marqueur : GitHub & Slack
 * (OAuth 1-clic) et Plane (sync → Brain OS). Le reste = connexion générique. Le détail de maturité
 * vit dans la section « How it works » de la page ; ici, c'est le pool.
 */

type Tool = { key: string; label: string; cat: string };

/** Les 16 catégories réelles (id ← enum `ConnectorCategory`), libellés lisibles. */
const CATS: { id: string; label: string }[] = [
  { id: "pm", label: "Project management" },
  { id: "dev", label: "Dev & CI/CD" },
  { id: "infra", label: "Hosting & infra" },
  { id: "db", label: "Databases" },
  { id: "ads", label: "Advertising" },
  { id: "analytics", label: "Analytics" },
  { id: "payments", label: "Payments" },
  { id: "crm", label: "CRM & sales" },
  { id: "comms", label: "Communication" },
  { id: "identity", label: "Identity & auth" },
  { id: "security", label: "Security & secrets" },
  { id: "productivity", label: "Productivity & docs" },
  { id: "design", label: "Design & media" },
  { id: "ecommerce", label: "E-commerce" },
  { id: "automation", label: "Automation" },
  { id: "ai", label: "AI models" },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.label]));

/** Les connecteurs éprouvés (sync/OAuth réels aujourd'hui) — cf. `ConnectorCatalog` (AVAILABLE + caps). */
const DEEP: Record<string, string> = {
  plane: "Brain OS sync",
  github: "1-click OAuth",
  slack: "1-click OAuth",
};

/**
 * Sélection stratégique montrée PAR DÉFAUT (review user) : ces noms racontent le produit bien mieux
 * que « 129 ». Le catalogue complet reste à un clic (« Show all »). L'ordre suit la narration.
 */
const FEATURED = [
  "linear", "jira", "github", "gitlab", "slack", "sentry", "postgresql",
  "notion", "google-drive", "figma", "openai", "anthropic", "ollama", "keycloak",
];

/** Transcription fidèle de `ConnectorCatalog.build()` — 129 entrées, ordre du catalogue. */
const TOOLS: Tool[] = [
  { key: "plane", label: "Plane", cat: "pm" },
  { key: "linear", label: "Linear", cat: "pm" },
  { key: "asana", label: "Asana", cat: "pm" },
  { key: "clickup", label: "ClickUp", cat: "pm" },
  { key: "jira", label: "Jira", cat: "pm" },
  { key: "trello", label: "Trello", cat: "pm" },
  { key: "monday", label: "monday.com", cat: "pm" },
  { key: "airtable", label: "Airtable", cat: "pm" },
  { key: "shortcut", label: "Shortcut", cat: "pm" },
  { key: "github", label: "GitHub", cat: "dev" },
  { key: "jenkins", label: "Jenkins", cat: "dev" },
  { key: "docker", label: "Docker", cat: "dev" },
  { key: "kubernetes", label: "Kubernetes", cat: "dev" },
  { key: "gitlab", label: "GitLab", cat: "dev" },
  { key: "bitbucket", label: "Bitbucket", cat: "dev" },
  { key: "postman", label: "Postman", cat: "dev" },
  { key: "insomnia", label: "Insomnia", cat: "dev" },
  { key: "vscode", label: "Visual Studio Code", cat: "dev" },
  { key: "cursor", label: "Cursor", cat: "dev" },
  { key: "sentry", label: "Sentry", cat: "dev" },
  { key: "datadog", label: "Datadog", cat: "dev" },
  { key: "grafana", label: "Grafana", cat: "dev" },
  { key: "sonarqube", label: "SonarQube", cat: "dev" },
  { key: "circleci", label: "CircleCI", cat: "dev" },
  { key: "terraform", label: "Terraform", cat: "dev" },
  { key: "vercel", label: "Vercel", cat: "infra" },
  { key: "render", label: "Render", cat: "infra" },
  { key: "cloudflare", label: "Cloudflare", cat: "infra" },
  { key: "aws", label: "Amazon Web Services", cat: "infra" },
  { key: "azure", label: "Microsoft Azure", cat: "infra" },
  { key: "gcp", label: "Google Cloud", cat: "infra" },
  { key: "netlify", label: "Netlify", cat: "infra" },
  { key: "railway", label: "Railway", cat: "infra" },
  { key: "fly", label: "Fly.io", cat: "infra" },
  { key: "digitalocean", label: "DigitalOcean", cat: "infra" },
  { key: "heroku", label: "Heroku", cat: "infra" },
  { key: "firebase", label: "Firebase", cat: "infra" },
  { key: "vps", label: "VPS", cat: "infra" },
  { key: "supabase", label: "Supabase", cat: "db" },
  { key: "neon", label: "Neon", cat: "db" },
  { key: "mongodb-atlas", label: "MongoDB Atlas", cat: "db" },
  { key: "redis-cloud", label: "Redis Cloud", cat: "db" },
  { key: "postgresql", label: "PostgreSQL", cat: "db" },
  { key: "planetscale", label: "PlanetScale", cat: "db" },
  { key: "prisma", label: "Prisma", cat: "db" },
  { key: "elasticsearch", label: "Elasticsearch", cat: "db" },
  { key: "snowflake", label: "Snowflake", cat: "db" },
  { key: "google-ads", label: "Google Ads", cat: "ads" },
  { key: "meta-ads", label: "Meta Ads", cat: "ads" },
  { key: "linkedin-ads", label: "LinkedIn Ads", cat: "ads" },
  { key: "google-analytics", label: "Google Analytics", cat: "analytics" },
  { key: "posthog", label: "PostHog", cat: "analytics" },
  { key: "microsoft-clarity", label: "Microsoft Clarity", cat: "analytics" },
  { key: "mixpanel", label: "Mixpanel", cat: "analytics" },
  { key: "amplitude", label: "Amplitude", cat: "analytics" },
  { key: "segment", label: "Segment", cat: "analytics" },
  { key: "plausible", label: "Plausible", cat: "analytics" },
  { key: "hotjar", label: "Hotjar", cat: "analytics" },
  { key: "stripe", label: "Stripe", cat: "payments" },
  { key: "paypal", label: "PayPal", cat: "payments" },
  { key: "paddle", label: "Paddle", cat: "payments" },
  { key: "lemonsqueezy", label: "Lemon Squeezy", cat: "payments" },
  { key: "wise", label: "Wise", cat: "payments" },
  { key: "hubspot", label: "HubSpot", cat: "crm" },
  { key: "salesforce", label: "Salesforce", cat: "crm" },
  { key: "zoho", label: "Zoho", cat: "crm" },
  { key: "intercom", label: "Intercom", cat: "crm" },
  { key: "pipedrive", label: "Pipedrive", cat: "crm" },
  { key: "zendesk", label: "Zendesk", cat: "crm" },
  { key: "freshworks", label: "Freshworks", cat: "crm" },
  { key: "attio", label: "Attio", cat: "crm" },
  { key: "slack", label: "Slack", cat: "comms" },
  { key: "twilio", label: "Twilio", cat: "comms" },
  { key: "resend", label: "Resend", cat: "comms" },
  { key: "mail-smtp", label: "Mail (SMTP)", cat: "comms" },
  { key: "discord", label: "Discord", cat: "comms" },
  { key: "microsoft-teams", label: "Microsoft Teams", cat: "comms" },
  { key: "zoom", label: "Zoom", cat: "comms" },
  { key: "telegram", label: "Telegram", cat: "comms" },
  { key: "whatsapp", label: "WhatsApp Business", cat: "comms" },
  { key: "sendgrid", label: "SendGrid", cat: "comms" },
  { key: "mailchimp", label: "Mailchimp", cat: "comms" },
  { key: "clerk", label: "Clerk", cat: "identity" },
  { key: "keycloak", label: "Keycloak", cat: "identity" },
  { key: "auth0", label: "Auth0", cat: "identity" },
  { key: "okta", label: "Okta", cat: "identity" },
  { key: "bitwarden", label: "Bitwarden", cat: "security" },
  { key: "1password", label: "1Password", cat: "security" },
  { key: "doppler", label: "Doppler", cat: "security" },
  { key: "snyk", label: "Snyk", cat: "security" },
  { key: "notion", label: "Notion", cat: "productivity" },
  { key: "google-workspace", label: "Google Workspace", cat: "productivity" },
  { key: "microsoft-365", label: "Microsoft 365", cat: "productivity" },
  { key: "granola", label: "Granola", cat: "productivity" },
  { key: "raycast", label: "Raycast", cat: "productivity" },
  { key: "gmail", label: "Gmail", cat: "productivity" },
  { key: "google-drive", label: "Google Drive", cat: "productivity" },
  { key: "google-calendar", label: "Google Calendar", cat: "productivity" },
  { key: "google-sheets", label: "Google Sheets", cat: "productivity" },
  { key: "google-meet", label: "Google Meet", cat: "productivity" },
  { key: "outlook", label: "Outlook", cat: "productivity" },
  { key: "onedrive", label: "OneDrive", cat: "productivity" },
  { key: "confluence", label: "Confluence", cat: "productivity" },
  { key: "dropbox", label: "Dropbox", cat: "productivity" },
  { key: "miro", label: "Miro", cat: "productivity" },
  { key: "loom", label: "Loom", cat: "productivity" },
  { key: "todoist", label: "Todoist", cat: "productivity" },
  { key: "obsidian", label: "Obsidian", cat: "productivity" },
  { key: "canva", label: "Canva", cat: "design" },
  { key: "figma", label: "Figma", cat: "design" },
  { key: "elevenlabs", label: "ElevenLabs", cat: "design" },
  { key: "framer", label: "Framer", cat: "design" },
  { key: "sketch", label: "Sketch", cat: "design" },
  { key: "adobe", label: "Adobe Creative Cloud", cat: "design" },
  { key: "shopify", label: "Shopify", cat: "ecommerce" },
  { key: "n8n", label: "n8n", cat: "automation" },
  { key: "zapier", label: "Zapier", cat: "automation" },
  { key: "make", label: "Make", cat: "automation" },
  { key: "pipedream", label: "Pipedream", cat: "automation" },
  { key: "groq", label: "Groq", cat: "ai" },
  { key: "openai", label: "OpenAI", cat: "ai" },
  { key: "anthropic", label: "Anthropic (Claude)", cat: "ai" },
  { key: "gemini", label: "Google Gemini", cat: "ai" },
  { key: "mistral", label: "Mistral AI", cat: "ai" },
  { key: "huggingface", label: "Hugging Face", cat: "ai" },
  { key: "ollama", label: "Ollama", cat: "ai" },
  { key: "perplexity", label: "Perplexity", cat: "ai" },
  { key: "cohere", label: "Cohere", cat: "ai" },
  { key: "replicate", label: "Replicate", cat: "ai" },
];

/** Initiales de repli quand un logo manque — jamais d'image cassée. */
function initials(label: string) {
  const words = label.replace(/[()]/g, "").trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).toUpperCase();
}

/** Logo d'un connecteur, avec repli initiales sur erreur de chargement. */
function ConnLogo({ toolKey, label }: { toolKey: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="bg-secondary text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold">
        {initials(label)}
      </span>
    );
  }
  return (
    <img
      src={logoSrc(toolKey)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-6 shrink-0 object-contain"
    />
  );
}

export function IntegrationCatalogue() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const needle = q.trim().toLowerCase();
  const filtering = needle !== "" || cat !== null;

  const filtered = useMemo(
    () =>
      TOOLS.filter(
        (t) =>
          (!cat || t.cat === cat) &&
          (!needle ||
            t.label.toLowerCase().includes(needle) ||
            CAT_LABEL[t.cat].toLowerCase().includes(needle)),
      ),
    [needle, cat],
  );

  /* Vue par défaut = la sélection stratégique ; on bascule sur le catalogue complet dès qu'on
     cherche/filtre, ou via « Show all ». Le « 129 » reste une preuve, pas le message principal. */
  const featuredMode = !filtering && !showAll;
  const shown = featuredMode
    ? (FEATURED.map((k) => TOOLS.find((t) => t.key === k)).filter(Boolean) as Tool[])
    : filtered;

  const reset = () => {
    setQ("");
    setCat(null);
    setShowAll(false);
  };

  return (
    <div>
      {/* Recherche + filtres */}
      <div className="flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for a tool — Linear, Sentry, Ollama…"
            aria-label="Search integrations"
            className="bg-card h-11 rounded-full pl-9 text-[14px]"
          />
        </div>

        <ul className="flex flex-wrap gap-1.5">
          <li>
            <button
              type="button"
              onClick={() => setCat(null)}
              aria-pressed={cat === null}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                cat === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground bg-card hover:text-foreground",
              )}
            >
              All
            </button>
          </li>
          {CATS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setCat(cat === c.id ? null : c.id)}
                aria-pressed={cat === c.id}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                  cat === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground bg-card hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Compteur — la vue « featured » par défaut, le « 129 » comme preuve de profondeur. */}
      <div
        className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]"
        role="status"
      >
        {featuredMode ? (
          <>
            <span className="text-foreground font-medium">Featured</span>
            <span aria-hidden className="text-border">·</span>
            <span className="font-mono tabular-nums">
              {TOOLS.length} connectors, {CATS.length} categories
            </span>
          </>
        ) : (
          <>
            <span className="font-mono tabular-nums">
              {shown.length} of {TOOLS.length}
            </span>
            <button
              type="button"
              onClick={reset}
              className="link-underline text-foreground inline-flex items-center gap-1"
            >
              <X className="size-3" />
              Clear
            </button>
          </>
        )}
      </div>

      {/* La grille — min-h pour que filtrer ne fasse pas sauter la section */}
      <div className="mt-4 min-h-[336px]">
        {shown.length > 0 ? (
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((t) => (
              <li key={t.key} className="bg-card flex items-center gap-3 px-4 py-3">
                <ConnLogo toolKey={t.key} label={t.label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {t.label}
                  </span>
                  <span className="text-muted-foreground block text-[11px]">{CAT_LABEL[t.cat]}</span>
                </span>
                {DEEP[t.key] && (
                  <span className="border-primary/30 text-primary hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline">
                    {DEEP[t.key]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-8">
            <p className="text-[14px] text-foreground">Nothing matches &laquo; {q} &raquo;.</p>
            <p className="text-muted-foreground text-[13px]">
              The catalogue is declarative — adding a tool is a line of configuration. Ask, and it lands
              in a release, not a quarter.
            </p>
            <Button asChild variant="outline" size="pill-sm">
              <a href="/book-a-demo">Request an integration</a>
            </Button>
          </div>
        )}
      </div>

      {shown.length > 0 && (
        <div className="mt-6 flex justify-center">
          {featuredMode ? (
            <Button variant="outline" size="pill-sm" onClick={() => setShowAll(true)}>
              Show all {TOOLS.length} connectors
            </Button>
          ) : !filtering && showAll ? (
            <Button variant="ghost" size="pill-sm" onClick={() => setShowAll(false)}>
              Show featured only
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
