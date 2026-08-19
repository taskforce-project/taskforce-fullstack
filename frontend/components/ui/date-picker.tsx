"use client"

import { useState } from "react"
import { format, parseISO, isValid } from "date-fns"
import { enUS } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Sélecteur de date shadcn (Calendar dans un Popover).
 * `value` / `onChange` en chaîne ISO `yyyy-MM-dd` (compatible LocalDate backend) ; "" = aucune.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Choose a date",
  id,
  className,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly id?: string
  readonly className?: string
}) {
  const [open, setOpen] = useState(false)
  const parsed = value ? parseISO(value) : undefined
  const selected = parsed && isValid(parsed) ? parsed : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0" />
          {selected ? format(selected, "d MMM yyyy", { locale: enUS }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "")
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
