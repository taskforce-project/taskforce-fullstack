# Journal — Tests FRONTEND (C18, cible ≥60 % lignes)

> Démarre **après** le backend (décision 30/06). Ordre : unitaires critiques → component (RTL) → E2E Playwright. Sert aussi de **revue de code** (accessibilité, component-first, fichiers ≤500 lignes).

## Conventions (rappel)

- Vitest + React Testing Library ; `vi.mock` pour `apiClient` (lire `response.data.data`).
- Tester : stores Zustand (logique), services API (mapping/erreurs), composants critiques (états loading/vide/erreur), puis E2E des parcours clés.
- Par unité : nominal + limites + erreurs + variété de données. Assertions vrai **et** faux.
- **Revue couplée** : signaler fichiers >500 lignes (extraire types/fns → pages = `return`), trous d'accessibilité, mocks résiduels.

## État de départ

- Setup Vitest présent (`test`, `test:coverage` dans package.json). Quelques tests utilitaires (`getInitials`, avatars).
- À couvrir : stores (issue/workspace/project…), services (issue/redistribution/smart-assign…), composants (dialogs, board), E2E (login → projet → issue → smart-assign/redistribution).

## Candidats « fichiers >500 lignes » repérés (à extraire, facilite les tests)

- `app/(protected)/[workspace]/members/page.tsx` (~820 lignes) → extraire `InviteMemberDialog`, `MemberRow`, `PendingInvitations`, types.
- _(compléter au fil de la revue)_

## Plan (lots)

| Lot | Cible | Type | Statut |
| - | --- | --- | :--: |
| F-T1 | Services API critiques (`redistribution-service`, `issue-service` smart-assign) — mapping + erreurs | unit | 🔲 |
| F-T2 | Stores Zustand (issue/workspace) — actions, optimisme, patch realtime | unit | 🔲 |
| F-T3 | Composants dialogs (redistribution, bulk-assign) — états + interactions | component (RTL) | 🔲 |
| F-T4 | E2E Playwright — login → board → smart-assign → redistribution | e2e | 🔲 |

## Problèmes rencontrés

- **QF-1** (trouvé en QA-1, corrigé) : `currentUser.id` number vs string → **à couvrir par un test** (non-régression du `canManage`).

## Coverage courant

_(à mesurer au démarrage)_
