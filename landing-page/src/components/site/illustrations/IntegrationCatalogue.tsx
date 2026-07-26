import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "../BrandLogo";
import { cn } from "@/lib/utils";

/**
 * IntegrationCatalogue — le bloc « Integrations », en vraie zone utilisable.
 *
 * Une grille de cartes ne se lit pas : personne ne parcourt 40 tuiles. On donne donc
 * ce que la personne cherche vraiment — « est-ce que MON outil est là ? » — avec une
 * recherche et des filtres par catégorie. Les clés et les logos viennent du même
 * catalogue de connecteurs que la webapp.
 */

type Tool = { key: string; label: string; cat: Cat };
type Cat =
  | "Code"
  | "Tracking"
  | "Comms"
  | "Docs"
  | "Design"
  | "Infra"
  | "Data"
  | "Observability"
  | "Models"
  | "Identity";

const TOOLS: Tool[] = [
  { key: "github", label: "GitHub", cat: "Code" },
  { key: "gitlab", label: "GitLab", cat: "Code" },
  { key: "vscode", label: "VS Code", cat: "Code" },
  { key: "postman", label: "Postman", cat: "Code" },
  { key: "terraform", label: "Terraform", cat: "Code" },
  { key: "linear", label: "Linear", cat: "Tracking" },
  { key: "asana", label: "Asana", cat: "Tracking" },
  { key: "clickup", label: "ClickUp", cat: "Tracking" },
  { key: "trello", label: "Trello", cat: "Tracking" },
  { key: "slack", label: "Slack", cat: "Comms" },
  { key: "discord", label: "Discord", cat: "Comms" },
  { key: "microsoft-teams", label: "Microsoft Teams", cat: "Comms" },
  { key: "zoom", label: "Zoom", cat: "Comms" },
  { key: "gmail", label: "Gmail", cat: "Comms" },
  { key: "outlook", label: "Outlook", cat: "Comms" },
  { key: "notion", label: "Notion", cat: "Docs" },
  { key: "obsidian", label: "Obsidian", cat: "Docs" },
  { key: "google-drive", label: "Google Drive", cat: "Docs" },
  { key: "dropbox", label: "Dropbox", cat: "Docs" },
  { key: "google-sheets", label: "Google Sheets", cat: "Docs" },
  { key: "figma", label: "Figma", cat: "Design" },
  { key: "framer", label: "Framer", cat: "Design" },
  { key: "sketch", label: "Sketch", cat: "Design" },
  { key: "canva", label: "Canva", cat: "Design" },
  { key: "loom", label: "Loom", cat: "Design" },
  { key: "docker", label: "Docker", cat: "Infra" },
  { key: "kubernetes", label: "Kubernetes", cat: "Infra" },
  { key: "vercel", label: "Vercel", cat: "Infra" },
  { key: "netlify", label: "Netlify", cat: "Infra" },
  { key: "railway", label: "Railway", cat: "Infra" },
  { key: "render", label: "Render", cat: "Infra" },
  { key: "cloudflare", label: "Cloudflare", cat: "Infra" },
  { key: "aws", label: "AWS", cat: "Infra" },
  { key: "azure", label: "Azure", cat: "Infra" },
  { key: "gcp", label: "Google Cloud", cat: "Infra" },
  { key: "postgresql", label: "PostgreSQL", cat: "Data" },
  { key: "supabase", label: "Supabase", cat: "Data" },
  { key: "neon", label: "Neon", cat: "Data" },
  { key: "planetscale", label: "PlanetScale", cat: "Data" },
  { key: "prisma", label: "Prisma", cat: "Data" },
  { key: "mongodb-atlas", label: "MongoDB Atlas", cat: "Data" },
  { key: "sentry", label: "Sentry", cat: "Observability" },
  { key: "datadog", label: "Datadog", cat: "Observability" },
  { key: "grafana", label: "Grafana", cat: "Observability" },
  { key: "posthog", label: "PostHog", cat: "Observability" },
  { key: "plausible", label: "Plausible", cat: "Observability" },
  { key: "anthropic", label: "Anthropic", cat: "Models" },
  { key: "openai", label: "OpenAI", cat: "Models" },
  { key: "gemini", label: "Gemini", cat: "Models" },
  { key: "mistral", label: "Mistral", cat: "Models" },
  { key: "ollama", label: "Ollama", cat: "Models" },
  { key: "huggingface", label: "Hugging Face", cat: "Models" },
  { key: "groq", label: "Groq", cat: "Models" },
  { key: "keycloak", label: "Keycloak", cat: "Identity" },
  { key: "auth0", label: "Auth0", cat: "Identity" },
  { key: "clerk", label: "Clerk", cat: "Identity" },
  { key: "1password", label: "1Password", cat: "Identity" },
  { key: "bitwarden", label: "Bitwarden", cat: "Identity" },
];

const CATS: Cat[] = [
  "Code",
  "Tracking",
  "Comms",
  "Docs",
  "Design",
  "Infra",
  "Data",
  "Observability",
  "Models",
  "Identity",
];

export function IntegrationCatalogue() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Cat | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TOOLS.filter(
      (t) =>
        (!cat || t.cat === cat) &&
        (!needle || t.label.toLowerCase().includes(needle) || t.cat.toLowerCase().includes(needle)),
    );
  }, [q, cat]);

  const reset = () => {
    setQ("");
    setCat(null);
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
            <li key={c}>
              <button
                type="button"
                onClick={() => setCat(cat === c ? null : c)}
                aria-pressed={cat === c}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                  cat === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground bg-card hover:text-foreground",
                )}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Compteur */}
      <p className="text-muted-foreground mt-6 flex items-center gap-3 text-[12.5px]" role="status">
        <span className="font-mono tabular-nums">
          {shown.length} of {TOOLS.length}
        </span>
        {(q || cat) && (
          <button
            type="button"
            onClick={reset}
            className="link-underline text-foreground inline-flex items-center gap-1"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </p>

      {/* La grille — min-h pour que filtrer ne fasse pas sauter la section */}
      <div className="mt-4 min-h-[336px]">
        {shown.length > 0 ? (
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((t) => (
              <li key={t.key} className="bg-card flex items-center gap-3 px-4 py-3">
                <BrandLogo brand={t.key} label="" className="size-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {t.label}
                  </span>
                  <span className="text-muted-foreground block text-[11px]">{t.cat}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-8">
            <p className="text-[14px] text-foreground">
              Nothing matches &laquo; {q} &raquo;.
            </p>
            <p className="text-muted-foreground text-[13px]">
              The catalogue is declarative — adding a tool is a line of configuration, so ask and it
              lands in the next release rather than the next quarter.
            </p>
            <Button asChild variant="outline" size="pill-sm">
              <a href="/company/contact">Request an integration</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
