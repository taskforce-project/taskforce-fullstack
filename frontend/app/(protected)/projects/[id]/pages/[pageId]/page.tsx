"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  FileText,
  Bold,
  Italic,
  List,
  Heading2,
  Code,
  Save,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface ProjectPage {
  id: string
  title: string
  content: string
  lastEditedBy: string
  lastEditedByInitials: string
  lastEditedByColor: string
  lastEditedAt: string
}

const PAGES: Record<string, ProjectPage> = {
  "1": {
    id: "1",
    title: "Architecture Decision Records — Auth Service",
    content: `# Architecture Decision Records — Auth Service

## Context

This document captures the rationale behind choosing Keycloak as our identity provider for Taskforce.

## Decision

We chose **Keycloak** as our identity provider, implementing OAuth2 Authorization Code Flow with PKCE for the frontend and JWT validation on the Spring Boot backend.

### Key considerations

- **Open source** with active community support
- **Standards compliant** — OAuth2, OIDC, SAML 2.0
- **Extensible** — custom mappers, event listeners, SPIs
- **Self-hosted** — full data control, no vendor lock-in

## Token strategy

- Access tokens: 15-minute TTL
- Refresh tokens: 8-hour TTL with sliding expiration
- All tokens stored in memory (never localStorage) to mitigate XSS

## Consequences

- Increased operational complexity (separate Keycloak service to maintain)
- Faster auth implementation (no custom auth code to write)
- Future-proof: SSO/SAML can be added without changing app code`,
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    lastEditedAt: "2 hours ago",
  },
  "2": {
    id: "2",
    title: "API Design Guidelines",
    content: `# API Design Guidelines

## REST Conventions

All endpoints follow REST principles with consistent naming, versioning, and error handling.

### URL Structure

\`\`\`
GET    /api/v1/projects          — list
POST   /api/v1/projects          — create
GET    /api/v1/projects/:id      — get one
PUT    /api/v1/projects/:id      — replace
PATCH  /api/v1/projects/:id      — partial update
DELETE /api/v1/projects/:id      — delete
\`\`\`

### Error format

\`\`\`json
{
  "error": "VALIDATION_ERROR",
  "message": "Title is required",
  "details": { "field": "title" },
  "timestamp": "2025-04-05T12:00:00Z"
}
\`\`\`

## Pagination

All list endpoints support cursor-based pagination:

- \`?cursor=<opaque_token>\`
- \`?limit=20\` (default: 20, max: 100)`,
    lastEditedBy: "Thomas Bernard",
    lastEditedByInitials: "TB",
    lastEditedByColor: "bg-orange-500",
    lastEditedAt: "Yesterday",
  },
  "3": {
    id: "3",
    title: "Sprint 4 — Team Retrospective Notes",
    content: `# Sprint 4 — Team Retrospective Notes

**Date**: March 22, 2025  
**Facilitator**: Sophie Martin

## What went well ✅

- Completed all critical mobile fixes before deadline
- PR review turnaround improved to < 4 hours
- Daily standups kept focused and under 15 min

## What could improve 🔧

- Some issues were too large for a single sprint
- Need better definition of "done" criteria
- Test coverage dropped below 70% on new components

## Action items

| Action | Owner | Due |
|--------|-------|-----|
| Split epics before sprint planning | SM | Apr 7 |
| Add DoD checklist to PR template | ME | Apr 7 |
| Set up coverage gate in CI | LD | Apr 14 |`,
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    lastEditedAt: "3 days ago",
  },
  "4": {
    id: "4",
    title: "Onboarding Guide for New Contributors",
    content: `# Onboarding Guide for New Contributors

## Prerequisites

- Docker Desktop ≥ 4.x
- Node.js 22 LTS
- Java 21 (Eclipse Temurin recommended)
- Git

## Setup

\`\`\`bash
# 1. Clone the repo
git clone git@github.com:taskforce/taskforce-fullstack.git
cd taskforce-fullstack

# 2. Copy env files
cp .env.dev.example .env.dev

# 3. Start all services
./dev-docker.ps1
\`\`\`

## First PR checklist

- [ ] Branch follows naming convention (\`feature/\`, \`fix/\`, \`hotfix/\`)
- [ ] Commits follow conventional commits format
- [ ] Tests pass locally (\`npm test\` + \`mvn test\`)
- [ ] ESLint clean (\`npm run lint\`)
- [ ] PR description explains the why, not just the what`,
    lastEditedBy: "Sophie Martin",
    lastEditedByInitials: "SM",
    lastEditedByColor: "bg-violet-500",
    lastEditedAt: "Last week",
  },
  "5": {
    id: "5",
    title: "Rate Limiting Strategy",
    content: `# Rate Limiting Strategy

## Algorithms evaluated

| Algorithm | Pros | Cons |
|-----------|------|------|
| Fixed window | Simple | Burst at window boundary |
| Sliding window | Smooth distribution | More complex |
| Token bucket | Handles burst naturally | State management |

## Decision: Sliding Window with Redis

We chose the **sliding window** algorithm backed by Redis for its accuracy and distributed support.

### Implementation

\`\`\`java
@RateLimiter(name = "api", fallbackMethod = "rateLimitFallback")
public ResponseEntity<ApiResponse<T>> endpoint(...) { ... }
\`\`\`

### Limits

| Tier | Requests/min | Burst |
|------|-------------|-------|
| Free | 60 | 10 |
| Pro | 600 | 100 |
| Enterprise | Unlimited | — |`,
    lastEditedBy: "You",
    lastEditedByInitials: "ME",
    lastEditedByColor: "bg-primary",
    lastEditedAt: "Last week",
  },
}

function renderMarkdown(content: string): string {
  return content
    .replaceAll(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2 text-foreground">$1</h3>')
    .replaceAll(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-6 mb-2 text-foreground">$1</h2>')
    .replaceAll(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-0 mb-3 text-foreground">$1</h1>')
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>')
    .replaceAll(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-primary text-xs font-mono">$1</code>')
    .replaceAll(/```\w*\n([\s\S]*?)```/g, '<pre class="my-3 rounded-lg bg-muted p-4 overflow-x-auto"><code class="text-xs font-mono text-foreground/80 whitespace-pre">$1</code></pre>')
    .replaceAll(/^\| (.+) \|$/gm, (row) => {
      const cols = row.split("|").filter(Boolean).map((c) => `<td class="px-3 py-1.5 text-sm border-b border-border/50">${c.trim()}</td>`)
      return `<tr>${cols.join("")}</tr>`
    })
    .replaceAll(/(<tr>.*<\/tr>\n?)+/g, (table) => `<div class="my-3 overflow-x-auto"><table class="w-full border border-border rounded-lg overflow-hidden">${table}</table></div>`)
    .replaceAll(/^- \[ \] (.+)$/gm, '<div class="flex items-center gap-2 py-0.5"><input type="checkbox" disabled class="rounded" /><span class="text-sm text-muted-foreground">$1</span></div>')
    .replaceAll(/^- (.+)$/gm, '<li class="text-sm text-foreground/80 ml-4 list-disc py-0.5">$1</li>')
    .replaceAll(/^\*\*(.+?)\*\*(.*)$/gm, '<p class="text-sm py-0.5"><strong class="font-medium text-foreground">$1</strong>$2</p>')
    .replaceAll(/^(?!<[hplsdcti])(.+)$/gm, '<p class="text-sm text-foreground/80 leading-relaxed py-0.5">$1</p>')
    .replaceAll(/^---$/gm, '<hr class="my-4 border-border" />')
}

export default function PageDetailPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"
  const pageId    = typeof params.pageId === "string" ? params.pageId : "1"

  const page = PAGES[pageId]
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(page?.content ?? "")
  const [isSaved, setIsSaved] = useState(false)

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <p className="text-sm">Page introuvable</p>
        <Link href={`/projects/${projectId}/pages`}>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to pages
          </Button>
        </Link>
      </div>
    )
  }

  function handleSave() {
    setIsEditing(false)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Back nav */}
      <Link
        href={`/projects/${projectId}/pages`}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All pages
      </Link>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <h1 className="font-semibold text-foreground truncate">{page.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setContent(page.content); setIsEditing(false) }}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave}>
                <Save className="h-3.5 w-3.5" />
                {isSaved ? "Saved!" : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Avatar className="h-6 w-6">
          <AvatarFallback className={cn("text-[9px] text-white", page.lastEditedByColor)}>
            {page.lastEditedByInitials}
          </AvatarFallback>
        </Avatar>
        <span>Last edited by <span className="text-foreground font-medium">{page.lastEditedBy}</span> · {page.lastEditedAt}</span>
      </div>

      {/* Editor / Viewer */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
        {isEditing && (
          <div className="flex items-center gap-1 border-b border-border px-3 py-2 bg-muted/20">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Bold"><Bold className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Italic"><Italic className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Heading"><Heading2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Bullet list"><List className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Code"><Code className="h-3.5 w-3.5" /></Button>
          </div>
        )}

        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-125 p-6 text-sm font-mono text-foreground bg-transparent resize-none outline-none leading-relaxed"
            placeholder="Start writing in Markdown…"
            autoFocus
          />
        ) : (
          <div
            className="p-6 min-h-75 prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </div>
    </div>
  )
}
