"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Plus,
  ArrowUpRight,
  Search,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CreatePageDialog } from "@/components/dialogs/create-page-dialog"
import { usePageStore } from "@/lib/store/page-store"
import { cn } from "@/lib/utils"

export default function ProjectPagesPage() {
  const params  = useParams()
  const router  = useRouter()
  const slug      = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id        === "string" ? params.id        : ""

  const { pages, loading, fetchPages, createPage } = usePageStore()
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (slug && projectId) fetchPages(slug, projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, projectId])

  const filtered = pages.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  async function handlePageCreated(payload: { title: string; emoji: string }) {
    try {
      const created = await createPage(slug, projectId, {
        title: payload.title,
        emoji: payload.emoji,
      })
      router.push(`/${slug}/projects/${projectId}/pages/${created.id}`)
    } catch {
      // erreur silencieuse — le store gère le state
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search pages..."
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CreatePageDialog onCreated={handlePageCreated}>
          <Button size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New Page
          </Button>
        </CreatePageDialog>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading pages…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">No pages yet.</div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((page) => (
            <Link
              key={page.id}
              href={`/${slug}/projects/${projectId}/pages/${page.id}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{page.emoji}</span>
                  <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                    {page.title}
                  </h3>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2 flex-1 mb-3">{page.excerpt}</p>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className={cn("text-[9px] text-white bg-primary")}>
                    {page.createdByInitials}
                  </AvatarFallback>
                </Avatar>
                <span>{page.createdByName}</span>
                <span>·</span>
                <span>
                  {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
