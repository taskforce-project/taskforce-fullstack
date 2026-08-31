import type { LucideIcon } from "lucide-react";

/**
 * Palette sémantique des icônes - SOURCE UNIQUE pour tout le site marketing.
 *
 * Chaque icône a **sa** teinte (« une couleur par icône » - règle user) et la garde d'une page à
 * l'autre. Contrainte forte dans les menus : deux items d'un même panneau ne doivent JAMAIS partager
 * une teinte. Les familles ci-dessous (bleu/violet/cyan/…) restent le repli pour les icônes non
 * singularisées. On lit par le **nom Lucide** (`icon.displayName`) → on enrobe le rendu avec `hueFor(Icon)`.
 *
 * Règle : on ne colore que les **icônes de CONTENU** (features, cartes, puces, en-têtes). Les icônes
 * de CHROME (chevrons, flèches de lien, menu, croix de fermeture, logos de marque) restent neutres.
 *
 * Miroir de `ICON_COLOR` dans `flows/OrchestrationFlows.tsx` (mêmes hex) - cf. `.ai/landing-design-system.md` §2.
 */
export const HUE = {
  blue: "#2563eb", //  build · spec · plan · exécution · action (= --primary)
  violet: "#7c3aed", // IA · modèle · mémoire · pensée · agent · Labs
  emerald: "#059669", // livré · validé · succès · live
  amber: "#d97706", //  gouvernance · revue · sécurité · attention
  cyan: "#0891b2", //   data · analytics · monitoring · recherche · board
  rose: "#e11d48", //   rejet · incident · alerte
  slate: "#64748b", //  neutre · structurel · infra · gens · marque
  // Teintes complémentaires pour SINGULARISER (une couleur par icône, surtout dans les menus).
  indigo: "#4f46e5",
  fuchsia: "#c026d3",
  pink: "#db2777",
  teal: "#0d9488",
  sky: "#0284c7",
  orange: "#ea580c",
  green: "#16a34a",
  purple: "#9333ea",
  red: "#dc2626",
} as const;

/** Teinte par nom d'icône Lucide (`displayName`). Familles = repli ; le bloc « singulières » désambiguïse les icônes de menu. */
const ICON_HUE: Record<string, string> = {
  // ── build / spec / plan / exécution / code - bleu de marque ──
  FileText: HUE.blue, FileCode2: HUE.blue, FilePlus2: HUE.blue, Code2: HUE.blue,
  Terminal: HUE.blue, GitBranch: HUE.blue, GitPullRequest: HUE.blue, Building2: HUE.slate,
  CalendarClock: HUE.blue, CalendarRange: HUE.sky, Clock: HUE.blue, Timer: HUE.blue,
  ListChecks: HUE.blue, ListTodo: HUE.blue, ListTree: HUE.blue, Layers: HUE.blue,
  Flag: HUE.blue, Play: HUE.blue, Workflow: HUE.blue, Cloud: HUE.blue,
  SlidersHorizontal: HUE.blue, Settings2: HUE.blue, Mail: HUE.blue, MessageSquare: HUE.blue,
  Info: HUE.blue, HelpCircle: HUE.blue, Cpu: HUE.blue, Map: HUE.blue,

  // ── IA / modèle / pensée / agent - violet ──
  Bot: HUE.violet, BrainCircuit: HUE.violet, Compass: HUE.violet, Network: HUE.violet,
  Repeat: HUE.violet, RotateCcw: HUE.violet, Radio: HUE.violet, FlaskConical: HUE.violet,

  // ── data / analytics / monitoring / recherche / board - cyan ──
  // ⚠️ Lucide alias : `BarChart3` rend `lucide-chart-column` → son displayName est « ChartColumn ».
  // On mappe les DEUX, sinon repli bleu silencieux (→ collision menu). Idem si d'autres alias surgissent.
  BarChart3: HUE.cyan, ChartColumn: HUE.cyan, Gauge: HUE.teal, TrendingDown: HUE.orange, Radar: HUE.sky,
  Search: HUE.cyan, FileSearch: HUE.cyan, ScrollText: HUE.cyan, LayoutDashboard: HUE.cyan,
  LayoutGrid: HUE.cyan, KanbanSquare: HUE.cyan, SquareKanban: HUE.cyan, ClipboardList: HUE.cyan, LifeBuoy: HUE.cyan,
  Scale: HUE.cyan, Zap: HUE.cyan,

  // ── gouvernance / revue / sécurité / attention - ambre ──
  ShieldCheck: HUE.amber, Lock: HUE.rose, KeyRound: HUE.orange, EyeOff: HUE.slate,
  Pencil: HUE.purple, PenLine: HUE.purple, Bell: HUE.amber, Megaphone: HUE.amber,
  TriangleAlert: HUE.rose, CalendarCheck: HUE.emerald,

  // ── livré / validé / succès - émeraude ──
  Check: HUE.emerald, CheckIcon: HUE.emerald, ClipboardCheck: HUE.emerald, FileCheck2: HUE.emerald,
  UserCheck: HUE.emerald, Rocket: HUE.emerald, GraduationCap: HUE.emerald,

  // ── rejet / incident / alerte - rose ──
  Siren: HUE.rose, X: HUE.rose, Ticket: HUE.rose, Activity: HUE.rose,

  // ── neutre / structurel / infra / gens / marque - ardoise ──
  Boxes: HUE.indigo, Database: HUE.slate, Server: HUE.slate, Inbox: HUE.slate, Eye: HUE.slate,
  User: HUE.slate, UserPlus: HUE.slate, Quote: HUE.slate, Github: HUE.slate, Newspaper: HUE.slate,

  // ── SINGULIÈRES : une couleur par icône, pour qu'aucun panneau de menu n'ait deux fois la même.
  //    Product : Workflow(blue)·Bot(violet)·ShieldCheck(amber)·Brain·Sparkles·Users·BarChart3(cyan)·Plug
  //    Resources : BookOpen·Newspaper(slate)·GraduationCap(emerald)·History·Map(blue)·FlaskConical(violet)·Activity(rose)
  Brain: HUE.fuchsia, // Memory
  Sparkles: HUE.pink, // Smart Assign
  Users: HUE.green, //   Collaboration
  Plug: HUE.indigo, //   Integrations
  BookOpen: HUE.sky, //  Docs
  History: HUE.orange, //Changelog
  RefreshCw: HUE.teal, //Learning from reviews

  // Remplaçants animés (cf. nav.ts + AnimatedNavIcon) : on garde la teinte du glyphe d'origine.
  Waypoints: HUE.blue, //     Orchestration (ex-Workflow)
  UserRoundCog: HUE.violet, // Agents (ex-Bot)
  Lightbulb: HUE.emerald, //  Learn (ex-GraduationCap)
  Atom: HUE.violet, //        Labs (ex-FlaskConical)
};

/** Teinte d'une icône Lucide (par `displayName`). `fallback` = bleu de marque si l'icône n'est pas mappée. */
export function hueFor(icon: LucideIcon | { displayName?: string } | undefined, fallback: string = HUE.blue): string {
  const name = (icon as { displayName?: string } | undefined)?.displayName;
  return (name && ICON_HUE[name]) || fallback;
}
