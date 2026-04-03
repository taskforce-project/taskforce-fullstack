"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import {
  FileText,
  Plus,
  ArrowUpRight,
  Search,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface ProjectPage {
  id: string
  title: string
  excerpt: string
  lastEditedBy: string
  lastEditedByInitials: string
  lastEditedByColor: string
  lastEditedAt: string
}

const PAGES: ProjectPage[] = [
  {
    id: "1",
    title: "Architecture Decision Records — Auth Service",
    excerpt: "Documents the rationale behind choosing Keycloak as our identity provider, covering OAuth2 flows, token management, and security considerations...",
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    lastEditedAt: "2 hours ago",
  },
  {
    id: "2",
    title: "API Design Guidelines",
    excerpt: "REST conventions, naming standards, versioning strategy, error response format, and pagination patterns for the Taskforce API v2...",
    lastEditedBy: "Thomas Bernard",
    lastEditedByInitials: "TB",
    lastEditedByColor: "bg-orange-500",
    lastEditedAt: "Yesterday",
  },
  {
    id: "3",
    title: "Sprint 4 — Team Retrospective Notes",
    excerpt: "Key outcomes: improved PR review process, introduced daily 15-min standup, split large issues into smaller tasks before sprint planning...",
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    lastEditedAt: "3 days ago",
  },
  {
    id: "4",
    title: "Onboarding Guide for New Contributors",
    excerpt: "Step-by-step setup instructions: clone repo, configure .env, run docker-compose, first PR checklist, code style guide, and team contacts...",
    lastEditedBy: "Sophie Martin",
    lastEditedByInitials: "SM",
    lastEditedByColor: "bg-violet-500",
    lastEditedAt: "Last week",
  },
  {
    id: "5",
    title: "Rate Limiting Strategy",
    excerpt: "Comparison of fixed window, sliding window, and token bucket algorithms. Final decision: sliding window with Redis for distributed environments...",
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    lastEditedAt: "Last week",
  },
]

export default function ProjectPagesPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search pages..." className="pl-8 h-8 text-sm" />
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New Page
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PAGES.map((page) => (
          <Link
            key={page.id}
            href={`/projects/${projectId}/pages/${page.id}`}
            className="group flex flex-col rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all [box-shadow:var(--shadow-sm)] hover:[box-shadow:var(--shadow-md)]"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <h3 className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                  {page.title}
                </h3>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
            </div>

            <p className="text-xs text-muted-foreground line-clamp-2 flex-1 mb-3">{page.excerpt}</p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Avatar className="h-5 w-5">
                <AvatarFallback className={cn("text-[9px] text-white", page.lastEditedByColor)}>
                  {page.lastEditedByInitials}
                </AvatarFallback>
              </Avatar>
              <span>{page.lastEditedBy}</span>
              <span>·</span>
              <span>{page.lastEditedAt}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
