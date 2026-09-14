import { useMemo, useState } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logoSrc } from "../BrandLogo";
import { cn } from "@/lib/utils";
import { CONNECTORS, type Connector } from "@/lib/connectors-data";

/**
 * IntegrationCatalogue - le VRAI pool de connecteurs, tel qu'il existe dans l'app.
 *
 * Source de vérité : `backend/.../ConnectorCatalog.java`, transcrit dans `lib/connectors-data.ts`
 * (généré depuis l'endpoint catalogue). On ne survend RIEN (décision CEO) :
 *   - chaque connecteur JOIGNABLE montre COMMENT il se connecte (badge : MCP / OAuth / API key /
 *     Token / Config) + sa description ; les 3 natifs (Plane, GitHub, Slack) portent leur profondeur
 *     réelle (Memory / Actions) et une fiche cliquable.
 *   - un connecteur SANS moyen de connexion aujourd'hui (les libs UI recommandées) s'affiche
 *     nom + logo SEULS, sans badge ni description - on le liste, on ne prétend pas le brancher.
 */

interface CatDef { id: string; label: string }

/** Les 17 catégories réelles (id ← enum `ConnectorCategory`), libellés lisibles. */
const CATS: CatDef[] = [
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
  { id: "ui", label: "UI components" },
];
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.label]));

/** Libellé du MOYEN de connexion (le badge « comment c'est connectable »). */
const AUTH_LABEL: Record<Connector["auth"], string> = {
  oauth: "OAuth",
  apikey: "API key",
  token: "Token",
  config: "Config",
  none: "",
};

/** A une fiche détaillée (`/product/integrations/{key}`) : les 3 natifs (riches) + les MCP-ready (générées). */
const hasFiche = (c: Connector) => c.native != null || c.mcp;

/** Le badge de connexion : MCP en tête (1 clic, utilisable par l'agent), sinon le type d'auth. */
function connBadge(c: Connector): string {
  return c.mcp ? "MCP" : AUTH_LABEL[c.auth];
}

const totalConnectors = CONNECTORS.length;
const nativeCount = CONNECTORS.filter((c) => c.native).length;
const mcpCount = CONNECTORS.filter((c) => c.mcp).length;

/** Vue par défaut : ce qui MARCHE réellement - les natifs d'abord, puis les MCP-ready. */
const WORKING = CONNECTORS.filter((c) => c.native || c.mcp).sort(
  (a, b) => (a.native ? 0 : 1) - (b.native ? 0 : 1),
);

/** Initiales de repli quand un logo manque - jamais d'image cassée. */
function initials(label: string) {
  const words = label.replace(/[()]/g, "").trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).toUpperCase();
}

/** Logo d'un connecteur, avec repli initiales sur erreur de chargement. */
function ConnLogo({ connKey, label }: { connKey: string; label: string }) {
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
      src={logoSrc(connKey)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-6 shrink-0 object-contain"
    />
  );
}

/**
 * Une tuile de connecteur.
 * - JOIGNABLE : logo + nom + profondeur native éventuelle (Memory/Actions) + description + badge de
 *   connexion (MCP / OAuth / API key…) ; cliquable vers la fiche pour les 3 éprouvés.
 * - NON JOIGNABLE : logo + nom SEULS (aucune promesse).
 */
function Tile({ c }: { c: Connector }) {
  if (!c.reachable) {
    return (
      <li className="bg-card flex items-center gap-3 border px-4 py-3">
        <ConnLogo connKey={c.key} label={c.name} />
        <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
      </li>
    );
  }

  const badge = connBadge(c);
  const hasDetail = hasFiche(c);
  const inner = (
    <div className="flex h-full flex-col px-4 py-3">
      <div className="flex items-start gap-3">
        <ConnLogo connKey={c.key} label={c.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
            {c.native && (
              <span className="border-primary/30 text-primary shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium">
                {c.native}
              </span>
            )}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[11.5px] leading-[1.35]">{c.desc}</span>
        </span>
        {hasDetail && <ChevronRight className="text-muted-foreground/40 mt-0.5 size-4 shrink-0" />}
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-9">
        <span
          className={cn(
            "rounded-full border px-1.5 py-px text-[10px] font-medium",
            c.mcp
              ? "border-primary/40 text-primary bg-primary/5"
              : "text-muted-foreground/80 border-border",
          )}
        >
          {badge}
        </span>
        <span className="text-muted-foreground/60 text-[10.5px]">{CAT_LABEL[c.cat]}</span>
      </div>
    </div>
  );

  return (
    <li className="bg-card border">
      {hasDetail ? (
        <a
          href={`/product/integrations/${c.key}`}
          className="hover:bg-secondary/50 block h-full transition-colors"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </li>
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
      CONNECTORS.filter(
        (c) =>
          (!cat || c.cat === cat) &&
          (!needle ||
            c.name.toLowerCase().includes(needle) ||
            c.desc.toLowerCase().includes(needle) ||
            CAT_LABEL[c.cat].toLowerCase().includes(needle)),
      ),
    [needle, cat],
  );

  // Par défaut on montre CE QUI MARCHE (natifs + MCP-ready) ; le catalogue complet est à un clic
  // (« Show all ») ou via la recherche / les filtres - toutes les intégrations restent accessibles.
  const workingMode = !filtering && !showAll;
  const shown = workingMode ? WORKING : filtered;

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
            placeholder="Search for a tool - Linear, Sentry, Notion…"
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

      {/* Compteur honnête : ce qui marche vs le catalogue complet. */}
      <div
        className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]"
        role="status"
      >
        {workingMode ? (
          <>
            <span className="text-foreground font-medium">Working today</span>
            <span aria-hidden className="text-border">·</span>
            <span className="font-mono tabular-nums">
              {nativeCount} native + {mcpCount} MCP-ready
            </span>
          </>
        ) : (
          <>
            <span className="font-mono tabular-nums">
              {shown.length} of {totalConnectors}
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

      {/* Légende honnête : les tiers réels, et ce que dit le badge. */}
      <p className="text-muted-foreground mt-3 text-[12px] leading-6">
        <span className="text-foreground font-medium">Native</span> integrations (Plane, GitHub,
        Slack) run today.{" "}
        <span className="text-foreground font-medium">MCP-ready</span> ones connect in a click and
        your agents can use them. The rest of the catalogue is connectable now, with deeper sync
        rolling out. The badge on each tile shows how it connects.
      </p>

      {/* La grille - min-h pour que filtrer ne fasse pas sauter la section */}
      <div className="mt-5 min-h-[336px]">
        {shown.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <Tile key={c.key} c={c} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 border border-dashed p-8">
            <p className="text-[14px] text-foreground">Nothing matches &laquo; {q} &raquo;.</p>
            <p className="text-muted-foreground text-[13px]">
              The catalogue is declarative - adding a tool is a line of configuration. Ask, and it lands
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
          {workingMode ? (
            <Button variant="outline" size="pill-sm" onClick={() => setShowAll(true)}>
              Show all {totalConnectors} connectors
            </Button>
          ) : !filtering && showAll ? (
            <Button variant="ghost" size="pill-sm" onClick={() => setShowAll(false)}>
              Show what works today
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
