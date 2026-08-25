# Screenshots de la doc — manifeste

Chaque capture illustre une page de la doc Fern. **Convention** : place le fichier PNG ici avec le
**nom exact** de la colonne `id` (ex. `tour-full.png`). Une fois présent, je remplace le repère
`{/* SCREENSHOT: id … */}` de la page par un `<Frame>` qui l'affiche.

## Consignes de capture

- **Langue : Français.** L'app doit être en français (Paramètres → Langue) pour montrer les vrais
  labels (Signaux, Opérations, Ma file…). *Exception : l'onboarding est en anglais dans l'app.*
- **Thème :** clair de préférence (cohérent avec la doc), sauf capture qui illustre le thème sombre.
- **Largeur :** ~1280 px (desktop), fenêtre propre, pas d'infos perso sensibles à l'écran.
- **Données :** un espace **avec du contenu** rend mieux qu'un espace vide (quelques opérations/tâches).

## Lot 1 — Découvrir

| id | Page | Où / quoi capturer |
| --- | --- | --- |
| `premiers-pas-signup` | Premiers pas | `/auth/register` — le formulaire d'inscription |
| `premiers-pas-otp` | Premiers pas | l'écran de saisie du code de vérification |
| `premiers-pas-dashboard` | Premiers pas | le Dashboard d'un espace neuf |
| `onboarding-1-you` | Onboarding & profil | étape « You » du wizard *(compte de test)* |
| `onboarding-2-skills` | Onboarding & profil | étape « Skills », badges suggérés par Cortex *(compte de test)* |
| `tour-full` | Tour de l'interface | vue complète de l'app (Dashboard), barre latérale + barre du haut |
| `tour-ai-panel` | Tour de l'interface | le panneau assistant Cortex ouvert par-dessus le canevas |

## Lot 2 — Organiser le travail

| id | Page | Où / quoi capturer |
| --- | --- | --- |
| `projet-creation` | Espaces & projets | la fenêtre « Créer un projet » (nom, préfixe, couleur, visibilité) |
| `tache-detail` | Issues & tableaux | le panneau de détail d'une tâche (propriétés à droite, activité) |
| `tache-kanban` | Issues & tableaux | la vue Kanban d'une opération (colonnes par statut) |
| `sprint-liste` | Cycles | l'onglet Sprints d'une opération (actif / brouillon / terminé) |
| `roadmap-gantt` | Roadmap | la feuille de route (Gantt) d'un espace, barres de progression |
| `pages-liste` | Pages | l'onglet Pages d'une opération (liste des documents, recherche) |

## Lot 3 — Mon quotidien

| id | Page | Où / quoi capturer |
| --- | --- | --- |
| `dashboard-full` | Tableau de bord | le Dashboard d'un espace **avec du contenu** (cartes, recherche) |
| `signaux-liste` | Boîte de réception | la vue Signaux + ses filtres (Tous / Mentions / Alertes / Assigné à moi) |
| `ma-file` | Mon travail | la vue « Ma file » avec la colonne Assignment (Accept / Decline) |
| `assignation-actions` | Assignations | la ligne « À valider » avec les boutons Accepter / Refuser |

## Lot 4 — Collaborer

| id | Page | Où / quoi capturer |
| --- | --- | --- |
| `membres-liste` | Membres & rôles | la page Membres (personne, rôle, compétences) |
| `invitation-modal` | Inviter son équipe | la fenêtre d'invitation (email + choix du rôle) |
| `equipe-detail` | Équipes | une équipe (identité + liste de ses membres) |
| `notifications-preferences` | Notifications & préférences | la matrice Paramètres → Notifications (événements × canaux) |

## Lot 5 — L'IA (Cortex)

| id | Page | Où / quoi capturer |
| --- | --- | --- |
| `ia-assistant-panel` | Assistant | le panneau de l'assistant Cortex ouvert (conversation) |
| `ia-workflows-dock` | Workflows | le dock des workflows (un job avec son plan et son statut) |
| `ia-spec` | Génération de spec | la proposition de spec générée sur une tâche + action d'approbation |
| `smart-assign` | Smart Assign | la suggestion (recommandé·e + alternatives, scores) |
| `brain-graph` | Mémoire (Brain OS) | la vue graphe du Brain OS (nœuds reliés) — Lab |

> Les lots suivants (Piloter, Compte) ajouteront leurs propres lignes ici au fur et à mesure.
