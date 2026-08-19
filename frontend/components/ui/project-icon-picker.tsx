"use client"

import { useRef, useState } from "react"
import {
  FolderKanban, Code2, Globe, Rocket, Star, Zap, Database, Shield,
  Monitor, Smartphone, Layout, BarChart2, Settings, Terminal, Package,
  Layers, Cloud, Cpu, Lock, Bell, BookOpen, Briefcase, Camera, Coffee,
  Compass, CreditCard, FileText, Flag, Heart, Home, Lightbulb, Map,
  Music, Palette, PenTool, Search, Target, Truck, Users, Wand2,
  Building2, ChartBar, FlaskConical, Gamepad2, Headphones,
  Mail, Megaphone, ShoppingCart, Video, Wifi, Wrench,
  Upload, X,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ProjectIcon } from "@/components/ui/project-icon"

// ---------------------------------------------------------------------------
// Curated icon set
// ---------------------------------------------------------------------------

const CURATED_ICONS: { name: string; Icon: React.ElementType }[] = [
  { name: "FolderKanban", Icon: FolderKanban },
  { name: "Code2", Icon: Code2 },
  { name: "Globe", Icon: Globe },
  { name: "Rocket", Icon: Rocket },
  { name: "Star", Icon: Star },
  { name: "Zap", Icon: Zap },
  { name: "Database", Icon: Database },
  { name: "Shield", Icon: Shield },
  { name: "Monitor", Icon: Monitor },
  { name: "Smartphone", Icon: Smartphone },
  { name: "Layout", Icon: Layout },
  { name: "BarChart2", Icon: BarChart2 },
  { name: "Settings", Icon: Settings },
  { name: "Terminal", Icon: Terminal },
  { name: "Package", Icon: Package },
  { name: "Layers", Icon: Layers },
  { name: "Cloud", Icon: Cloud },
  { name: "Cpu", Icon: Cpu },
  { name: "Lock", Icon: Lock },
  { name: "Bell", Icon: Bell },
  { name: "BookOpen", Icon: BookOpen },
  { name: "Briefcase", Icon: Briefcase },
  { name: "Camera", Icon: Camera },
  { name: "Coffee", Icon: Coffee },
  { name: "Compass", Icon: Compass },
  { name: "CreditCard", Icon: CreditCard },
  { name: "FileText", Icon: FileText },
  { name: "Flag", Icon: Flag },
  { name: "Heart", Icon: Heart },
  { name: "Home", Icon: Home },
  { name: "Lightbulb", Icon: Lightbulb },
  { name: "Map", Icon: Map },
  { name: "Music", Icon: Music },
  { name: "Palette", Icon: Palette },
  { name: "PenTool", Icon: PenTool },
  { name: "Search", Icon: Search },
  { name: "Target", Icon: Target },
  { name: "Truck", Icon: Truck },
  { name: "Users", Icon: Users },
  { name: "Wand2", Icon: Wand2 },
  { name: "Building2", Icon: Building2 },
  { name: "ChartBar", Icon: ChartBar },
  { name: "FlaskConical", Icon: FlaskConical },
  { name: "Gamepad2", Icon: Gamepad2 },
  { name: "Headphones", Icon: Headphones },
  { name: "Mail", Icon: Mail },
  { name: "Megaphone", Icon: Megaphone },
  { name: "ShoppingCart", Icon: ShoppingCart },
  { name: "Video", Icon: Video },
  { name: "Wifi", Icon: Wifi },
  { name: "Wrench", Icon: Wrench },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectIconPickerProps {
  readonly value?: string | null
  readonly onChange: (iconUrl: string | null) => void
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "icons" | "upload"

// ---------------------------------------------------------------------------
// ProjectIconPicker
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_MB = 2

export function ProjectIconPicker({ value, onChange }: Readonly<ProjectIconPickerProps>) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("icons")
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleIconSelect(iconName: string) {
    onChange(`lucide:${iconName}`)
    setOpen(false)
  }

  function handleReset(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setUploadError("Only image files are accepted.")
      return
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setUploadError(`Image must be smaller than ${MAX_FILE_SIZE_MB}MB.`)
      return
    }
    setUploadError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result === "string") {
        onChange(result)
        setOpen(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Icon</span>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative group rounded-xl border-2 border-dashed border-border bg-muted",
              "hover:border-primary/60 hover:bg-muted/70 transition-all cursor-pointer",
              "flex flex-col items-center justify-center gap-1 w-20 h-16 shrink-0",
              open && "border-primary/60"
            )}
            title="Choose icon or upload image"
          >
            <ProjectIcon iconUrl={value} size={28} className="rounded-md border-0 bg-transparent" />
            <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
              {value ? "Change" : "Choose"}
            </span>
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        className="w-72 p-0"
        align="start"
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-border">
          <div className="flex gap-1">
            {(["icons", "upload"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors capitalize",
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {t === "icons" ? "Icons" : "Upload"}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <X className="size-3" />
              Reset
            </button>
          )}
        </div>

        {/* Icons tab */}
        {tab === "icons" && (
          <div className="p-2 grid grid-cols-9 gap-0.5 max-h-48 overflow-y-auto">
            {CURATED_ICONS.map(({ name, Icon }) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => handleIconSelect(name)}
                className={cn(
                  "flex items-center justify-center rounded-md p-1.5 hover:bg-accent transition-colors",
                  value === `lucide:${name}` && "bg-primary/15 ring-1 ring-primary/40"
                )}
              >
                <Icon className="size-4 text-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Upload tab */}
        {tab === "upload" && (
          <div className="p-3 flex flex-col gap-3">
            {value && (value.startsWith("data:") || value.startsWith("http")) && (
              <div className="flex justify-center">
                <ProjectIcon iconUrl={value} size={52} className="rounded-xl" />
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
            >
              <Upload className="size-5" />
              <span>Click to upload image</span>
              <span className="text-xs">PNG, JPG, SVG — max {MAX_FILE_SIZE_MB}MB</span>
            </button>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
