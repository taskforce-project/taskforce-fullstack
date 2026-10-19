/**
 * Constantes du site (app desktop) : liens, menus de l'en-tête, pied de page. Source unique pour l'en-tête, le pied
 * de page, le fil d'Ariane du JSON-LD et le sitemap.
 */
import type { Tone } from "@/components/visuals/shapes";

export const REPO = "taskforce-project/taskforce-fullstack";
const GITHUB = `https://github.com/${REPO}`;

export const LINKS = {
  github: GITHUB,
  githubOrg: "https://github.com/taskforce-project",
  releases: `${GITHUB}/releases`,
  issues: `${GITHUB}/issues`,
  license: `${GITHUB}/blob/main/LICENSE`,
  email: "contact@taskforce-project.fr",
} as const;

export type NavLink = { label: string; href: string };

/** Illustration animée montrée dans la carte d'un menu quand on survole l'entrée (components/nav/MenuArt). */
export type MenuArt =
  | "plan"
  | "memory"
  | "assign"
  | "ask"
  | "chart"
  | "connect"
  | "palette"
  | "run"
  | "limits"
  | "approval"
  | "pr"
  | "download"
  | "releases"
  | "migrate"
  | "source";

export type MenuItem = NavLink & { desc: string; art: MenuArt; tone: Tone; external?: boolean };
export type Menu = {
  id: string;
  label: string;
  /** Lien direct (pas de panneau). */
  href?: string;
  groups?: { title: string; items: MenuItem[] }[];
  /** Lien en pied de panneau. */
  more?: NavLink;
};

/** Menus de l'en-tête, à la manière de Duna : une ligne d'explication par entrée et une illustration. */
export const MENUS: Menu[] = [
  {
    id: "product",
    label: "Product",
    groups: [
      {
        title: "Product",
        items: [
          { label: "Plan", href: "/features#plan", desc: "Boards, cycles and a roadmap", art: "plan", tone: "blue" },
          { label: "Memory", href: "/features#memory", desc: "Brain OS keeps the why next to the work", art: "memory", tone: "green" },
          { label: "Agents", href: "/features#agents", desc: "Hand issues to Claude Code or Copilot", art: "assign", tone: "pink" },
          { label: "Assistant", href: "/features#assistant", desc: "Answers drawn from your own work", art: "ask", tone: "sky" },
        ],
      },
      {
        title: "And every day",
        items: [
          { label: "Analytics", href: "/features#measure", desc: "Throughput, burndown and workload", art: "chart", tone: "yellow" },
          { label: "Connections", href: "/features#connect", desc: "GitHub, MCP servers, Plane, webhooks", art: "connect", tone: "lime" },
          { label: "Comfort", href: "/features#everyday", desc: "Command palette, themes, accessibility", art: "palette", tone: "red" },
        ],
      },
    ],
    more: { label: "Every feature", href: "/features" },
  },
  {
    id: "agents",
    label: "Agents",
    groups: [
      {
        title: "Working with agents",
        items: [
          { label: "How a run works", href: "/agents#run", desc: "From the assignment to the pull request", art: "run", tone: "blue" },
          { label: "What an agent can touch", href: "/agents#limits", desc: "The limits every run gets", art: "limits", tone: "green" },
          { label: "Claude Code", href: "/agents#agents", desc: "Your own Claude Code, on your computer", art: "approval", tone: "yellow" },
          { label: "GitHub Copilot", href: "/agents#agents", desc: "GitHub's coding agent, in its cloud", art: "pr", tone: "pink" },
        ],
      },
    ],
    more: { label: "About agents", href: "/agents" },
  },
  { id: "security", label: "Security", href: "/security" },
  {
    id: "resources",
    label: "Resources",
    groups: [
      {
        title: "Resources",
        items: [
          { label: "Download", href: "/download", desc: "For macOS, Windows and Linux", art: "download", tone: "blue" },
          { label: "Release notes", href: "/download#whats-new", desc: "What changed in each version", art: "releases", tone: "lime" },
          { label: "Moving from the web app", href: "/migrate", desc: "Bring your projects to the desktop", art: "migrate", tone: "yellow" },
          { label: "Source code", href: GITHUB, desc: "Open source, under AGPL-3.0", art: "source", tone: "sky", external: true },
        ],
      },
    ],
  },
];

/** Entrées principales, pour le fil d'Ariane. */
export const NAV: NavLink[] = [
  { label: "Features", href: "/features" },
  { label: "Agents", href: "/agents" },
  { label: "Security", href: "/security" },
  { label: "Download", href: "/download" },
  { label: "Moving from the web app", href: "/migrate" },
];

export const FOOTER_GROUPS: { title: string; links: (NavLink & { external?: boolean })[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Agents", href: "/agents" },
      { label: "Security", href: "/security" },
      { label: "Download", href: "/download" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Moving from the web app", href: "/migrate" },
      { label: "Release notes", href: "/download#whats-new" },
      { label: "Source code", href: GITHUB, external: true },
      { label: "Report an issue", href: `${GITHUB}/issues`, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Legal notice", href: "/legal/notice" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Terms of use", href: "/legal/terms" },
    ],
  },
];

/** Libellé d'une page du site pour le fil d'Ariane (JSON-LD) ; null = pas de libellé connu. */
export function pageLabel(path: string): string | null {
  const all: NavLink[] = [...NAV, ...FOOTER_GROUPS.flatMap((g) => g.links)];
  return all.find((l) => l.href === path)?.label ?? null;
}
