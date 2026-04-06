"use client"

import { useEffect, useRef, useState } from "react"
import { AtSign, Bold, Code2, Italic, Paperclip, Send, Smile } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface MessageInputProps {
  readonly channelName: string
  readonly onSend: (text: string) => void
}

export function MessageInput({ channelName, onSend }: MessageInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  function send() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue("")
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const FORMAT_ACTIONS = [
    { icon: Bold,   label: "Bold"   },
    { icon: Italic, label: "Italic" },
    { icon: Code2,  label: "Code"   },
  ]

  return (
    <div className="shrink-0 px-6 pb-5 pt-2">
      <div className="rounded-xl border border-border bg-background shadow-sm overflow-hidden">
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-3 pt-2 pb-1.5 border-b border-border/50">
          {FORMAT_ACTIONS.map(({ icon: Icon, label }) => (
            <Button
              key={label}
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title={label}
              onClick={() => toast.info(`${label} (soon)`)}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
          <Separator orientation="vertical" className="mx-1.5 h-4" />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Mention"
            onClick={() => toast.info("Mentions (soon)")}
          >
            <AtSign className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={`Message #${channelName}`}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none leading-relaxed min-h-11"
        />

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Attach file"
              onClick={() => toast.info("File attachments (soon)")}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Emoji"
              onClick={() => toast.info("Emoji picker (soon)")}
            >
              <Smile className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/50 hidden sm:block">
              Enter to send · Shift+Enter for new line
            </span>
            <Button
              size="sm"
              className={cn("h-7 text-xs px-3 transition-opacity gap-1.5", !value.trim() && "opacity-40")}
              disabled={!value.trim()}
              onClick={send}
            >
              <Send className="h-3 w-3" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
