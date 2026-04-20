"use client"

import { useState, useMemo } from "react"
import {
  Search,
  BookOpen,
  Layers,
  GitBranch,
  Shield,
  CreditCard,
  MessageCircle,
  Mail,
  ArrowRight,
  ChevronRight,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface HelpCategory {
  id: string
  labelKey: string
  descKey: string
  icon: React.ReactNode
  color: string
  articleCount: number
}

const CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    labelKey: "help.gettingStarted",
    descKey: "help.gettingStartedDesc",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    articleCount: 8,
  },
  {
    id: "projects",
    labelKey: "help.projects",
    descKey: "help.projectsDesc",
    icon: <Layers className="h-5 w-5" />,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    articleCount: 14,
  },
  {
    id: "integrations",
    labelKey: "help.integrations",
    descKey: "help.integrationsDesc",
    icon: <GitBranch className="h-5 w-5" />,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    articleCount: 6,
  },
  {
    id: "security",
    labelKey: "help.security",
    descKey: "help.securityDesc",
    icon: <Shield className="h-5 w-5" />,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    articleCount: 5,
  },
  {
    id: "billing",
    labelKey: "help.billing",
    descKey: "help.billingDesc",
    icon: <CreditCard className="h-5 w-5" />,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    articleCount: 4,
  },
]

interface Article {
  id: string
  title: string
  category: string
  views: number
}

const POPULAR_ARTICLES: Article[] = [
  { id: "a1", title: "How to create your first issue", category: "projects", views: 2400 },
  { id: "a2", title: "Setting up cycles and sprints", category: "projects", views: 1900 },
  { id: "a3", title: "Using the kanban board", category: "projects", views: 1750 },
  { id: "a4", title: "Inviting team members", category: "getting-started", views: 1500 },
  { id: "a5", title: "Configuring notifications", category: "getting-started", views: 980 },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryCard({ cat }: { readonly cat: HelpCategory }) {
  const { t } = useTranslation()
  return (
    <button className="group text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)] flex flex-col gap-3">
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center border shrink-0", cat.color)}>
        {cat.icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{t(cat.labelKey)}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t(cat.descKey)}</p>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto">
        <BookOpen className="h-3.5 w-3.5" />
        {cat.articleCount} articles
        <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HelpPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")

  const filteredArticles = useMemo(() => {
    if (!query.trim()) return POPULAR_ARTICLES
    const q = query.toLowerCase()
    return POPULAR_ARTICLES.filter((a) => a.title.toLowerCase().includes(q))
  }, [query])

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("help.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("help.subtitle")}</p>
        </div>

        {/* Search */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("help.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      {/* Categories */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("help.categories")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATEGORIES.map((cat) => (
            <CategoryCard key={cat.id} cat={cat} />
          ))}
        </div>
      </section>

      {/* Popular articles */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("help.popularArticles")}</h2>
        <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
          {filteredArticles.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No articles match your search.</div>
          ) : (
            filteredArticles.map((article, i) => (
              <button
                key={article.id}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors group",
                  i < filteredArticles.length - 1 && "border-b border-border/50"
                )}
              >
                <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm text-foreground group-hover:text-primary transition-colors">{article.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{article.views.toLocaleString()} views</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))
          )}
        </div>
      </section>

      {/* Contact support */}
      <section>
        <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)] flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{t("help.contactSupport")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("help.contactSupportDesc")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              {t("help.openChat")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {t("help.sendEmail")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
