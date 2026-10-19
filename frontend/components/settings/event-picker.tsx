"use client"

import { cn } from "@/lib/utils"
import { WEBHOOK_EVENTS } from "@/lib/api/integration-service"

/**
 * Puces des événements d'un workspace (webhooks sortants, canaux Slack) : aucune sélection = tous les événements.
 */
export function EventPicker({ value, onChange }: Readonly<{ value: string[]; onChange: (next: string[]) => void }>) {
  function toggle(event: string) {
    onChange(value.includes(event) ? value.filter((e) => e !== event) : [...value, event])
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {WEBHOOK_EVENTS.map((event) => (
        <button
          key={event}
          type="button"
          onClick={() => toggle(event)}
          aria-pressed={value.includes(event)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
            value.includes(event)
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/30",
          )}
        >
          {event}
        </button>
      ))}
      <span className="text-[11px] text-muted-foreground">{value.length === 0 ? "All events" : ""}</span>
    </div>
  )
}
