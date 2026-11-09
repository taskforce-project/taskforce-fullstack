"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronRight, CircleDot, FolderKanban, Paperclip, Plug, Plus } from "lucide-react"

import { optionDomId, PickList } from "@/components/agent/pick-list"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MAX_ATTACHMENTS, nextIndex, type PickOption } from "@/lib/cortex/composer-picker"
import { useConnectorLines } from "@/lib/hooks/use-connector-lines"
import { usePickOptions } from "@/lib/hooks/use-pick-options"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { cn } from "@/lib/utils"

const ROW = "h-8"

/**
 * Le « + » du compositeur, comme celui qu'on connaît ailleurs (R134, séance n°20 ; son test : « le + je m'atend plus a un
 * menu style claude ») : un menu de 260 px, des lignes de 32 px. Add files ouvre le choix des fichiers ; Issue et Project
 * ouvrent une recherche, au clavier d'abord, et le choix devient une pastille ; Connectors montre ceux qui sont connectés et
 * ouvre leur vue. Rien ici ne se règle par conversation : ce qui n'existe pas ne se montre pas (R15).
 */
export function AttachMenu({ slug, onDone, onFiles }: Readonly<{
  slug: string
  /** Après un choix ou la fermeture : le compositeur reprend le focus. */
  onDone?: () => void
  onFiles: (files: readonly File[]) => void
}>) {
  const texts = usePreferencesStore((s) => s.t.composer)
  const attachments = useCortexStore((s) => s.attachments)
  const attach = useCortexStore((s) => s.attach)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const [menuOpen, setMenuOpen] = useState(false)
  const [finding, setFinding] = useState<"issues" | "projects" | null>(null)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const lines = useConnectorLines(slug, menuOpen)
  const { options: found, searching } = usePickOptions(slug, finding ? "attach" : null, query)
  const options = found.filter((option) => option.group === finding)
  const full = attachments.length >= MAX_ATTACHMENTS
  const current = options[Math.min(active, options.length - 1)]

  const close = () => {
    setFinding(null)
    setQuery("")
    setActive(0)
    onDone?.()
  }

  const pick = (option: PickOption) => {
    if (option.attach) attach(option.attach)
    close()
  }

  useEffect(() => {
    if (!finding) return
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setFinding(null)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [finding])

  const findTitle = finding === "projects" ? texts.findProject : texts.findIssue

  return (
    <div ref={boxRef} className="relative shrink-0">
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          aria-label={texts.add}
          title={texts.add}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted motion-reduce:transition-none"
        >
          <Plus className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-[260px] max-w-[calc(100vw-2rem)]"
          // La recherche prend le curseur quand elle s'ouvre ; sinon, le champ le reprend.
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!finding) onDone?.()
          }}
        >
          <DropdownMenuItem className={ROW} onSelect={() => fileRef.current?.click()}>
            <Paperclip aria-hidden="true" />
            <span>{texts.addFiles}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={ROW} disabled={full} title={full ? texts.attachedFull : undefined} onSelect={() => setFinding("issues")}>
            <CircleDot aria-hidden="true" />
            <span>{texts.issue}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={ROW} disabled={full} title={full ? texts.attachedFull : undefined} onSelect={() => setFinding("projects")}>
            <FolderKanban aria-hidden="true" />
            <span>{texts.project}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={ROW}>
              <Plug aria-hidden="true" />
              <span>{texts.connectors}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-80 w-[260px] max-w-[calc(100vw-2rem)] overflow-y-auto">
                {lines.length === 0 && (
                  <DropdownMenuItem className={cn(ROW, "text-muted-foreground")} onSelect={() => openSettings("integrations")}>
                    <span className="min-w-0 flex-1 truncate">{texts.noConnectors}</span>
                  </DropdownMenuItem>
                )}
                {lines.map((line) => (
                  <DropdownMenuItem key={line.key} className={ROW} onSelect={() => openSettings("integrations")}>
                    <span className="min-w-0 flex-1 truncate">{line.name}</span>
                    {line.reconnect && <span className="shrink-0 text-xs text-ink-yellow">{texts.reconnect}</span>}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className={ROW} onSelect={() => openSettings("integrations")}>
                  <span className="min-w-0 flex-1 truncate">{texts.manageConnectors}</span>
                  <ChevronRight aria-hidden="true" />
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ""
          onDone?.()
        }}
      />
      {finding && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-80 max-w-[calc(100vw-2rem)]">
          <PickList
            id={listId}
            options={options}
            active={active}
            searching={searching}
            onPick={pick}
            onActive={setActive}
            className="mb-1"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                setActive((i) => Math.max(0, nextIndex(i, e.key === "ArrowDown" ? 1 : -1, options.length)))
              } else if (e.key === "Enter" || e.key === "Tab") {
                if (!current) return
                e.preventDefault()
                pick(current)
              } else if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
            placeholder={findTitle}
            aria-label={findTitle}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionDomId(listId, current) : undefined}
            className={cn(
              "h-9 w-full rounded-lg border border-border bg-popover px-2.5 text-sm outline-none",
              "placeholder:text-muted-foreground/60 focus-visible:border-primary",
            )}
          />
        </div>
      )}
    </div>
  )
}
