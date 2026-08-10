/**
 * Registre des types de cartes du dashboard — libellé, description, icône,
 * taille par défaut et périodes supportées. Toutes les cartes s'appuient sur
 * des endpoints réels (aucune donnée fabriquée).
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  Flame,
  HeartPulse,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import type { DashboardCard, DashboardCardSize } from "@/lib/api/dashboard-card-service";

// ---------------------------------------------------------------------------
// Période globale de la section Analytics
// ---------------------------------------------------------------------------

/** Période GLOBALE — préférence UI (localStorage par workspace), pas une donnée métier. */
export type GlobalRange = "24h" | "7d" | "30d";

export const GLOBAL_RANGES: readonly { value: GlobalRange; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 j" },
  { value: "30d", label: "30 j" },
];

/** Fenêtre en jours de la période globale (pour les cartes qui savent l'honorer). */
export const GLOBAL_RANGE_DAYS: Record<GlobalRange, number> = { "24h": 1, "7d": 7, "30d": 30 };

export const rangeStorageKey = (slug: string) => `tf-dashboard-range:${slug}`;

// ---------------------------------------------------------------------------
// Définitions des cartes
// ---------------------------------------------------------------------------

export interface CardTimeRangeOption {
  value: string;
  label: string;
}

export interface CardDefinition {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: DashboardCardSize;
  /** Périodes propres à la carte (sous-menu « Période ») — absent si la carte n'a pas de fenêtre. */
  timeRanges?: readonly CardTimeRangeOption[];
  /** true = absente de la grille « Ajouter » (ex. ai-chart, créée via la génération IA). */
  hiddenInPicker?: boolean;
}

export const CARD_DEFINITIONS: readonly CardDefinition[] = [
  {
    type: "ops-health",
    label: "Santé des opérations",
    description: "Répartition sain / à risque / critique / en pause de vos opérations.",
    icon: HeartPulse,
    defaultSize: "1",
  },
  {
    type: "throughput",
    label: "Débit",
    description: "Tâches résolues au fil du temps, sur vos données réelles.",
    icon: Activity,
    defaultSize: "2",
    timeRanges: [
      { value: "30d", label: "30 jours (quotidien)" },
      { value: "8w", label: "8 semaines (hebdo)" },
    ],
  },
  {
    type: "needs-attention",
    label: "À surveiller",
    description: "Opérations à risque ou critiques qui demandent une action.",
    icon: AlertTriangle,
    defaultSize: "1",
  },
  {
    type: "ai-usage",
    label: "Usage Cortex",
    description: "Consommation de tokens du mois vs plafond du forfait.",
    icon: Sparkles,
    defaultSize: "1",
  },
  {
    type: "kpi-resolved",
    label: "Tâches résolues",
    description: "Total résolu ce mois-ci, avec l'écart vs mois dernier.",
    icon: CheckCircle2,
    defaultSize: "1",
  },
  {
    type: "kpi-velocity",
    label: "Vélocité",
    description: "Issues livrées sur les 7 derniers jours.",
    icon: Flame,
    defaultSize: "1",
  },
  {
    type: "kpi-open",
    label: "Issues ouvertes",
    description: "Travail en cours, toutes opérations confondues.",
    icon: CircleDot,
    defaultSize: "1",
  },
  {
    type: "burndown",
    label: "Burndown",
    description: "Reste à faire vs trajectoire idéale du sprint.",
    icon: TrendingDown,
    defaultSize: "2",
  },
  {
    type: "workload",
    label: "Charge d'équipe",
    description: "Heatmap membre × jour des échéances assignées.",
    icon: CalendarRange,
    defaultSize: "2",
    timeRanges: [
      { value: "7d", label: "7 jours" },
      { value: "14d", label: "14 jours" },
      { value: "30d", label: "30 jours" },
    ],
  },
  {
    type: "ai-chart",
    label: "Graphe IA",
    description: "Graphe généré par Cortex depuis vos données réelles.",
    icon: Sparkles,
    defaultSize: "2",
    hiddenInPicker: true,
  },
];

export const CARD_REGISTRY: Readonly<Record<string, CardDefinition>> = Object.fromEntries(
  CARD_DEFINITIONS.map((d) => [d.type, d]),
);

/** Titre affiché d'une carte : titre custom, sinon libellé du registre, sinon le type brut. */
export function cardTitle(card: DashboardCard): string {
  return card.title ?? CARD_REGISTRY[card.cardType]?.label ?? card.cardType;
}

// ---------------------------------------------------------------------------
// Props communes des corps de carte
// ---------------------------------------------------------------------------

export interface DashboardCardBodyProps {
  slug: string;
  card: DashboardCard;
  /** Période globale de la section — fenêtre par défaut, le réglage par carte prime. */
  globalRange: GlobalRange;
  /** Incrémenté par le refresh global et le « Actualiser » de la carte. */
  refreshToken: number;
}
