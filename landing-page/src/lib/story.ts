/**
 * story.ts - la fiction de référence de la home.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant, chaque illustration inventait ses propres données : une phrase ici, un
 * « Run #145 » là, quatre candidats ailleurs, 128 sources plus bas. Résultat, on
 * ne suivait rien - la page se lisait comme un catalogue de fonctionnalités
 * animées plutôt que comme une démonstration.
 *
 * Ici, la home est **un seul run, filmé en plan-séquence**. Toutes les scènes
 * lisent ce fichier : même workspace, mêmes personnes, mêmes chiffres, du hero
 * jusqu'au dashboard. La continuité est ce qui rend une démo crédible - c'est la
 * grammaire des vidéos de lancement Linear / Raycast.
 *
 * RÈGLE : aucune scène ne code en dur un nom, un horaire ou un chiffre. Si une
 * valeur apparaît à deux endroits de la page, elle vit ici.
 *
 * HONNÊTETÉ : c'est une démonstration illustrée, pas un client. Les surfaces qui
 * affichent des métriques portent la mention (règle Spec_Master §1.1).
 */

/* ─────────────────────────  Le décor  ───────────────────────── */

export const WORKSPACE = { name: "Northwind HQ", initial: "NH", slug: "northwind" } as const;
export const PROJECT = "Customer Portal";
export const PROJECT_SUBTITLE = "Billing, invoices and account area.";

/* ─────────────────────────  Le casting  ─────────────────────────
 * Pas d'images : des initiales, comme dans l'app quand personne n'a d'avatar.
 * Un seul cercle coloré - « You ». Le visiteur est le protagoniste, et c'est la
 * seule chose de l'écran qui porte le bleu de marque.
 * Les libellés ne portent aucun pronom : on ne présume pas de celui des gens. */

export type Person = {
  id: string;
  name: string;
  initials: string;
  role: string;
  /** Le seul avatar de marque, réservé au visiteur. */
  brand?: boolean;
};

export const PEOPLE = {
  you: { id: "you", name: "You", initials: "YO", role: "Reviewer", brand: true },
  sam: { id: "sam", name: "Sam Okonkwo", initials: "SO", role: "Support" },
  maya: { id: "maya", name: "Maya Ferrand", initials: "MF", role: "Product" },
  leo: { id: "leo", name: "Léo Bianchi", initials: "LB", role: "Backend" },
  ines: { id: "ines", name: "Inès Roussel", initials: "IR", role: "Frontend" },
} as const satisfies Record<string, Person>;

/* ─────────────────────────  Le run  ─────────────────────────
 * Une demande que n'importe qui comprend - elle vient du support, pas d'un
 * ticket technique. C'est ce qui permet de vendre au-delà de l'ingénierie (D10)
 * sans inventer d'écrans pour des métiers qu'on n'a jamais livrés. */

export const RUN = {
  number: 147,
  title: "Let customers export their invoices",
  /** L'origine : un message du support, un lundi matin. Rappelé dans 3 scènes. */
  origin: {
    author: PEOPLE.sam,
    at: "Mon 09:14",
    message:
      "Third customer this month asking to download their invoices in bulk. They do it one by one right now.",
  },
} as const;

/** Les sept checkpoints - le vrai ordre d'exécution, partagé par toutes les scènes. */
export type CheckpointId =
  | "vision"
  | "spec"
  | "architecture"
  | "contract"
  | "breakdown"
  | "implementation"
  | "qa";

export type Checkpoint = {
  id: CheckpointId;
  label: string;
  /** Pour le rail horizontal : sept libellés complets ne tiennent pas côte à côte. */
  short: string;
  by: string;
  took: string;
};

export const CHECKPOINTS: readonly Checkpoint[] = [
  { id: "vision", label: "Frame the problem", short: "Frame", by: "CPO agent", took: "9s" },
  { id: "spec", label: "Draft the product spec", short: "Spec", by: "CPO agent", took: "24s" },
  { id: "architecture", label: "Propose the approach", short: "Approach", by: "CTO agent", took: "18s" },
  { id: "contract", label: "Write the API contract", short: "Contract", by: "CTO agent", took: "12s" },
  { id: "breakdown", label: "Break the work into issues", short: "Breakdown", by: "COO agent", took: "11s" },
  { id: "implementation", label: "Hand off to your coding agent", short: "Build", by: "Your tools", took: "-" },
  { id: "qa", label: "QA checklist and sign-off", short: "QA", by: "COO agent", took: "7s" },
] as const;

/* ─────────────────────────  La spec  ─────────────────────────
 * Trois critères que l'agent écrit seul. Le quatrième n'est PAS ici : il naît
 * d'un rejet humain dans la scène du run, et c'est tout le propos du produit -
 * donc il ne doit être divulgué nulle part avant ce moment-là. */

export const SPEC_CRITERIA = [
  "A customer can export invoices for a chosen period",
  "The export is a single PDF or a CSV, picked at export time",
  "Exports over 500 invoices are generated in the background and emailed",
] as const;

/** Le critère né du commentaire humain - payload de la scène « approbation ». */
export const SPEC_CRITERION_FROM_HUMAN =
  "Invoices issued before 2024 are fetched from the legacy billing system";

/** Le commentaire qui l'a produit, mot pour mot. */
export const HUMAN_COMMENT = "Invoices before 2024 live in the old billing system.";

/* ─────────────────────────  Le board  ─────────────────────────
 * Repris de la vraie vue Board (captures du 24/07) : colonnes avec compteur et
 * filet de couleur, cartes à chips de label, clé `CP-xx`, pastille de priorité,
 * avatar d'assigné. L'issue du run est `CP-12`, dans Todo - c'est celle qu'on ouvre. */

export type Priority = "urgent" | "high" | "medium" | "low" | "none";

/** Couleurs reprises de `frontend/components/issues/issue-filters.tsx`. */
export const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
  none: "bg-[#d4d4da]",
};

export type Label = "billing" | "api" | "ui" | "export" | "support" | "testing";

export const LABEL_STYLE: Record<Label, string> = {
  billing: "bg-amber-50 text-amber-700 border-amber-200",
  api: "bg-blue-50 text-blue-700 border-blue-200",
  ui: "bg-violet-50 text-violet-700 border-violet-200",
  export: "bg-cyan-50 text-cyan-700 border-cyan-200",
  support: "bg-emerald-50 text-emerald-700 border-emerald-200",
  testing: "bg-teal-50 text-teal-700 border-teal-200",
};

export type Card = {
  key: string;
  title: string;
  labels?: Label[];
  priority: Priority;
  assignee?: Person;
  /** La carte du run - celle que le curseur va ouvrir. */
  hero?: boolean;
};

export type Column = { id: string; name: string; count: number; accent: string; cards: Card[] };

export const BOARD: readonly Column[] = [
  {
    id: "backlog",
    name: "Backlog",
    count: 7,
    accent: "bg-[#d4d4da]",
    cards: [
      { key: "CP-31", title: "Retry failed billing webhooks", labels: ["api"], priority: "low", assignee: PEOPLE.leo },
      { key: "CP-27", title: "Archive invoices older than 7 years", priority: "none", assignee: PEOPLE.ines },
      { key: "CP-24", title: "Currency formatting per locale", labels: ["ui"], priority: "low" },
    ],
  },
  {
    id: "todo",
    name: "Todo",
    count: 6,
    accent: "bg-indigo-400",
    cards: [
      {
        key: "CP-12",
        title: RUN.title,
        labels: ["export", "billing"],
        priority: "high",
        assignee: PEOPLE.maya,
        hero: true,
      },
      { key: "CP-14", title: "Email the export when it is ready", labels: ["api"], priority: "medium", assignee: PEOPLE.leo },
      { key: "CP-15", title: "Empty state for accounts with no invoice", labels: ["ui"], priority: "low", assignee: PEOPLE.ines },
    ],
  },
  {
    id: "progress",
    name: "In progress",
    count: 4,
    accent: "bg-amber-400",
    cards: [
      { key: "CP-9", title: "Invoice PDF renderer times out over 500 rows", labels: ["billing"], priority: "urgent", assignee: PEOPLE.leo },
      { key: "CP-6", title: "Account settings - billing tab", labels: ["ui"], priority: "medium", assignee: PEOPLE.ines },
    ],
  },
  {
    id: "done",
    name: "Done",
    count: 18,
    accent: "bg-emerald-500",
    cards: [
      { key: "CP-4", title: "Invoice list pagination", priority: "medium", assignee: PEOPLE.ines },
      { key: "CP-2", title: "Legacy billing read-only connector", labels: ["api"], priority: "high", assignee: PEOPLE.leo },
    ],
  },
] as const;

/* ─────────────────────────  Les agents assignables  ─────────────────────────
 * C'est le cœur de ce qu'on vend : un agent de code est un **assigné comme un
 * autre**. Même colonne, même carte, même checkpoint de revue. La seule chose qui
 * change est qu'il n'a pas besoin de dormir.
 * `brand` porte la clé du catalogue de logos (`public/logos/`). */

/** `logo` et non `brand` : `Person.brand` est un booléen (« c'est vous »), la
 *  collision de nom rendait le type `assignee` inutilisable au rendu. */
export type Agent = { id: string; name: string; logo: string; kind: string };

/** Les agents de code assignables. `logo` = clé d'un SVG vendorisé dans `public/logos/`
 *  (récupérés le 24/07 : anthropic, cursor, copilot, windsurf). L'histoire assigne
 *  `claude`, mais le sélecteur en montre plusieurs - n'importe lequel fait l'affaire. */
export const AGENTS = {
  claude: { id: "claude", name: "Claude Code", logo: "anthropic", kind: "Coding agent" },
  cursor: { id: "cursor", name: "Cursor", logo: "cursor", kind: "Coding agent" },
  copilot: { id: "copilot", name: "GitHub Copilot", logo: "copilot", kind: "Coding agent" },
  windsurf: { id: "windsurf", name: "Windsurf", logo: "windsurf", kind: "Coding agent" },
} as const satisfies Record<string, Agent>;

/** Ordre d'affichage du sélecteur d'agent. */
export const AGENT_LIST: readonly Agent[] = [
  AGENTS.claude,
  AGENTS.cursor,
  AGENTS.copilot,
  AGENTS.windsurf,
];

/* ─────────────────────────  Le découpage  ─────────────────────────
 * Ce que le checkpoint « Breakdown » produit à partir de la spec approuvée.
 * `from` relie chaque issue à la ligne de spec dont elle sort - dont le critère 4,
 * celui né du commentaire humain. La chaîne reste lisible de bout en bout. */

/**
 * Union discriminée sur `agent` : c'est ce qui permet à `task.agent === true` de
 * garantir au rendu que `assignee` est un `Agent` (avec son `logo`) et non une
 * `Person` (avec ses `initials`). Sans ça, le champ `assignee` n'est utilisable
 * ni d'un côté ni de l'autre.
 */
/**
 * Union discriminée sur `agent`. Point important, tranché avec l'utilisateur :
 * Smart Assign ne pose pas seulement un exécutant, il pose aussi un **reviewer
 * humain**. Un agent qui livre du code sans relecture humaine, ce serait
 * exactement ce que le produit refuse. Donc chaque tâche a un `reviewer`, même
 * quand l'exécutant est déjà une personne.
 */
export type Task = {
  key: string;
  title: string;
  /** Le critère d'acceptation dont l'issue est issue (1-indexé). */
  from: number;
  points: number;
  /** Qui relit et approuve - toujours un humain. */
  reviewer: Person;
  /** Ce que Smart Assign a retenu pour justifier l'exécutant. */
  why: string;
} & ({ agent: true; assignee: Agent } | { agent?: false; assignee: Person });

export const BREAKDOWN: readonly Task[] = [
  {
    key: "CP-40",
    title: "Export endpoint with period filter",
    from: 1,
    points: 5,
    assignee: AGENTS.claude,
    agent: true,
    reviewer: PEOPLE.leo,
    why: "Touches 3 files it has shipped in before",
  },
  {
    key: "CP-41",
    title: "Read pre-2024 invoices from the legacy system",
    from: 4,
    points: 8,
    assignee: AGENTS.claude,
    agent: true,
    reviewer: PEOPLE.leo,
    why: "Knows the legacy connector · Léo is at 92% load",
  },
  {
    key: "CP-42",
    title: "Export dialog - period and format",
    from: 2,
    points: 3,
    assignee: PEOPLE.ines,
    reviewer: PEOPLE.maya,
    why: "Wrote 8 of the last 10 dialogs · has capacity",
  },
  {
    key: "CP-43",
    title: "Background job over 500 invoices",
    from: 3,
    points: 5,
    assignee: PEOPLE.leo,
    reviewer: PEOPLE.ines,
    why: "Only one who has touched the job runner",
  },
] as const;

/* ─────────────────────────  Ce que l'agent fait  ─────────────────────────
 * La vue qui récupère le travail de l'agent. Chaque étape est vérifiable :
 * un fichier, un diff, un résultat de test, un numéro de PR.
 * `CP-41` est choisie exprès - c'est l'issue née du **commentaire humain**, donc
 * l'agent travaille littéralement sur ce que la personne a exigé au checkpoint. */

export type AgentStep = {
  verb: "Read" | "Search" | "Edit" | "Create" | "Test" | "Scan" | "Open";
  target: string;
  detail?: string;
  /** Rattache l'étape au critère d'acceptation qu'elle sert. */
  criterion?: number;
  /** Étape à statut vert/rouge - les gates que tout le monde veut voir passer. */
  gate?: boolean;
};

export const AGENT_STEPS: readonly AgentStep[] = [
  { verb: "Read", target: "spec/CP-41.md", detail: "acceptance criteria 4" },
  { verb: "Search", target: "legacy billing", detail: "6 matches in 3 files" },
  { verb: "Read", target: "LegacyBillingClient.java", detail: "218 lines" },
  { verb: "Edit", target: "InvoiceExportService.java", detail: "+61 −4", criterion: 4 },
  { verb: "Create", target: "LegacyInvoiceMapper.java", detail: "+88" },
  { verb: "Test", target: "Unit + integration", detail: "22 passed", gate: true },
  { verb: "Scan", target: "Security scan", detail: "0 vulnerabilities", gate: true },
  { verb: "Open", target: "PR #284", detail: "linked to CP-41" },
];

/* ─────────────────────────  Création & contexte (Act 1 du film)  ─────────────────────────
 * Ce que Brain OS ingère quand on crée le projet et qu'on le relie à un outil existant.
 * C'est l'amorce du flow : le contexte entre AVANT le premier run, il n'est pas deviné. */

export const BRAIN_INGEST = [
  { source: "Linear", detail: "47 issues · 3 cycles imported" },
  { source: "GitHub", detail: "customer-portal · 1.2k commits read" },
  { source: "Docs", detail: "12 pages indexed" },
  { source: "Decisions", detail: "ADR-004 Billing · 6 more" },
] as const;

/* ─────────────────────────  Les chiffres du run  ─────────────────────────
 * Ils se retrouvent dans le dashboard de fin : le point de la courbe qu'on
 * reconnaît, c'est le run qu'on vient de regarder. C'est ce qui boucle l'histoire. */

export const RUN_METRICS = {
  leadTimeDays: 1.8,
  medianBeforeDays: 6.5,
  sentBack: 1,
  issues: 4,
} as const;
