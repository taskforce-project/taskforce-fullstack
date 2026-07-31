import {
  Workflow,
  Bot,
  ShieldCheck,
  Brain,
  Sparkles,
  Users,
  BarChart3,
  Plug,
  BookOpen,
  Newspaper,
  GraduationCap,
  History,
  Map,
  Activity,
  Cpu,
  RefreshCw,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

/**
 * nav.ts — architecture de navigation du site, en données.
 * Source unique consommée par le header (méga-menus), le footer et le sitemap.
 * Réf. taskforce-docs/v1/14-design/landing-refonte/Plan_Refonte_Site.md §3
 */

/**
 * Badge de maturité — garde-fou d'honnêteté (Spec_Master §1.1).
 *
 * ⚠️ La clé reste `labs` (historique, évite un renommage en cascade) mais le libellé public
 * est **« Planned »** depuis la décision D11 : on annonce ce qui arrive, on n'invite pas
 * à venir lire comment c'est fait. Voir Plan_Refonte_Site.md §1.2.
 */
export type Maturity = "live" | "beta" | "labs";

export const MATURITY_LABEL: Record<Maturity, string> = {
  live: "Live",
  beta: "Beta",
  labs: "Planned",
};

export type NavLink = {
  label: string;
  href: string;
  desc?: string;
  icon?: LucideIcon;
  badge?: Maturity;
};

export type NavGroup = {
  title: string;
  links: NavLink[];
  viewAll?: NavLink;
};

/* ─────────────────────────  PRODUCT  ───────────────────────── */

export const PRODUCT_PLATFORM: NavLink[] = [
  {
    label: "Orchestration",
    href: "/product/orchestration",
    desc: "Vision to deploy, as validated checkpoints",
    icon: Workflow,
    badge: "labs",
  },
  {
    label: "Agents",
    href: "/product/agents",
    desc: "CPO, CTO and COO working your delivery",
    icon: Bot,
    badge: "labs",
  },
  {
    label: "Approvals",
    href: "/product/approvals",
    desc: "A human signs off at every checkpoint",
    icon: ShieldCheck,
    badge: "beta",
  },
  {
    label: "TaskForce Memory",
    href: "/product/brain-os",
    desc: "The memory layer for every run, powered by Brain OS",
    icon: Brain,
    badge: "beta",
  },
];

export const PRODUCT_DELIVERY: NavLink[] = [
  {
    label: "Smart Assign",
    href: "/product/smart-assign",
    desc: "The right task to the right person",
    icon: Sparkles,
    badge: "live",
  },
  {
    label: "Collaboration",
    href: "/product/collaboration",
    desc: "Boards, issues and cycles in real time",
    icon: Users,
    badge: "live",
  },
  {
    label: "Analytics",
    href: "/product/analytics",
    desc: "Throughput, resolution time, workload",
    icon: BarChart3,
    badge: "live",
  },
  {
    label: "Integrations",
    href: "/product/integrations",
    desc: "129 connectors across 16 categories",
    icon: Plug,
    badge: "beta",
  },
];

/* ─────────────────────────  SOLUTIONS  ───────────────────────── */

/**
 * Décision D10 : on ouvre au-delà de la tech. Le produit orchestre du travail qui passe par
 * des étapes relues et validées — l'ingénierie logicielle est le premier métier prouvé,
 * pas le seul possible. Les métiers non prouvés portent un badge de maturité sur leur page.
 */
export const SOLUTIONS_GROUPS: NavGroup[] = [
  {
    title: "By team",
    links: [
      { label: "Engineering", href: "/solutions/engineering" },
      { label: "Product", href: "/solutions/product" },
      { label: "Operations", href: "/solutions/operations" },
      { label: "Marketing", href: "/solutions/marketing" },
      { label: "Client services", href: "/solutions/client-services" },
    ],
    viewAll: { label: "View all teams", href: "/solutions" },
  },
  {
    title: "By use case",
    links: [
      { label: "Specification", href: "/use-cases/specification" },
      { label: "Technical decision", href: "/use-cases/technical-decision" },
      { label: "Review & sign-off", href: "/use-cases/review-signoff" },
      { label: "Quality checks", href: "/use-cases/quality-checks" },
      { label: "Documentation", href: "/use-cases/documentation" },
    ],
    viewAll: { label: "View all use cases", href: "/use-cases" },
  },
  {
    title: "Compare",
    links: [
      { label: "vs Jira", href: "/vs/jira" },
      { label: "vs Linear", href: "/vs/linear" },
      { label: "vs Notion", href: "/vs/notion" },
      { label: "vs Devin", href: "/vs/devin" },
      { label: "vs Claude Code alone", href: "/vs/claude-code-alone" },
    ],
    viewAll: { label: "View all comparisons", href: "/vs" },
  },
];

/* ─────────────────────────  LABS  ───────────────────────── */

/**
 * Décision D11 : Labs dit **sur quoi on travaille**, pas **comment on le fait**.
 * Chaque entrée est un sujet + le bénéfice visé. Aucune architecture, aucune boucle de
 * raisonnement, aucune méthode d'évaluation : c'est ce qui nous distingue, ça ne se publie pas
 * avant que ça tourne. Le détail vit dans le vault, pas sur le site.
 */
export const LABS_LINKS: NavLink[] = [
  {
    label: "Agent roles",
    href: "/labs/agent-roles",
    desc: "Scoped agents rather than one generalist",
    icon: Bot,
  },
  {
    label: "Run memory",
    href: "/labs/run-memory",
    desc: "Runs that remember what you already decided",
    icon: Brain,
  },
  {
    label: "Model choice",
    href: "/labs/model-choice",
    desc: "The right model per step, local or hosted",
    icon: Cpu,
  },
  {
    label: "Learning from reviews",
    href: "/labs/learning-from-reviews",
    desc: "What you send back should improve the next run",
    icon: RefreshCw,
  },
];

/* ─────────────────────────  RESOURCES  ───────────────────────── */

export const RESOURCES_LINKS: NavLink[] = [
  { label: "Documentation", href: "/docs", desc: "Guides, API and self-host", icon: BookOpen },
  { label: "Blog", href: "/blog", desc: "Engineering and product notes", icon: Newspaper },
  { label: "Learn", href: "/learn", desc: "What an AI delivery OS actually is", icon: GraduationCap },
  { label: "Changelog", href: "/changelog", desc: "Everything we shipped", icon: History },
  { label: "Roadmap", href: "/roadmap", desc: "What comes next, in the open", icon: Map },
  { label: "Status", href: "/status", desc: "Live availability", icon: Activity },
];

/* ─────────────────────────  FOOTER  ───────────────────────── */

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Product",
    links: [...PRODUCT_PLATFORM, ...PRODUCT_DELIVERY].map(({ label, href }) => ({ label, href })),
  },
  {
    title: "Solutions",
    links: [
      { label: "Engineering", href: "/solutions/engineering" },
      { label: "Product", href: "/solutions/product" },
      { label: "Operations", href: "/solutions/operations" },
      { label: "Marketing", href: "/solutions/marketing" },
      { label: "All use cases", href: "/use-cases" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "TaskForce vs Cursor", href: "/vs/cursor" },
      { label: "TaskForce vs Devin", href: "/vs/devin" },
      { label: "TaskForce vs Copilot", href: "/vs/copilot" },
      { label: "TaskForce vs Jira", href: "/vs/jira" },
      { label: "All comparisons", href: "/vs" },
    ],
  },
  {
    title: "Labs",
    links: [
      { label: "Overview", href: "/labs" },
      ...LABS_LINKS.map(({ label, href }) => ({ label, href })),
    ],
  },
  {
    title: "Resources",
    links: RESOURCES_LINKS.map(({ label, href }) => ({ label, href })),
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/company/about" },
      { label: "Contact", href: "/company/contact" },
      { label: "Press kit", href: "/company/media" },
      { label: "Pricing", href: "/pricing" },
      { label: "Enterprise", href: "/enterprise" },
      { label: "Book a demo", href: "/book-a-demo" },
    ],
  },
  {
    title: "Legal & Trust",
    links: [
      { label: "Trust center", href: "/trust" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "Cookies", href: "/legal/cookies" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "Subprocessors", href: "/legal/subprocessors" },
      { label: "Security", href: "/legal/security" },
      { label: "Accessibility", href: "/legal/accessibility" },
      { label: "AI transparency", href: "/legal/ai-transparency" },
      { label: "Legal notice", href: "/legal/notice" },
    ],
  },
];

/** Labels des entrées de la barre — réutilisés par le menu mobile. */
export const PRIMARY_NAV = [
  { label: "Product", href: "/product" },
  { label: "Solutions", href: "/solutions" },
  { label: "Labs", href: "/labs" },
  { label: "Resources", href: "/docs" },
  { label: "Enterprise", href: "/enterprise" },
] as const;

export const APP_URL = "https://app.taskforce.dev";
export const LABS_ICON = FlaskConical;

/* ─────────────────────────  Pages réellement construites  ─────────────────────────
 * Source unique de vérité : header, footer, menu mobile et le hub /product lisent cet
 * ensemble pour décider si un lien est cliquable ou GRISÉ (« Soon »). On ne construit pas
 * 50 pages d'un coup — le reste est désactivé plutôt que renvoyé sur du 404. Décision user
 * (30/07) : « celles qu'on peut faire, sinon griser et rendre non cliquable ».
 * Pour activer une page : la créer dans src/pages/ PUIS ajouter sa route ici. */
export const BUILT_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/pricing",
  "/product",
  "/product/orchestration",
  "/product/agents",
  "/product/approvals",
  "/product/brain-os",
  "/product/smart-assign",
  "/product/collaboration",
  "/product/integrations",
  "/product/integrations/github",
  "/product/integrations/slack",
  "/product/integrations/plane",
  "/product/analytics",
  "/trust",
  "/enterprise",
  "/roadmap",
  "/legal/ai-transparency",
  "/book-a-demo",
]);

/** Un lien est actif s'il est externe (app, réseaux) ou si sa page existe. Sinon : grisé. */
export function isLive(href: string): boolean {
  return href.startsWith("http") || BUILT_ROUTES.has(href);
}
