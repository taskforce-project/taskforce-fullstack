"use client"

import { useState } from "react"
import { Bug, Lightbulb, MessageSquare, Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useFeedbackStore } from "@/lib/store/feedback-store"
import { submitFeedback, type FeedbackCategory } from "@/lib/api/feedback-service"

const CATEGORIES: { key: FeedbackCategory; label: string; icon: React.ReactNode }[] = [
  { key: "IDEA", label: "Idea", icon: <Lightbulb className="size-4" /> },
  { key: "BUG", label: "Bug", icon: <Bug className="size-4" /> },
  { key: "OTHER", label: "Other", icon: <MessageSquare className="size-4" /> },
]

/**
 * Formulaire de feedback global (catégorie + message). Ouvert depuis n'importe quel « Give feedback »
 * via le store. Monté une seule fois dans l'AppShell.
 */
export function FeedbackDialog() {
  const isOpen = useFeedbackStore((s) => s.isOpen)
  const context = useFeedbackStore((s) => s.context)
  const close = useFeedbackStore((s) => s.closeFeedback)

  const [category, setCategory] = useState<FeedbackCategory>("IDEA")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  async function onSubmit() {
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await submitFeedback({ category, message: text, context: context ?? undefined })
      toast.success("Thanks for your feedback! 🙌")
      setMessage("")
      setCategory("IDEA")
      close()
    } catch {
      toast.error("Couldn't send your feedback. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share feedback</DialogTitle>
          <DialogDescription>
            {context ? `About ${context} - ` : ""}tell us what&apos;s working, what&apos;s not, or what you&apos;d love to see.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Catégorie */}
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm transition-colors",
                  category === c.key
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* Message */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your feedback…"
            rows={5}
            maxLength={5000}
            autoFocus
            className="min-h-[120px] w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:border-foreground/20"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onSubmit} disabled={!message.trim() || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
