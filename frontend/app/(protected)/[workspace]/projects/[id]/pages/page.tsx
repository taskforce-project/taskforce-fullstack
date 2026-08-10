"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Plus,
  ArrowUpRight,
  Search,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CreatePageDialog } from "@/components/dialogs/create-page-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { usePageStore } from "@/lib/store/page-store"
import { cn } from "@/lib/utils"

export default function ProjectPagesPage() {
  const params  = useParams()
  const router  = useRouter()
  const slug      = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id        === "string" ? params.id        : ""

  const { pages, loading, fetchPages, createPage, deletePage } = usePageStore()
  const [search, setSearch] = useState("")
  const [pageToDelete, setPageToDelete] = useState<(typeof pages)[number] | null>(null)

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
                <div className="flex items-center gap-1 shrink-0">
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                        aria-label="Actions de la page"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setPageToDelete(page)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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

      <AlertDialog open={pageToDelete !== null} onOpenChange={(open) => { if (!open) setPageToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la page ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {pageToDelete?.title} » sera définitivement supprimée. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pageToDelete) return
                try {
                  await deletePage(slug, projectId, String(pageToDelete.id))
                } catch {
                  // le store gère l'état d'erreur
                }
                setPageToDelete(null)
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
