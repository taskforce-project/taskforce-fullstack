"use client"

import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/lightweight-markdown"

/**
 * Bulle de message générique (user / assistant / system). Le contenu string est rendu en
 * markdown ; sinon, children libres (pour composer Tool/Reasoning/Steps/Sources).
 */
export type MessageRole = "user" | "assistant" | "system"

export interface MessageProps {
  role: MessageRole
  content?: string
  children?: React.ReactNode
  className?: string
}

export function Message({ role, content, children, className }: MessageProps) {
  if (role === "system") {
    return (
      <div className={cn("my-2 text-center text-xs text-muted-foreground", className)}>
        {content ?? children}
      </div>
    )
  }
  const isUser = role === "user"
  return (
    <div className={cn("mb-3 flex gap-2", isUser ? "justify-end" : "", className)}>
      {!isUser && (
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="size-3 text-primary" />
        </div>
      )}
      <div className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        isUser ? "rounded-br-sm bg-foreground text-background" : "rounded-tl-sm border bg-card text-foreground",
      )}>
        {content != null ? <Markdown content={content} /> : children}
      </div>
    </div>
  )
}
