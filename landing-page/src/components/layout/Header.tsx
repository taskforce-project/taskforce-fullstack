import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, X, CheckSquare2, BookOpen, Sparkles, BarChart3, Plug,
  Users, Zap, FileText, Rss, ArrowUpRight, Shield, Settings,
  TrendingUp, Rocket, Layers, ArrowRight, ChevronDown,
  MessageSquare, PenTool, Workflow, Server, History,
  GraduationCap, PlayCircle, MessageCircle, Tag,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Iphone } from "@/components/ui/iphone";
import { MockMobile } from "@/components/sections/FeatureCards";
import { Component as EtheralShadow } from "@/components/ui/etheral-shadow";
import { Button } from "@/components/ui/button";
import { StripedPattern } from "@/components/magicui/striped-pattern";

const IPHONE_SCREEN = {
  left: `${(21.25 / 433) * 100}%`,
  top: `${(19.25 / 882) * 100}%`,
  width: `${(389.5 / 433) * 100}%`,
  height: `${(843.5 / 882) * 100}%`,
  borderRadius: `${(55.75 / 389.5) * 100}% / ${(55.75 / 843.5) * 100}%`,
};

/* --- Types -------------------------------------------- */

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  desc: string;
  color: string;
  badge?: string;
}

interface NavLinkItem extends NavItem {
  href: string;
  external?: boolean;
}

function GitHubMark(props: Readonly<{ className?: string; style?: React.CSSProperties }>) {
  const { className, style } = props;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={style} fill="currentColor">
      <path d="M12 2C6.477 2 2 6.59 2 12.253c0 4.53 2.865 8.37 6.839 9.727.5.094.682-.222.682-.495 0-.244-.009-.89-.014-1.747-2.782.617-3.37-1.37-3.37-1.37-.455-1.184-1.11-1.5-1.11-1.5-.908-.637.069-.625.069-.625 1.004.072 1.532 1.054 1.532 1.054.892 1.565 2.341 1.113 2.91.851.092-.664.35-1.113.636-1.369-2.22-.259-4.555-1.14-4.555-5.075 0-1.121.39-2.037 1.029-2.754-.103-.259-.446-1.302.098-2.714 0 0 .84-.276 2.75 1.052A9.32 9.32 0 0 1 12 6.86c.85.004 1.705.117 2.504.343 1.909-1.328 2.748-1.052 2.748-1.052.546 1.412.203 2.455.1 2.714.64.717 1.027 1.633 1.027 2.754 0 3.945-2.339 4.812-4.566 5.066.359.318.678.947.678 1.91 0 1.379-.012 2.492-.012 2.83 0 .276.18.594.688.493A10.26 10.26 0 0 0 22 12.253C22 6.59 17.523 2 12 2Z" />
    </svg>
  );
}

/* --- Data --------------------------------------------- */

const productCore: NavItem[] = [
  { id: "smart-assign", icon: Sparkles,     label: "Smart Assign",         desc: "AI routing by skills, load & growth", color: "#fb923c", badge: "AI" },
  { id: "projects",     icon: CheckSquare2, label: "Projects & Issues",    desc: "Board, list, backlog, cycles",        color: "#60a5fa" },
  { id: "assistant",    icon: MessageSquare,label: "AI Insights & Assistant", desc: "Reports, risk detection, Q&A",     color: "#c084fc", badge: "AI" },
];

const productFeatures: NavItem[] = [
  { id: "analytics",    icon: BarChart3,  label: "Analytics & Insights", desc: "Velocity, burndown, AI insights",  color: "#4ade80" },
  { id: "time",         icon: History,    label: "Time tracking",        desc: "Worklogs par issue & membre",       color: "#60a5fa" },
  { id: "teams",        icon: Users,      label: "Teams & RBAC",         desc: "Équipes, rôles, accès fin",         color: "#c084fc" },
  { id: "integrations", icon: Plug,       label: "Integrations",         desc: "Wrapper GitHub & plus",             color: "#94a3b8" },
  { id: "security",     icon: Shield,     label: "Security & RGPD",      desc: "Audit logs, chiffrement, RGPD",     color: "#fb923c" },
];

const solutionsUsecases: NavItem[] = [
  { id: "engineering", icon: Zap,      label: "Engineering",  desc: "Sprints, PRs, deployments",    color: "#60a5fa" },
  { id: "design",      icon: Layers,   label: "Design",       desc: "Figma links, design reviews",  color: "#c084fc" },
  { id: "marketing",   icon: Rss,      label: "Marketing",    desc: "Campaigns, OKRs, roadmaps",    color: "#fb923c" },
  { id: "operations",  icon: Settings, label: "Operations",   desc: "Coordinate work across teams", color: "#4ade80" },
];

const solutionsSize: NavItem[] = [
  { id: "startups",   icon: Rocket,     label: "Startups",      desc: "Start fast, add structure",   color: "#fb923c" },
  { id: "growing",    icon: TrendingUp, label: "Growing Teams", desc: "Scale without the overhead",  color: "#60a5fa" },
  { id: "enterprise", icon: Shield,     label: "Enterprise",    desc: "SSO, RBAC, BYOK, air-gap",    color: "#c084fc" },
];

const resourcesItems: NavLinkItem[] = [
  // -- Discover (0-3) --
  { id: "changelog", icon: FileText,      label: "Changelog",     desc: "What is new in Taskforce",        href: "/changelog",                            external: false, color: "#60a5fa" },
  { id: "blog",      icon: Rss,           label: "Blog",          desc: "Engineering and product updates",  href: "/blog",                                 external: false, color: "#c084fc" },
  { id: "docs",      icon: BookOpen,      label: "Docs",          desc: "Guides and API reference",         href: "/docs",                                 external: false, color: "#fb923c" },
  { id: "github",    icon: GitHubMark,    label: "GitHub",        desc: "Star us, contribute",               href: "https://github.com/taskforce-project",  external: true,  color: "#94a3b8" },
  // -- Learn (4-8) --
  { id: "quickstart",icon: Rocket,        label: "Quick start",   desc: "Up and running in 5 minutes",      href: "/docs/quickstart",                      external: false, color: "#f97316" },
  { id: "tutorials", icon: PlayCircle,    label: "Tutorials",     desc: "Step-by-step video walkthroughs",  href: "/tutorials",                            external: false, color: "#a78bfa" },
  { id: "apiref",    icon: GraduationCap, label: "API reference",  desc: "REST & webhooks full reference",   href: "/docs/api",                             external: false, color: "#34d399" },
  { id: "community", icon: MessageCircle, label: "Community",     desc: "Forum, Discord & office hours",    href: "https://community.taskforce.dev",       external: true,  color: "#38bdf8" },
  { id: "releases",  icon: Tag,           label: "Release notes", desc: "Detailed per-version changelogs",  href: "/changelog",                            external: false, color: "#fb7185" },
];

/* Integration logos for Product sidebar � lucide-react icons */
const integrations: { name: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }[] = [
  { name: "GitHub",  icon: GitHubMark,    color: "#94a3b8" },
  { name: "Slack",   icon: MessageSquare, color: "#e01e5a" },
  { name: "Figma",   icon: PenTool,       color: "#f24e1e" },
  { name: "Linear",  icon: Workflow, color: "#5e6ad2" },
  { name: "Notion",  icon: BookOpen, color: "#737373" },
  { name: "PostHog", icon: BarChart3,color: "#f54e00" },
];

/* --- Sub-components ----------------------------------- */

interface DropdownItemProps {
  readonly icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  readonly label: string;
  readonly desc: string;
  readonly color?: string;
  readonly href: string;
  readonly external?: boolean;
  readonly badge?: string;
  readonly onClick?: () => void;
}

function DropdownItem({ icon: Icon, label, desc, color, href, external = false, badge, onClick }: DropdownItemProps) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors duration-100 group"
      onClick={onClick}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={color ? { background: `${color}18`, border: `1px solid ${color}30` } : { background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.2)" }}
      >
        <Icon className="h-4 w-4" style={color ? { color } : undefined} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-none mb-1 flex items-center gap-1.5 text-foreground">
          {label}
          {badge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary leading-none">
              {badge}
            </span>
          )}
          {external && <ArrowUpRight className="h-3 w-3 opacity-40" />}
        </p>
        <p className="text-muted-foreground text-xs leading-snug">{desc}</p>
      </div>
    </a>
  );
}

function ColHeader({ label }: { readonly label: string }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-2 px-3">
      {label}
    </p>
  );
}

/* --- Header ------------------------------------------- */

type MenuId = "product" | "solutions" | "resources";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuId | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  /* Close on click outside or Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveMenu(null); };
    const onPointer = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setActiveMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  /* Close on mouse leave header */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const onLeave = () => setActiveMenu(null);
    el.addEventListener("mouseleave", onLeave);
    return () => el.removeEventListener("mouseleave", onLeave);
  }, []);

  const menuIdx: Record<MenuId, number> = { product: 0, solutions: 1, resources: 2 };
  const toggle = useCallback((id: MenuId) => setActiveMenu((cur) => (cur === id ? null : id)), []);

  const triggerCls = (id: MenuId) =>
    cn(
      "inline-flex items-center gap-1 px-3.5 py-2 text-sm rounded-lg transition-colors duration-150 cursor-pointer",
      activeMenu === id
        ? "text-foreground bg-foreground/5"
        : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
    );

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-50 flex flex-col bg-white border-b border-black/10"
    >


      {/* div.relative = positioning context for full-width mega-menu panels */}
      <div className="relative w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <a href="/" className="flex items-center gap-3 shrink-0">
              <img src="/logo_taskforce_tp.png" alt="Taskforce" className="h-16 w-auto" />
              <span className="text-black font-semibold text-lg tracking-tight">Taskforce</span>
            </a>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-0.5">
              <button type="button" className={triggerCls("product")} onMouseEnter={() => setActiveMenu("product")} onClick={() => toggle("product")} aria-expanded={activeMenu === "product"}>
                Product <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", activeMenu === "product" && "rotate-180")} />
              </button>
              <button type="button" className={triggerCls("solutions")} onMouseEnter={() => setActiveMenu("solutions")} onClick={() => toggle("solutions")} aria-expanded={activeMenu === "solutions"}>
                Solutions <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", activeMenu === "solutions" && "rotate-180")} />
              </button>
              <button type="button" className={triggerCls("resources")} onMouseEnter={() => setActiveMenu("resources")} onClick={() => toggle("resources")} aria-expanded={activeMenu === "resources"}>
                Resources <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", activeMenu === "resources" && "rotate-180")} />
              </button>
              <a href="/pricing" className="px-3.5 py-2 text-sm text-foreground/60 hover:text-foreground rounded-lg transition-colors duration-150 hover:bg-foreground/5 inline-flex items-center">
                Pricing
              </a>
              <a href="/self-host" className="px-3.5 py-2 text-sm text-foreground/60 hover:text-foreground rounded-lg transition-colors duration-150 hover:bg-foreground/5 inline-flex items-center">
                Self-host
              </a>
            </nav>

            {/* CTA desktop */}
            <div className="hidden lg:flex items-center gap-1.5">
              <a href="https://github.com/taskforce-project" target="_blank" rel="noopener noreferrer" className="p-2 text-foreground/40 hover:text-foreground/70 transition-colors rounded-lg hover:bg-foreground/5" aria-label="GitHub">
                <GitHubMark className="h-4 w-4" />
              </a>

              <div className="w-px h-5 bg-foreground/10 mx-1" />
              <a href="http://localhost:3000/auth/login" className="px-3.5 py-1.5 text-sm text-foreground/60 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/5">
                Sign in
              </a>
              <a href="http://localhost:3000/auth/register" className="px-4 py-1.5 text-sm font-medium text-white bg-foreground rounded-lg hover:bg-foreground/90 transition-colors">
                Get started
              </a>
            </div>

            {/* Mobile toggle */}
            <button className="lg:hidden p-2 text-foreground/60 hover:text-foreground transition-colors" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

          </div>
        </div>

        {/* -- Overlay sombre derri�re le menu ----------- */}
        {activeMenu !== null && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 top-14 z-40 bg-black/30 animate-in fade-in duration-150"
            onMouseEnter={() => setActiveMenu(null)}
          />
        )}

        {/* -- Full-width mega-menu --------------------------- */}
        {activeMenu !== null && (
          <div className="absolute top-full left-0 w-full z-50 overflow-hidden border-b border-black/10 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.06)] animate-in fade-in duration-150">

            {/* Sliding panels � fixed height = height of tallest panel (Product) */}
            <div className="relative overflow-hidden" style={{ height: 420 }}>
              {(["product", "solutions", "resources"] as MenuId[]).map((id) => {
                const offset = menuIdx[id] - menuIdx[activeMenu];
                return (
                  <div
                    key={id}
                    className="absolute inset-0"
                    style={{
                      transform: `translateX(${offset * 100}%)`,
                      transition: "transform 280ms cubic-bezier(0.4,0,0.2,1)",
                      willChange: "transform",
                    }}
                  >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 h-full">

                      {id === "product" && (
                        <div className="grid grid-cols-[1fr_1fr_272px] gap-8">
                          <div>
                            <ColHeader label="Products" />
                            <div className="space-y-0.5">
                              {productCore.map((item) => (
                                <DropdownItem key={item.id} icon={item.icon} label={item.label} desc={item.desc} color={item.color} href={`#${item.id}`} badge={item.badge} onClick={() => setActiveMenu(null)} />
                              ))}
                            </div>
                          </div>
                          <div>
                            <ColHeader label="Feature capabilities" />
                            <div className="space-y-0.5">
                              {productFeatures.map((item) => (
                                <DropdownItem key={item.id} icon={item.icon} label={item.label} desc={item.desc} color={item.color} href={`#${item.id}`} onClick={() => setActiveMenu(null)} />
                              ))}
                            </div>
                          </div>
                          {/* Sidebar: 2 cards like Plane */}
                          <div className="flex flex-col gap-3">
                            {/* Card 1 - Self-host */}
                            <a href="/self-host" onClick={() => setActiveMenu(null)} className="rounded-xl p-4 flex flex-col gap-2 transition-colors duration-100 group relative overflow-hidden bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.35)]">
                              <div className="absolute inset-0 pointer-events-none opacity-90" aria-hidden="true">
                                <EtheralShadow
                                  color="rgba(15, 23, 42, 0.92)"
                                  animation={{ scale: 0, speed: 0 }}
                                  noise={{ opacity: 0.13, scale: 0.82 }}
                                />
                              </div>
                              <div className="absolute inset-0 bg-linear-to-br from-sky-500/28 via-blue-500/12 to-indigo-500/26 pointer-events-none" aria-hidden="true" />
                              <div className="relative w-8 h-8 rounded-lg bg-foreground/6 border border-border/50 flex items-center justify-center">
                                <Server className="h-4 w-4 text-white/80" />
                              </div>
                              <div className="relative">
                                <p className="text-sm font-semibold text-white">Self-host Taskforce</p>
                                <p className="text-xs text-white/70 mt-0.5 leading-snug">Everything on cloud, deployed on your infrastructure.</p>
                              </div>
                            </a>
                            {/* Card 2 � Works with your stack */}
                            <div className="rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden bg-slate-100/95 text-slate-950 shadow-[0_16px_34px_rgba(15,23,42,0.2)]">
                              <div className="absolute inset-0 pointer-events-none opacity-95" aria-hidden="true">
                                <EtheralShadow
                                  color="rgba(100, 116, 139, 0.7)"
                                  animation={{ scale: 0, speed: 0 }}
                                  noise={{ opacity: .1, scale: 0.76 }}
                                />
                              </div>
                              <div className="absolute inset-0 bg-linear-to-br from-slate-300/68 via-slate-200/26 to-slate-50/78 pointer-events-none" aria-hidden="true" />
                              <p className="relative text-xs font-semibold text-slate-950">Works with your stack</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[("Slack" as const), ("GitHub" as const), ("Sentry" as const), ("GitLab" as const)].map((name) => {
                                  const { icon: Icon, color } = integrations.find(i => i.name === name) ?? { icon: integrations[0].icon, color: "" };
                                  return (
                                    <Button
                                      key={name}
                                      asChild
                                      variant="default"
                                      size="sm"
                                      className="h-8 justify-start gap-1.5 rounded-lg bg-slate-900 px-2 text-[11px] font-medium text-white shadow-[0_8px_16px_rgba(15,23,42,0.28)] hover:bg-slate-800"
                                    >
                                      <a href={`/integrations/${name.toLowerCase()}`} onClick={() => setActiveMenu(null)}>
                                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                                        {name}
                                        <ArrowUpRight className="ml-auto h-3 w-3 opacity-70" />
                                      </a>
                                    </Button>
                                  );
                                })}
                              </div>
                              <a href="/integrations" className="relative inline-flex items-center gap-1 text-xs font-medium text-slate-900 hover:text-slate-950 transition-colors duration-100" onClick={() => setActiveMenu(null)}>
                                Browse marketplace <ArrowRight className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {id === "solutions" && (
                        <div className="grid grid-cols-[1fr_1fr_272px] gap-8">
                          <div>
                            <ColHeader label="Use cases" />
                            <div className="space-y-0.5">
                              {solutionsUsecases.map((item) => (
                                <DropdownItem key={item.id} icon={item.icon} label={item.label} desc={item.desc} color={item.color} href={`#${item.id}`} onClick={() => setActiveMenu(null)} />
                              ))}
                            </div>
                          </div>
                          <div>
                            <ColHeader label="Company size" />
                            <div className="space-y-0.5">
                              {solutionsSize.map((item) => (
                                <DropdownItem key={item.id} icon={item.icon} label={item.label} desc={item.desc} color={item.color} href={`#${item.id}`} onClick={() => setActiveMenu(null)} />
                              ))}
                            </div>
                          </div>
                          <div className="rounded-xl relative overflow-hidden p-4 flex flex-col bg-slate-950 text-white shadow-[0_16px_34px_rgba(2,6,23,0.38)]">
                            <div className="absolute inset-0 pointer-events-none opacity-95" aria-hidden="true">
                              <EtheralShadow
                                color="rgba(249, 115, 22, 0.9)"
                                animation={{ scale: 0, speed: 0 }}
                                noise={{ opacity: 0.08, scale: 0.64 }}
                              />
                            </div>
                            <div className="absolute inset-0 bg-linear-to-br from-orange-500/30 via-red-500/15 to-violet-500/20 pointer-events-none" aria-hidden="true" />
                            <div className="relative flex flex-col h-full">
                              <p className="text-sm font-semibold text-white mb-1.5">Why teams switch</p>
                              <p className="text-xs text-white/72 mb-3 leading-relaxed">See how Taskforce compares to tools you already know.</p>
                              <div className="space-y-0.5 mt-auto">
                                {["Linear", "Jira", "Asana", "Monday"].map((name) => (
                                  <a key={name} href={`/compare/${name.toLowerCase()}`} className="flex items-center justify-between text-xs text-white/75 hover:text-white transition-colors py-1.5 px-2 rounded-md hover:bg-white/10 group" onClick={() => setActiveMenu(null)}>
                                    <span>vs {name}</span>
                                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {id === "resources" && (
                        <div className="grid grid-cols-[1fr_1fr_200px_200px] gap-6">
                          {/* Col 1 � Discover */}
                          <div>
                            <ColHeader label="Discover" />
                            <div className="space-y-0.5">
                              {resourcesItems.slice(0, 4).map((item) => (
                                <DropdownItem key={item.id} icon={item.icon} label={item.label} desc={item.desc} color={item.color} href={item.href} external={item.external} onClick={() => setActiveMenu(null)} />
                              ))}
                            </div>
                          </div>
                          {/* Col 2 � Learn */}
                          <div>
                            <ColHeader label="Learn" />
                            <div className="space-y-0.5">
                              {resourcesItems.slice(4).map((item) => (
                                <DropdownItem key={item.id} icon={item.icon} label={item.label} desc={item.desc} color={item.color} href={item.href} external={item.external} onClick={() => setActiveMenu(null)} />
                              ))}
                            </div>
                          </div>
                          {/* Card 1 � Latest update */}
                          <div className="rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden bg-zinc-950 text-white shadow-[0_14px_30px_rgba(2,6,23,0.32)]">
                            <div className="absolute inset-0 pointer-events-none opacity-95" aria-hidden="true">
                              <EtheralShadow
                                color="rgba(139, 92, 246, 0.92)"
                                animation={{ scale: 0, speed: 0 }}
                                noise={{ opacity: 0.08, scale: 0.72 }}
                              />
                            </div>
                            <div className="absolute inset-0 bg-linear-to-br from-violet-600/25 via-fuchsia-500/10 to-sky-500/15 pointer-events-none" aria-hidden="true" />
                            <div className="w-8 h-8 rounded-lg bg-foreground/6 border border-border/50 flex items-center justify-center">
                              <History className="h-4 w-4 text-white/80" />
                            </div>
                            <div className="flex-1" />
                            <div>
                              <p className="text-[10px] font-semibold text-violet-200 mb-1">Self-hosted</p>
                              <a href="/changelog" onClick={() => setActiveMenu(null)} className="text-xs font-semibold text-white hover:underline leading-snug block">
                                Improved intake &amp; workspace validation fixes | Release v1.0.1
                              </a>
                              <p className="text-[10px] text-white/65 mt-1">{new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}</p>
                            </div>
                          </div>
                          {/* Card 2 � Download */}
                          <div className="rounded-xl p-4 flex flex-col gap-2 overflow-hidden relative bg-slate-50 text-slate-900 shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
                            <div className="absolute inset-0 pointer-events-none opacity-95" aria-hidden="true">
                              <EtheralShadow
                                color="rgba(99, 102, 241, 0.5)"
                                animation={{ scale: 0, speed: 0 }}
                                noise={{ opacity: 0.06, scale: 0.72 }}
                              />
                            </div>
                            <div className="absolute inset-0 bg-linear-to-br from-slate-200/70 via-indigo-100/35 to-violet-100/45 pointer-events-none" aria-hidden="true" />
                            <div className="relative flex-1 flex items-center justify-center">
                              <div className="w-20 shrink-0">
                                <div className="relative w-full" style={{ aspectRatio: "433/882" }}>
                                  <div className="absolute overflow-hidden" style={{ ...IPHONE_SCREEN }}>
                                    <MockMobile />
                                  </div>
                                  <Iphone className="absolute inset-0 w-full h-full z-10" style={{ aspectRatio: undefined }} />
                                </div>
                              </div>
                            </div>
                            <div className="relative">
                              <p className="text-xs font-semibold text-foreground">Taskforce on every device</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Download for Mac, Windows, iOS, and Android</p>
                              <a href="/download" onClick={() => setActiveMenu(null)} className="inline-flex items-center gap-1 text-[10px] font-medium text-primary mt-1.5 hover:underline">
                                Download <ArrowRight className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom CTA bar � like Plane.so */}
            <div className="relative overflow-hidden border-t border-black/10">
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <StripedPattern className="text-zinc-400/45 opacity-65" direction="left" />
                <div className="absolute inset-0 bg-white/72" />
              </div>
              <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-11">
                  <div className="flex items-center gap-6">
                    <a href="/changelog" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setActiveMenu(null)}>
                      What&apos;s new <ArrowUpRight className="h-3 w-3" />
                    </a>
                    <a href="/docs" className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setActiveMenu(null)}>Documentation</a>
                    <a href="/security" className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setActiveMenu(null)}>Security</a>
                    <a href="/status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setActiveMenu(null)}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                      All systems operational
                    </a>
                  </div>
                  <a href="http://localhost:3000/auth/register" className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg bg-foreground text-white hover:opacity-90 transition-opacity" onClick={() => setActiveMenu(null)}>
                    Start for free <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden dark:bg-black/95 bg-white/95 backdrop-blur-xl border-b dark:border-white/6 border-foreground/10 px-4 pb-5 pt-2">
          <p className="text-[10px] uppercase tracking-wider dark:text-white/25 text-foreground/30 px-3 pt-2 pb-1">Platform</p>
          <nav className="flex flex-col gap-0.5 mb-2">
            {productCore.map((item) => {
              const Icon = item.icon;
              return (
                <a key={item.id} href={`#${item.id}`} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm dark:text-white/50 text-foreground/60 dark:hover:text-white hover:text-foreground dark:hover:bg-white/4 hover:bg-foreground/5 transition-colors" onClick={() => setMobileOpen(false)}>
                  <Icon className="h-4 w-4" style={{ color: item.color }} />
                  {item.label}
                </a>
              );
            })}
          </nav>
          <p className="text-[10px] uppercase tracking-wider dark:text-white/25 text-foreground/30 px-3 pt-2 pb-1">Navigate</p>
          <nav className="flex flex-col gap-0.5 mb-4">
            {[
              { label: "Pricing",   href: "/pricing"   },
              { label: "Docs",      href: "/docs"       },
              { label: "Changelog", href: "/changelog"  },
              { label: "Blog",      href: "/blog"       },
              { label: "Self-host", href: "/self-host"  },
            ].map((link) => (
              <a key={link.label} href={link.href} className="px-3 py-2.5 text-sm dark:text-white/50 text-foreground/60 dark:hover:text-white hover:text-foreground rounded-lg dark:hover:bg-white/4 hover:bg-foreground/5 transition-colors" onClick={() => setMobileOpen(false)}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-2 pt-4 border-t dark:border-white/6 border-foreground/10">
            <a href="http://localhost:3000/auth/login" className="w-full py-2.5 text-sm text-center dark:text-white/60 text-foreground/60 border dark:border-white/10 border-foreground/15 rounded-lg dark:hover:bg-white/4 hover:bg-foreground/5 transition-colors">Sign in</a>
            <a href="http://localhost:3000/auth/register" className="w-full py-2.5 text-sm font-medium text-center dark:text-black text-white dark:bg-white bg-foreground rounded-lg dark:hover:bg-white/90 hover:bg-foreground/90 transition-colors">Get started free</a>
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;