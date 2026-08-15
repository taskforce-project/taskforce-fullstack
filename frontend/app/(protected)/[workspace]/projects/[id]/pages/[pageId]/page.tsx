"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Save, FileText } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { TipTapEditor } from "@/components/editor/tiptap-editor"
import { usePageStore } from "@/lib/store/page-store"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"

export default function ProjectPageDetailPage() {
  const params    = useParams()
  const slug      = typeof params.workspace === "string" ? params.workspace : ""
  const projectId = typeof params.id        === "string" ? params.id        : ""
  const pageId    = typeof params.pageId    === "string" ? params.pageId    : ""

  const { currentPage, loading, fetchPage, updatePage, clearCurrentPage } = usePageStore()
  const [content, setContent] = useState<string>("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (slug && projectId && pageId) fetchPage(slug, projectId, pageId)
    return () => clearCurrentPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, projectId, pageId])

  useEffect(() => {
    if (currentPage) setContent(currentPage.content ?? "")
  }, [currentPage])

  async function handleSave() {
    if (!currentPage) return
    setSaving(true)
    try {
      await updatePage(slug, projectId, pageId, { content })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (!currentPage) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileText /></EmptyMedia>
          <EmptyTitle>Page introuvable</EmptyTitle>
          <EmptyDescription>Cette page n&apos;existe pas ou a été supprimée.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={`/${slug}/projects/${projectId}/pages`}>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour aux pages
            </Button>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/${slug}/projects/${projectId}/pages`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-xl">{currentPage.emoji}</span>
          <h1 className="font-semibold text-foreground truncate">{currentPage.title}</h1>
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5 shrink-0"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Avatar className="h-5 w-5">
          <AvatarFallback className={cn("text-[9px] text-white bg-primary")}>
            {currentPage.createdByInitials}
          </AvatarFallback>
        </Avatar>
        <span>{currentPage.createdByName}</span>
        <span>·</span>
        <span>
          {formatDistanceToNow(new Date(currentPage.updatedAt), { addSuffix: true })}
        </span>
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <TipTapEditor
          content={content}
          onChange={setContent}
        />
      </div>
    </div>
  )
}
