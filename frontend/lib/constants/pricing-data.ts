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
  priceMonthly: number; // Prix numérique pour calculs
  priceYearly: number; // Prix annuel (avec réduction)
  priceDetail?: string; // Détail du prix (ex: "pour toujours", "par utilisateur/mois")
  description?: string; // Description courte du plan
  recommended?: boolean; // Plan recommandé
  badge?: string; // Badge affiché (ex: "Populaire", "Sur mesure")
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
    priceMonthly: 0,
    priceYearly: 0,
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
    priceMonthly: 29,
    priceYearly: 25, // 14% de réduction annuelle (29 * 12 * 0.86 / 12 = 25)
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
    priceMonthly: 0,
    priceYearly: 0,
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
// Testimonials (Placeholders)
// ===================================

export interface Testimonial {
  id: number;
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar?: string;
}

export const testimonials: Testimonial[] = [
  {
    id: 1,
    quote: "TaskForce a transformé notre façon de gérer les projets. L'interface intuitive et les fonctionnalités avancées nous ont permis de gagner 40% de temps sur nos sprints.",
    author: "Marie Dubois",
    role: "Product Manager",
    company: "TechStart Inc.",
  },
  {
    id: 2,
    quote: "La migration depuis Jira a été fluide. Le support client est exceptionnel et la plateforme s'adapte parfaitement à nos besoins spécifiques.",
    author: "Thomas Martin",
    role: "CTO",
    company: "DigitalCorp",
  },
  {
    id: 3,
    quote: "Excellent rapport qualité-prix. Les intégrations avec nos outils existants fonctionnent parfaitement et le déploiement on-premise était exactement ce qu'il nous fallait.",
    author: "Sophie Laurent",
    role: "Head of Engineering",
    company: "SecureBank",
  },
];

// ===================================
// Trust Badges (Certifications)
// ===================================

export interface TrustBadge {
  id: string;
  name: string;
  description: string;
  icon: string; // Nom de l'icône Lucide
}

export const trustBadges: TrustBadge[] = [
  {
    id: "rgpd",
    name: "Conformité RGPD",
    description: "100% conforme au règlement européen sur la protection des données",
    icon: "ShieldCheck",
  },
  {
    id: "iso27001",
    name: "ISO 27001",
    description: "Certification de sécurité de l'information en cours",
    icon: "Award",
  },
  {
    id: "ssl",
    name: "Chiffrement SSL/TLS",
    description: "Toutes les communications sont chiffrées de bout en bout",
    icon: "Lock",
  },
  {
    id: "backup",
    name: "Sauvegardes quotidiennes",
    description: "Vos données sauvegardées automatiquement chaque jour",
    icon: "Database",
  },
  {
    id: "uptime",
    name: "99.9% Uptime",
    description: "Disponibilité garantie avec SLA pour les plans Enterprise",
    icon: "Activity",
  },
  {
    id: "support",
    name: "Support français",
    description: "Équipe support basée en France, disponible 6j/7",
    icon: "HeadphonesIcon",
  },
];

// ===================================
// FAQ Pricing
// ===================================

export interface FAQItem {
  question: string;
  answer: string;
}

export const pricingFAQ: FAQItem[] = [
  {
    question: "Puis-je changer de plan à tout moment ?",
    answer: "Oui ! Vous pouvez upgrader ou downgrader votre plan à tout moment depuis votre tableau de bord. Les changements sont effectifs immédiatement et vous ne payez que la différence au prorata.",
  },
  {
    question: "Y a-t-il une période d'essai ?",
    answer: "Le plan Gratuit est disponible sans limite de temps avec toutes les fonctionnalités de base. Le plan Pro offre un essai gratuit de 14 jours, sans carte bancaire requise.",
  },
  {
    question: "Quelle est la différence entre mensuel et annuel ?",
    answer: "L'abonnement annuel vous offre une réduction de 14% (soit environ 2 mois gratuits). Vous êtes facturé une seule fois par an au lieu de 12 fois.",
  },
  {
    question: "Comment fonctionne le plan Enterprise ?",
    answer: "Le plan Enterprise est personnalisé selon vos besoins spécifiques. Il inclut un déploiement on-premise, un support dédié 24/7, un SLA garanti et une formation personnalisée. Contactez notre équipe pour obtenir un devis.",
  },
  {
    question: "Puis-je héberger TaskForce sur mes propres serveurs ?",
    answer: "Oui ! Avec le plan Enterprise, vous pouvez déployer TaskForce on-premise sur vos propres serveurs. Nous fournissons une installation complète avec Keycloak pour l'authentification et PostgreSQL pour la base de données.",
  },
  {
    question: "Quels sont les moyens de paiement acceptés ?",
    answer: "Nous acceptons les cartes bancaires (Visa, Mastercard, American Express), virements SEPA et PayPal. Pour les entreprises, nous proposons également la facturation sur devis.",
  },
  {
    question: "Les données sont-elles sécurisées ?",
    answer: "Oui, absolument. Toutes les données sont chiffrées en transit (SSL/TLS) et au repos. Nous sommes conformes RGPD et effectuons des sauvegardes quotidiennes. Les serveurs sont hébergés en Europe (France/Allemagne).",
  },
  {
    question: "Que se passe-t-il si je dépasse les limites de mon plan ?",
    answer: "Pour le plan Gratuit, vous serez notifié lorsque vous approchez des limites et pourrez upgrader. Pour le plan Pro, les limites sont flexibles - nous vous contacterons pour adapter votre abonnement si nécessaire.",
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
