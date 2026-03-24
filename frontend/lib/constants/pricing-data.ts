// Structure de données pour la page pricing améliorée (inspirée de Plane.so)

export interface PlanFeature {
  name: string;
  included: boolean;
  tooltip?: string; // Info supplémentaire au survol
  highlight?: boolean; // Pour mettre en avant certaines features
}

export interface PlanDetails {
  id: "free" | "pro" | "enterprise";
  name: string;
  price: string;
  priceDetail?: string; // Ex: "par utilisateur/mois"
  description: string;
  recommended?: boolean;
  badge?: string; // Ex: "Populaire", "Meilleure valeur"
  cta: string; // Call to action (ex: "Commencer", "Contactez-nous")

  // Features principales (affichées sur la carte)
  highlights: string[];

  // Limites/quotas (affichés de manière visuelle)
  limits: {
    projects: string;
    users: string;
    storage: string;
    apiCalls?: string;
  };
}

// Tableau comparatif détaillé (comme Plane.so)
export interface FeatureCategory {
  category: string;
  features: {
    name: string;
    description?: string;
    free: boolean | string; // true/false ou texte (ex: "5 max")
    pro: boolean | string;
    enterprise: boolean | string;
  }[];
}

// ===================================
// Données de pricing TaskForce
// ===================================

export const pricingPlans: PlanDetails[] = [
  {
    id: "free",
    name: "Gratuit",
    price: "0€",
    priceDetail: "pour toujours",
    description: "Parfait pour tester et petites équipes",
    recommended: false,
    cta: "Commencer gratuitement",
    highlights: [
      "Aucune carte bancaire requise",
      "Fonctionnalités de base",
      "Support communautaire",
    ],
    limits: {
      projects: "5 projets",
      users: "Jusqu'à 5 utilisateurs",
      storage: "2 GB",
      apiCalls: "1,000/mois",
    },
  },
  {
    id: "pro",
    name: "Pro",
    price: "29€",
    priceDetail: "par utilisateur/mois",
    description: "Pour les équipes en croissance",
    recommended: true,
    badge: "Populaire",
    cta: "Essayer 14 jours gratuits",
    highlights: [
      "Toutes les fonctionnalités FREE",
      "Intégrations avancées",
      "Support prioritaire",
      "Rapports personnalisés",
    ],
    limits: {
      projects: "Illimité",
      users: "Jusqu'à 50 utilisateurs",
      storage: "100 GB",
      apiCalls: "Illimité",
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sur devis",
    priceDetail: "tarif personnalisé",
    description: "Pour les grandes organisations",
    recommended: false,
    badge: "Sur mesure",
    cta: "Contactez-nous",
    highlights: [
      "Tout du plan Pro",
      "SLA garanti 99.9%",
      "Support dédié 24/7",
      "Déploiement on-premise",
      "Formation personnalisée",
    ],
    limits: {
      projects: "Illimité",
      users: "Illimité",
      storage: "Personnalisé",
      apiCalls: "Illimité",
    },
  },
];

// ===================================
// Tableau comparatif détaillé
// ===================================

export const featureComparison: FeatureCategory[] = [
  {
    category: "Gestion de Projets",
    features: [
      {
        name: "Nombre de projets",
        description: "Projets actifs simultanés",
        free: "5 maximum",
        pro: "Illimité",
        enterprise: "Illimité",
      },
      {
        name: "Tâches illimitées",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Sous-tâches",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Tableaux Kanban",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Diagrammes de Gantt",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Dépendances entre tâches",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Templates de projet",
        free: "3 templates",
        pro: "Illimité",
        enterprise: "Illimité + Custom",
      },
    ],
  },
  {
    category: "Collaboration",
    features: [
      {
        name: "Nombre d'utilisateurs",
        free: "5 maximum",
        pro: "50 maximum",
        enterprise: "Illimité",
      },
      {
        name: "Commentaires et mentions",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Partage de fichiers",
        free: "2 GB",
        pro: "100 GB",
        enterprise: "Personnalisé",
      },
      {
        name: "Notifications temps réel",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Invités externes",
        free: false,
        pro: "10 invités",
        enterprise: "Illimité",
      },
      {
        name: "Permissions avancées",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "SSO (Single Sign-On)",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Rapports & Analytics",
    features: [
      {
        name: "Dashboard basique",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Rapports d'avancement",
        free: "Basique",
        pro: "Avancé",
        enterprise: "Custom",
      },
      {
        name: "Export PDF/Excel",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Suivi du temps",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Analytics personnalisés",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        name: "API pour reporting",
        free: false,
        pro: "1,000 appels/mois",
        enterprise: "Illimité",
      },
    ],
  },
  {
    category: "Intégrations",
    features: [
      {
        name: "Slack",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Google Workspace",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Microsoft Teams",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Jira, Trello, Asana",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "GitHub/GitLab",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Zapier",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: "Webhooks personnalisés",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        name: "API REST complète",
        free: "Limité",
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Support & Sécurité",
    features: [
      {
        name: "Support par email",
        free: "Communauté",
        pro: "Prioritaire",
        enterprise: "Dédié 24/7",
      },
      {
        name: "Temps de réponse",
        free: "72h",
        pro: "24h",
        enterprise: "< 2h",
      },
      {
        name: "SLA garanti",
        free: false,
        pro: false,
        enterprise: "99.9%",
      },
      {
        name: "Sauvegardes automatiques",
        free: "Quotidien",
        pro: "Toutes les 6h",
        enterprise: "Temps réel",
      },
      {
        name: "Audit logs",
        free: false,
        pro: "30 jours",
        enterprise: "Illimité",
      },
      {
        name: "2FA (Authentification 2 facteurs)",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Conformité RGPD",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Déploiement on-premise",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Formation & Onboarding",
    features: [
      {
        name: "Documentation",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Vidéos tutorielles",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: "Webinaires",
        free: false,
        pro: "Mensuels",
        enterprise: "Sur demande",
      },
      {
        name: "Session onboarding",
        free: false,
        pro: "1 session",
        enterprise: "Illimité",
      },
      {
        name: "Formation personnalisée",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        name: "Account Manager dédié",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
];

// ===================================
// Calculateur d'économies (à venir)
// ===================================

export interface CompetitorTool {
  name: string;
  pricePerUser: number;
  logo?: string;
}

export const competitorTools: CompetitorTool[] = [
  { name: "Jira", pricePerUser: 7.75 },
  { name: "Asana", pricePerUser: 10.99 },
  { name: "Monday.com", pricePerUser: 12 },
  { name: "ClickUp", pricePerUser: 7 },
  { name: "Notion", pricePerUser: 10 },
  { name: "Trello", pricePerUser: 5 },
  { name: "Linear", pricePerUser: 8 },
];

export function calculateSavings(
  toolsUsed: string[],
  numberOfUsers: number,
  taskforcePlan: "free" | "pro" | "enterprise",
): {
  currentMonthlyCost: number;
  taskforceCost: number;
  monthlySavings: number;
  yearlySavings: number;
  savingsPercentage: number;
} {
  // Coût actuel avec les outils concurrents
  const currentCost = toolsUsed.reduce((total, toolName) => {
    const tool = competitorTools.find((t) => t.name === toolName);
    return total + (tool ? tool.pricePerUser * numberOfUsers : 0);
  }, 0);

  // Coût TaskForce
  const taskforcePrices = {
    free: 0,
    pro: 29,
    enterprise: 0, // Sur devis
  };

  const taskforceCost =
    taskforcePlan === "pro" ? taskforcePrices.pro * numberOfUsers : 0;

  const monthlySavings = currentCost - taskforceCost;
  const yearlySavings = monthlySavings * 12;
  const savingsPercentage =
    currentCost > 0 ? (monthlySavings / currentCost) * 100 : 0;

  return {
    currentMonthlyCost: currentCost,
    taskforceCost,
    monthlySavings,
    yearlySavings,
    savingsPercentage,
  };
}
