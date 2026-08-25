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

> Les lots suivants (Organiser, Mon quotidien, Collaborer, IA, Piloter, Compte) ajouteront leurs
> propres lignes ici au fur et à mesure.
