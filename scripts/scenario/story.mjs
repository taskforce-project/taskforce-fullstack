/**
 * Le scénario : **trois mois de vie d'un vrai projet**, joué phase par phase.
 *
 * Ce fichier ne contient que la matière ; `play.mjs` la joue via l'API. Il est séparé parce qu'il
 * est long et qu'il se lit comme un dossier de projet — pas comme du code.
 *
 * Ce qu'on cherche à éprouver : le Brain OS construit-il, au fil du projet, une **cellule de
 * connaissance** sur laquelle on peut s'appuyer ? D'où le parti pris : les notes ne sont pas
 * déversées à la fin, elles arrivent **quand elles arriveraient dans la vraie vie** — le cadrage
 * d'abord (client, budget, équipe, stack), puis les décisions, les incidents, les audits, les
 * retours utilisateurs. Le cerveau doit grandir avec le projet, pas être posé dessus.
 */

/** Les 10 personnes du projet, par rôle — sert à répartir les issues de façon crédible. */
export const TEAM = [
  { role: "Tech lead", skew: ["ARCHITECTURE", "ENGINEERING"] },
  { role: "Dev backend senior", skew: ["API", "ENGINEERING"] },
  { role: "Dev backend", skew: ["API"] },
  { role: "Dev frontend senior", skew: ["DESIGN"] },
  { role: "Dev frontend", skew: ["DESIGN"] },
  { role: "Designer produit", skew: ["DESIGN", "UTILISATEUR"] },
  { role: "Product owner", skew: ["PRODUIT"] },
  { role: "QA", skew: ["AUDITS"] },
  { role: "SRE", skew: ["INFRA", "OPERATIONS"] },
  { role: "Data / facturation", skew: ["PRODUIT"] },
];

const md = (...lines) => lines.join("\n");

/**
 * Le projet principal : 3 mois, 6 sprints, ~60 issues, et surtout tout ce qui *constitue* un
 * projet — le client, l'argent, l'équipe, la stack, les risques — pas seulement des tickets.
 */
export const MAIN = {
  name: "Portail Client Meridian",
  identifier: process.env.PROJECT_IDENTIFIER ?? "PORT",
  description:
    "Refonte du portail self-service de Groupe Meridian (assurance) : 40 000 assurés, " +
    "remplacement d'un extranet de 2011. Budget 340 k€, 3 mois, 10 personnes. " +
    "Enjeu : diviser par deux les appels au support.",

  /**
   * Les phases, dans l'ordre. Chacune apporte ses notes (le contexte du moment) et, sauf le
   * cadrage, son sprint. C'est le « seed progressif » : on rejoue la chronologie.
   */
  phases: [
    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Cadrage",
      notes: [
        {
          title: "Charte du projet — Portail Client Meridian",
          type: "DOC", domain: "PROJET", tags: ["charte", "cadrage"],
          content: md(
            "## Pourquoi",
            "L'extranet actuel date de 2011. 62 % des appels au support portent sur des actions que",
            "l'assuré pourrait faire seul : télécharger une attestation, changer un RIB, suivre un sinistre.",
            "",
            "## Objectif",
            "Diviser par deux le volume d'appels de niveau 1 en six mois après la mise en ligne.",
            "",
            "## Périmètre",
            "Authentification, tableau de bord, contrats, sinistres, facturation, notifications.",
            "**Hors périmètre** : la souscription en ligne (projet distinct, 2027).",
            "",
            "Rattaché à [[01 · Projet]]",
            "",
            "#charte #cadrage",
          ),
        },
        {
          title: "Contexte client — Groupe Meridian",
          type: "DOC", domain: "PROJET", tags: ["client", "cadrage"],
          content: md(
            "## Le client",
            "Assureur mutualiste, 40 000 assurés, 180 salariés, DSI de 12 personnes.",
            "Culture prudente : trois comités de validation avant toute mise en production.",
            "",
            "## Interlocuteurs",
            "- **Sponsor** : directrice de la relation client — juge sur le volume d'appels, pas sur la technique.",
            "- **Référent DSI** : garant de l'intégration au SI existant, sensible à la dette.",
            "- **Juridique** : valide tout ce qui touche aux données de santé.",
            "",
            "## Contraintes non négociables",
            "- Hébergement en France, données de santé (HDS).",
            "- L'ancien extranet reste en ligne jusqu'à la bascule complète.",
            "",
            "Rattaché à [[01 · Projet]] · voir [[Attentes et irritants côté assurés]]",
            "",
            "#client #cadrage",
          ),
        },
        {
          title: "Équipe et rôles",
          type: "DOC", domain: "PROJET", tags: ["equipe", "cadrage"],
          content: md(
            "10 personnes, 3 mois.",
            "",
            "| Rôle | Nb | Engagement |",
            "| --- | --- | --- |",
            "| Tech lead | 1 | plein temps |",
            "| Dev backend | 2 | plein temps |",
            "| Dev frontend | 2 | plein temps |",
            "| Designer produit | 1 | mi-temps à partir du sprint 3 |",
            "| Product owner | 1 | plein temps |",
            "| QA | 1 | plein temps à partir du sprint 2 |",
            "| SRE | 1 | 30 % |",
            "| Data / facturation | 1 | plein temps |",
            "",
            "**Point de fragilité** : un seul SRE, à 30 %. Toute l'infra repose sur une personne.",
            "",
            "Rattaché à [[01 · Projet]]",
            "",
            "#equipe #cadrage",
          ),
        },
        {
          title: "Budget et phasage",
          type: "DOC", domain: "ROADMAP", tags: ["budget", "finance"],
          content: md(
            "## Enveloppe",
            "**340 k€** dont 295 k€ de charge d'équipe, 30 k€ d'infra sur un an, 15 k€ d'audit externe.",
            "",
            "| Poste | Montant | Engagé au cadrage |",
            "| --- | --- | --- |",
            "| Équipe (10 pers., 3 mois) | 295 k€ | 0 |",
            "| Hébergement HDS (12 mois) | 30 k€ | 30 k€ (contrat annuel) |",
            "| Audit sécurité externe | 15 k€ | 0 |",
            "",
            "## Phasage",
            "- **T1** : socle + authentification + tableau de bord (sprints 1-3).",
            "- **T2** : contrats, sinistres, facturation, notifications (sprints 4-6).",
            "- Bascule progressive par cohortes de 5 000 assurés.",
            "",
            "⚠️ L'infra est **engagée dès le cadrage** (contrat annuel) : un retard ne coûte pas moins cher.",
            "",
            "Rattaché à [[13 · Roadmap]]",
            "",
            "#budget #finance",
          ),
        },
        {
          title: "Stack technique retenue",
          type: "DECISION", domain: "ARCHITECTURE", tags: ["stack", "adr"],
          content: md(
            "## Décision",
            "API Java (Spring Boot), front React, PostgreSQL, hébergement HDS français.",
            "",
            "## Pourquoi",
            "La DSI de Meridian maintient déjà du Java : à la fin du projet, ils reprennent le code.",
            "Un choix plus moderne mais étranger à leurs compétences aurait été une dette dès la livraison.",
            "",
            "## Ce qu'on écarte",
            "- Le serverless : l'hébergeur HDS retenu ne le propose pas.",
            "- Un SGBD NoSQL : les données sont fortement relationnelles (contrats, garanties, sinistres).",
            "",
            "Rattaché à [[03 · Architecture]]",
            "",
            "#stack #adr",
          ),
        },
        {
          title: "Priorités et arbitrages",
          type: "DOC", domain: "PRODUIT", tags: ["priorite", "cadrage"],
          content: md(
            "Ordre de priorité **assumé** — il sert à trancher quand le temps manque :",
            "",
            "1. **Attestation téléchargeable** — à elle seule, 28 % des appels au support.",
            "2. **Suivi de sinistre** — 19 % des appels, et le plus fort irritant.",
            "3. **Changement de RIB** — 15 %, mais chaîne de validation lourde.",
            "4. Tableau de bord, notifications, préférences.",
            "",
            "Tout ce qui ne sert pas la baisse des appels passe après. C'est le seul critère.",
            "",
            "Rattaché à [[02 · Produit]] · voir [[Charte du projet — Portail Client Meridian]]",
            "",
            "#priorite #cadrage",
          ),
        },
        {
          title: "Attentes et irritants côté assurés",
          type: "DOC", domain: "UTILISATEUR", tags: ["utilisateur", "recherche"],
          content: md(
            "Douze entretiens menés avant le cadrage.",
            "",
            "## Ce qui revient",
            "- « Je ne sais jamais où en est mon dossier. » (11 sur 12)",
            "- « Je dois rappeler pour savoir si mon document est arrivé. » (9 sur 12)",
            "- Le mot de passe est perdu **à chaque connexion** : usage trimestriel, pas quotidien.",
            "",
            "## Conséquence de conception",
            "Un portail utilisé quatre fois par an ne se conçoit pas comme une application quotidienne :",
            "la reconnexion doit être triviale, la navigation redécouverte à chaque visite.",
            "",
            "Rattaché à [[15 · Utilisateur]]",
            "",
            "#utilisateur #recherche",
          ),
        },
        {
          title: "Analyse de risques",
          type: "FINDING", domain: "SECURITE", tags: ["risques", "hds"],
          content: md(
            "| Risque | Gravité | Parade |",
            "| --- | --- | --- |",
            "| Fuite de données de santé | Critique | Chiffrement au repos, cloisonnement, audit externe |",
            "| Usurpation par mot de passe faible | Élevée | Second facteur sur les actions sensibles |",
            "| Indisponibilité de l'ancien SI pendant la bascule | Élevée | Bascule par cohortes, retour arrière prévu |",
            "| SRE unique à 30 % | Moyenne | Runbooks écrits et testés, astreinte partagée |",
            "",
            "Rattaché à [[07 · Sécurité]] · voir [[Équipe et rôles]]",
            "",
            "#risques #hds",
          ),
        },
      ],
      cycle: null,
    },

    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Sprint 1 · Socle et authentification",
      notes: [
        {
          title: "ADR — Authentification par jeton court + rafraîchissement",
          type: "ADR", domain: "ARCHITECTURE", tags: ["adr", "auth"],
          content: md(
            "## Décision",
            "Jeton d'accès de 15 minutes, jeton de rafraîchissement de 30 jours en cookie `HttpOnly`.",
            "",
            "## Pourquoi",
            "Le portail est consulté quatre fois par an ([[Attentes et irritants côté assurés]]) :",
            "une session courte forcerait une reconnexion à chaque visite, soit l'irritant n° 1.",
            "Le jeton long en cookie donne la commodité, le jeton court limite la fenêtre de vol.",
            "",
            "## Conséquence",
            "Toute action sensible (RIB, données de santé) exige une **ré-authentification**,",
            "quel que soit l'état de la session.",
            "",
            "Rattaché à [[03 · Architecture]]",
            "",
            "#adr #auth",
          ),
        },
        {
          title: "Conventions de code et de revue",
          type: "SOP", domain: "ENGINEERING", tags: ["conventions"],
          content: md(
            "- Une PR = un sujet. Au-delà de 400 lignes modifiées, on découpe.",
            "- Deux relectures pour tout ce qui touche à l'authentification ou aux données de santé.",
            "- Pas de merge sans test qui échoue avant le correctif.",
            "",
            "Le code est repris par la DSI de Meridian à la livraison : il est écrit pour eux, pas pour nous.",
            "",
            "Rattaché à [[04 · Engineering]] · voir [[Stack technique retenue]]",
            "",
            "#conventions",
          ),
        },
        {
          title: "Environnements et chaîne de livraison",
          type: "DOC", domain: "INFRA", tags: ["infra", "cicd"],
          content: md(
            "Trois environnements : `dev` (éphémère), `recette` (miroir de prod, données anonymisées), `prod` (HDS).",
            "",
            "La recette est **la seule** à recevoir des données ressemblant à la production — anonymisées.",
            "Aucune donnée de santé réelle ne sort de la prod, jamais, y compris pour reproduire un bug.",
            "",
            "Rattaché à [[06 · Infrastructure]]",
            "",
            "#infra #cicd",
          ),
        },
      ],
      cycle: {
        name: "Sprint 1 · Socle et authentification",
        start: "2026-04-06", end: "2026-04-17", close: true,
        issues: [
          { title: "Mise en place du squelette API", type: "Task", priority: "HIGH", points: 5, done: true },
          { title: "Connexion par e-mail et mot de passe", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Jeton d'accès et rafraîchissement", type: "Feature", priority: "HIGH", points: 8, done: true },
          { title: "Réinitialisation du mot de passe", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Modèle de données assuré", type: "Task", priority: "HIGH", points: 5, done: true },
          { title: "Chaîne d'intégration continue", type: "Task", priority: "MEDIUM", points: 3, done: true },
          { title: "Page de connexion", type: "Feature", priority: "MEDIUM", points: 3, done: true },
          { title: "Journalisation des accès", type: "Task", priority: "MEDIUM", points: 3, done: true },
          { title: "Environnement de recette", type: "Task", priority: "MEDIUM", points: 5, done: false },
          { title: "Verrouillage après cinq échecs", type: "Feature", priority: "MEDIUM", points: 3, done: false },
        ],
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Sprint 2 · Tableau de bord et contrats",
      notes: [
        {
          title: "Modèle de données — contrats et garanties",
          type: "DOC", domain: "ARCHITECTURE", tags: ["donnees"],
          content: md(
            "Un assuré porte N contrats ; un contrat porte N garanties, historisées par avenant.",
            "",
            "**Piège** : une garantie n'est jamais modifiée, elle est **remplacée** par une nouvelle version.",
            "L'historique fait foi juridiquement — un `UPDATE` sur une garantie est un bug, pas une optimisation.",
            "",
            "Rattaché à [[03 · Architecture]]",
            "",
            "#donnees",
          ),
        },
        {
          title: "Design system du portail",
          type: "DOC", domain: "DESIGN", tags: ["design"],
          content: md(
            "Composants, typographie, contrastes. **AA obligatoire** : la population assurée est âgée",
            "(moyenne 54 ans) et une part significative consulte sur mobile en zoom.",
            "",
            "Rattaché à [[14 · Design]] · voir [[Attentes et irritants côté assurés]]",
            "",
            "#design",
          ),
        },
        {
          title: "Stratégie de tests",
          type: "SOP", domain: "ENGINEERING", tags: ["tests"],
          content: md(
            "- Unitaire sur les règles métier (garanties, franchises, prorata).",
            "- Intégration sur les parcours d'authentification et de facturation.",
            "- Pas de test d'interface exhaustif : coûteux, fragile, et la QA couvre mieux.",
            "",
            "Rattaché à [[04 · Engineering]]",
            "",
            "#tests",
          ),
        },
      ],
      cycle: {
        name: "Sprint 2 · Tableau de bord et contrats",
        start: "2026-04-20", end: "2026-05-01", close: true,
        issues: [
          { title: "Tableau de bord — vue d'ensemble", type: "Feature", priority: "HIGH", points: 8, done: true },
          { title: "Liste des contrats", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Détail d'un contrat", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Historique des avenants", type: "Feature", priority: "MEDIUM", points: 8, done: true },
          { title: "Composants du design system", type: "Task", priority: "MEDIUM", points: 5, done: true },
          { title: "Import des contrats depuis le SI", type: "Task", priority: "HIGH", points: 8, done: true },
          { title: "Écrasement d'une garantie à l'import", type: "Bug", priority: "URGENT", points: 5, done: true },
          { title: "Contraste insuffisant sur les libellés", type: "Bug", priority: "MEDIUM", points: 2, done: true },
          { title: "Recherche dans les contrats", type: "Feature", priority: "LOW", points: 5, done: false },
          { title: "Export PDF d'un contrat", type: "Feature", priority: "MEDIUM", points: 5, done: false },
        ],
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Sprint 3 · Attestations et sinistres",
      notes: [
        {
          title: "Runbook — l'attestation ne se génère plus",
          type: "RUNBOOK", domain: "RUNBOOKS", tags: ["runbook", "incident"],
          content: md(
            "**Symptôme** : l'assuré clique, rien ne se télécharge, aucune erreur affichée.",
            "",
            "1. Vérifier la file de génération (`attestations`) — c'est le coupable neuf fois sur dix.",
            "2. Si la file est pleine : le service de rendu PDF est tombé. Le relancer.",
            "3. Si la file est vide : le contrat n'a pas de garantie active → ce n'est pas une panne,",
            "   c'est un cas métier mal rendu. Rediriger vers le support.",
            "",
            "**Ne jamais** régénérer en masse : la file repart en surcharge et l'incident se rejoue.",
            "",
            "Rattaché à [[10 · Runbooks]]",
            "",
            "#runbook #incident",
          ),
        },
        {
          title: "Charte de l'API publique",
          type: "DOC", domain: "API", tags: ["api"],
          content: md(
            "Versionnage par URL (`/v1`), pagination par curseur, erreurs au format RFC 7807.",
            "",
            "L'API sert le portail **et** l'application mobile à venir : tout ce qui y entre devient",
            "un engagement vis-à-vis de deux clients, pas un.",
            "",
            "Rattaché à [[05 · API]]",
            "",
            "#api",
          ),
        },
        {
          title: "Parcours de suivi de sinistre",
          type: "DOC", domain: "PRODUIT", tags: ["produit"],
          content: md(
            "Cinq états visibles par l'assuré : *déclaré, en cours d'instruction, expertise, accepté, réglé*.",
            "",
            "Le SI en compte **dix-sept**. On les replie volontairement : l'assuré veut savoir où il en est,",
            "pas comprendre l'organisation interne de l'assureur.",
            "",
            "Rattaché à [[02 · Produit]] · voir [[Priorités et arbitrages]]",
            "",
            "#produit",
          ),
        },
      ],
      cycle: {
        name: "Sprint 3 · Attestations et sinistres",
        start: "2026-05-04", end: "2026-05-15", close: true,
        issues: [
          { title: "Génération d'attestation à la demande", type: "Feature", priority: "URGENT", points: 8, done: true },
          { title: "File de génération asynchrone", type: "Task", priority: "HIGH", points: 5, done: true },
          { title: "Déclaration de sinistre", type: "Feature", priority: "HIGH", points: 8, done: true },
          { title: "Suivi d'un sinistre en cinq étapes", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Dépôt de pièces justificatives", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Saturation de la file d'attestations", type: "Bug", priority: "URGENT", points: 3, done: true },
          { title: "Attestation vide si aucune garantie active", type: "Bug", priority: "HIGH", points: 2, done: true },
          { title: "Notification de changement d'état", type: "Feature", priority: "MEDIUM", points: 5, done: false },
          { title: "Historique des attestations émises", type: "Feature", priority: "LOW", points: 3, done: false },
        ],
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Sprint 4 · Facturation et RIB",
      notes: [
        {
          title: "Règles de facturation et de prorata",
          type: "DOC", domain: "PRODUIT", tags: ["facturation", "finance"],
          content: md(
            "Cotisation annuelle, prélevée mensuellement. Un avenant en cours d'année déclenche un **prorata**.",
            "",
            "Le calcul se fait **au jour**, pas au mois : un assuré qui résilie le 3 paie trois jours.",
            "C'est une exigence du juridique de Meridian, pas un choix technique — on ne l'arrondit pas.",
            "",
            "Rattaché à [[02 · Produit]] · voir [[Contexte client — Groupe Meridian]]",
            "",
            "#facturation #finance",
          ),
        },
        {
          title: "ADR — Pas de stockage des coordonnées bancaires",
          type: "ADR", domain: "SECURITE", tags: ["adr", "securite", "rib"],
          content: md(
            "## Décision",
            "Le portail ne stocke aucun IBAN. Le changement de RIB délègue au prestataire de paiement,",
            "qui renvoie un jeton opaque.",
            "",
            "## Pourquoi",
            "Stocker des IBAN étend le périmètre d'audit à toute la base et n'apporte rien :",
            "aucune fonction du portail n'a besoin de lire un IBAN en clair.",
            "",
            "## Conséquence",
            "Un changement de RIB dépend d'un tiers : sa panne rend la fonction indisponible.",
            "Assumé — cf. [[Analyse de risques]].",
            "",
            "Rattaché à [[07 · Sécurité]]",
            "",
            "#adr #securite #rib",
          ),
        },
        {
          title: "Coûts d'hébergement — relevé à mi-parcours",
          type: "FINDING", domain: "INFRA", tags: ["budget", "finance", "infra"],
          content: md(
            "Le poste infra était budgété à **30 k€ / an**. À mi-parcours, la projection donne **38 k€**.",
            "",
            "**Cause** : le stockage des pièces justificatives de sinistres, sous-estimé — les assurés",
            "déposent des photos de smartphone non compressées (4 à 8 Mo pièce).",
            "",
            "**Piste** : compression à l'envoi. Non tranchée : la lisibilité d'un constat amiable",
            "compressé est un sujet juridique, pas technique.",
            "",
            "Rattaché à [[06 · Infrastructure]] · voir [[Budget et phasage]]",
            "",
            "#budget #finance #infra",
          ),
        },
      ],
      cycle: {
        name: "Sprint 4 · Facturation et RIB",
        start: "2026-05-18", end: "2026-05-29", close: true,
        issues: [
          { title: "Échéancier de cotisation", type: "Feature", priority: "HIGH", points: 8, done: true },
          { title: "Calcul du prorata au jour", type: "Task", priority: "HIGH", points: 8, done: true },
          { title: "Changement de RIB délégué", type: "Feature", priority: "HIGH", points: 8, done: true },
          { title: "Ré-authentification sur action sensible", type: "Feature", priority: "URGENT", points: 5, done: true },
          { title: "Historique des prélèvements", type: "Feature", priority: "MEDIUM", points: 5, done: true },
          { title: "Prorata faux sur année bissextile", type: "Bug", priority: "HIGH", points: 3, done: true },
          { title: "Téléchargement des avis d'échéance", type: "Feature", priority: "MEDIUM", points: 5, done: true },
          { title: "Compression des pièces à l'envoi", type: "Task", priority: "MEDIUM", points: 5, done: false },
          { title: "Relance d'impayé", type: "Feature", priority: "LOW", points: 5, done: false },
          { title: "Double prélèvement au réessai", type: "Bug", priority: "URGENT", points: 5, done: false },
        ],
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Sprint 5 · Sécurité et exploitation",
      notes: [
        {
          title: "Audit de sécurité externe — restitution",
          type: "FINDING", domain: "AUDITS", tags: ["audit", "securite"],
          content: md(
            "Audit mené par un tiers (15 k€, prévu au budget).",
            "",
            "| Constat | Gravité | Suite |",
            "| --- | --- | --- |",
            "| Énumération de comptes via le message de réinitialisation | Élevée | Corrigé — message identique dans tous les cas |",
            "| Absence de limitation de débit sur la connexion | Élevée | Corrigé |",
            "| Jeton de rafraîchissement non révoqué à la déconnexion | Moyenne | Corrigé |",
            "| En-têtes de sécurité incomplets | Faible | Corrigé |",
            "",
            "**Aucun constat critique.** Le choix de ne pas stocker les IBAN",
            "([[ADR — Pas de stockage des coordonnées bancaires]]) a réduit le périmètre d'audit.",
            "",
            "Rattaché à [[09 · Audits]]",
            "",
            "#audit #securite",
          ),
        },
        {
          title: "Plan de reprise d'activité",
          type: "DOC", domain: "PCA_PRA", tags: ["pra"],
          content: md(
            "- **RTO** 4 h · **RPO** 15 min.",
            "- Sauvegarde continue, restauration **testée tous les mois** — une sauvegarde jamais restaurée",
            "  n'est pas une sauvegarde.",
            "- L'ancien extranet reste disponible en repli jusqu'à la bascule complète.",
            "",
            "Rattaché à [[11 · PCA / PRA]] · voir [[Runbook — restauration de la base]]",
            "",
            "#pra",
          ),
        },
        {
          title: "Runbook — restauration de la base",
          type: "RUNBOOK", domain: "RUNBOOKS", tags: ["runbook", "pra"],
          content: md(
            "1. Geler les écritures (mode maintenance).",
            "2. Restaurer le dernier point de sauvegarde antérieur à l'incident.",
            "3. Rejouer le journal des transactions jusqu'à l'horodatage cible.",
            "4. Vérifier trois contrats témoins **avant** de rouvrir les écritures.",
            "",
            "Durée observée au dernier test : **2 h 40**, sous le RTO de 4 h.",
            "",
            "Rattaché à [[10 · Runbooks]]",
            "",
            "#runbook #pra",
          ),
        },
        {
          title: "Astreinte et supervision",
          type: "SOP", domain: "OPERATIONS", tags: ["astreinte", "ops"],
          content: md(
            "Le SRE est à 30 % : l'astreinte est **partagée** avec les deux devs backend, formés aux runbooks.",
            "",
            "Alertes retenues, volontairement peu nombreuses — une alerte qu'on ignore est pire que pas d'alerte :",
            "connexion en échec, file d'attestations saturée, prélèvement en erreur, espace disque.",
            "",
            "Rattaché à [[08 · Opérations]] · voir [[Équipe et rôles]]",
            "",
            "#astreinte #ops",
          ),
        },
      ],
      cycle: {
        name: "Sprint 5 · Sécurité et exploitation",
        start: "2026-06-01", end: "2026-06-12", close: true,
        issues: [
          { title: "Énumération de comptes à la réinitialisation", type: "Bug", priority: "URGENT", points: 3, done: true },
          { title: "Limitation de débit sur la connexion", type: "Feature", priority: "URGENT", points: 5, done: true },
          { title: "Révocation du jeton à la déconnexion", type: "Bug", priority: "HIGH", points: 3, done: true },
          { title: "En-têtes de sécurité", type: "Task", priority: "MEDIUM", points: 2, done: true },
          { title: "Supervision et alertes", type: "Task", priority: "HIGH", points: 5, done: true },
          { title: "Test de restauration mensuel", type: "Task", priority: "HIGH", points: 5, done: true },
          { title: "Chiffrement des pièces au repos", type: "Task", priority: "HIGH", points: 5, done: true },
          { title: "Second facteur sur action sensible", type: "Feature", priority: "HIGH", points: 8, done: false },
          { title: "Purge RGPD après résiliation", type: "Feature", priority: "MEDIUM", points: 5, done: false },
        ],
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    {
      label: "Sprint 6 · Notifications et bascule",
      notes: [
        {
          title: "Retours de la première cohorte",
          type: "FINDING", domain: "UTILISATEUR", tags: ["utilisateur", "bascule"],
          content: md(
            "5 000 assurés basculés pendant deux semaines.",
            "",
            "- Appels de niveau 1 : **−41 %** sur le périmètre basculé. Objectif à 6 mois : −50 %.",
            "- L'attestation représente **la moitié** des usages du portail. L'arbitrage de",
            "  [[Priorités et arbitrages]] était le bon.",
            "- **Irritant neuf** : les assurés ne trouvent pas le suivi de sinistre depuis le tableau de bord.",
            "  Ce n'est pas un défaut, c'est un problème de mise en avant.",
            "",
            "Rattaché à [[15 · Utilisateur]]",
            "",
            "#utilisateur #bascule",
          ),
        },
        {
          title: "Dette technique assumée à la livraison",
          type: "FINDING", domain: "AUDITS", tags: ["dette"],
          content: md(
            "Ce qu'on livre en connaissance de cause, pour que la DSI ne le découvre pas :",
            "",
            "- **Import des contrats** : traitement nocturne complet, pas d'incrémental. Tient jusqu'à",
            "  ~100 000 contrats, au-delà il faudra le reprendre.",
            "- **Recherche** : `LIKE` en base, pas de moteur d'indexation. Suffisant à 40 000 assurés.",
            "- **Pièces justificatives** : pas de compression (cf. [[Coûts d'hébergement — relevé à mi-parcours]]).",
            "",
            "Rien de tout cela n'est un oubli — chaque point est un arbitrage de délai, tracé ici.",
            "",
            "Rattaché à [[09 · Audits]]",
            "",
            "#dette",
          ),
        },
        {
          title: "Bilan budgétaire à la livraison",
          type: "DOC", domain: "ROADMAP", tags: ["budget", "finance", "bilan"],
          content: md(
            "| Poste | Budgété | Réalisé | Écart |",
            "| --- | --- | --- | --- |",
            "| Équipe | 295 k€ | 288 k€ | −7 k€ |",
            "| Hébergement (12 mois) | 30 k€ | 38 k€ | **+8 k€** |",
            "| Audit externe | 15 k€ | 15 k€ | 0 |",
            "| **Total** | **340 k€** | **341 k€** | **+1 k€** |",
            "",
            "L'équipe a compensé le dépassement infra en livrant sous l'estimation.",
            "Le dépassement vient du stockage des pièces, identifié au sprint 4 et non corrigé :",
            "l'arbitrage a été de livrer à l'heure plutôt que d'économiser 8 k€.",
            "",
            "Rattaché à [[13 · Roadmap]] · voir [[Budget et phasage]]",
            "",
            "#budget #finance #bilan",
          ),
        },
      ],
      cycle: {
        name: "Sprint 6 · Notifications et bascule",
        start: "2026-06-15", end: "2026-06-26", close: false, // en cours → montre le relevé vivant
        issues: [
          { title: "Notifications par e-mail", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Centre de notifications", type: "Feature", priority: "MEDIUM", points: 8, done: true },
          { title: "Préférences de notification", type: "Feature", priority: "MEDIUM", points: 3, done: true },
          { title: "Bascule de la première cohorte", type: "Task", priority: "URGENT", points: 8, done: true },
          { title: "Mise en avant du suivi de sinistre", type: "Feature", priority: "HIGH", points: 3, done: false },
          { title: "Notification perdue au redémarrage", type: "Bug", priority: "HIGH", points: 5, done: false },
          { title: "Bascule de la deuxième cohorte", type: "Task", priority: "HIGH", points: 5, done: false },
          { title: "Traduction des e-mails", type: "Task", priority: "LOW", points: 3, done: false },
        ],
      },
    },
  ],
};

/** Le projet secondaire : petit, joué tranquillement — il sert de contraste et de voisin. */
export const SIDE = {
  name: "App Mobile Meridian",
  identifier: process.env.PROJECT_IDENTIFIER_2 ?? "MOB",
  description: "Application mobile compagnon du portail. Une équipe réduite, un périmètre volontairement étroit.",
  phases: [
    {
      label: "Cadrage mobile",
      notes: [
        {
          title: "Périmètre volontairement étroit de l'app mobile",
          type: "DOC", domain: "PRODUIT", tags: ["produit", "mobile"],
          content: md(
            "L'app ne fait que trois choses : voir ses contrats, télécharger une attestation, suivre un sinistre.",
            "",
            "Tout le reste renvoie au portail. Une app qui fait tout serait un second produit à maintenir",
            "pour une équipe qui n'en a pas les moyens.",
            "",
            "Rattaché à [[02 · Produit]]",
            "",
            "#produit #mobile",
          ),
        },
        {
          title: "Choix du framework mobile",
          type: "DECISION", domain: "ARCHITECTURE", tags: ["adr", "mobile"],
          content: md(
            "## Décision",
            "Une base de code partagée iOS/Android plutôt que deux applications natives.",
            "",
            "## Pourquoi",
            "Deux devs mobiles. Deux natives, c'est deux fois le travail pour un public qui ne verra pas",
            "la différence sur un usage trimestriel.",
            "",
            "Rattaché à [[03 · Architecture]]",
            "",
            "#adr #mobile",
          ),
        },
      ],
      cycle: {
        name: "Sprint 1 · Socle mobile",
        start: "2026-06-01", end: "2026-06-12", close: true,
        issues: [
          { title: "Écran de connexion", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Navigation par onglets", type: "Feature", priority: "MEDIUM", points: 3, done: true },
          { title: "Stockage sécurisé du jeton", type: "Task", priority: "HIGH", points: 3, done: true },
          { title: "Liste des contrats", type: "Feature", priority: "MEDIUM", points: 5, done: true },
          { title: "Téléchargement d'attestation", type: "Feature", priority: "HIGH", points: 5, done: true },
          { title: "Crash au démarrage sur Android 12", type: "Bug", priority: "URGENT", points: 2, done: true },
          { title: "Mode hors-ligne", type: "Feature", priority: "LOW", points: 8, done: false },
        ],
      },
    },
  ],
};

/**
 * Les notes **transverses** — le cas qu'un découpage exclusif ne sait pas dire. Une décision d'archi
 * vaut pour deux produits à la fois ; dans le graphe, les deux cellules s'étirent vers elle et se
 * chevauchent : l'intersection *est* l'information.
 */
export const CROSS_NOTES = [
  {
    title: "ADR — Jeton d'accès partagé entre le portail et l'app mobile",
    type: "ADR", domain: "ARCHITECTURE", projects: ["PORT", "MOB"], tags: ["adr", "auth"],
    content: md(
      "## Décision",
      "Un seul mécanisme de jeton pour le portail et l'application mobile.",
      "",
      "## Pourquoi",
      "Les deux consomment la même API. Un second mécanisme dupliquerait la surface d'attaque",
      "et le travail d'audit, pour aucun gain fonctionnel.",
      "",
      "## Conséquence",
      "Toute évolution du cycle de vie du jeton engage **les deux produits** — et donc deux plannings.",
      "",
      "Rattaché à [[03 · Architecture]] · voir [[ADR — Authentification par jeton court + rafraîchissement]]",
      "",
      "#adr #auth",
    ),
  },
  {
    title: "Contrat d'API commun portail / mobile",
    type: "DOC", domain: "API", projects: ["PORT", "MOB"], tags: ["api"],
    content: md(
      "Les deux clients consomment la même `/v1`. Toute rupture de contrat casse les deux.",
      "",
      "Règle : on **ajoute**, on ne retire jamais dans une version. Un retrait ouvre une `/v2`.",
      "",
      "Rattaché à [[05 · API]] · voir [[Charte de l'API publique]]",
      "",
      "#api",
    ),
  },
  {
    title: "Politique de gestion des incidents",
    type: "SOP", domain: "OPERATIONS", projects: ["PORT", "MOB"], tags: ["ops", "incident"],
    content: md(
      "Même astreinte, mêmes niveaux de gravité, mêmes runbooks pour les deux produits.",
      "",
      "L'équipe est trop petite pour deux organisations d'astreinte distinctes.",
      "",
      "Rattaché à [[08 · Opérations]] · voir [[Astreinte et supervision]]",
      "",
      "#ops #incident",
    ),
  },
];
