# QA-1 / QA-2 — Journal des findings (revue sur seed densifié)

> Passe de revue produit + UI sur `taskforce-demo` (seed densifié 30/06), en préparation des tests.
> Statuts : 🔴 à corriger · 🟡 mineur/à trancher · ✅ corrigé · ℹ️ observation (non-bug).

## Findings

| # | Sévérité | Écran | Description | Statut |
| - | :--: | --- | --- | :--: |
| QF-1 | 🔴→✅ | Membres | **`canManage` toujours faux** : `/api/users/me` sérialise `id` en **number**, mais le front comparait `String(m.userId) === currentUser?.id` (`"1" === 1` → false). Conséquence : gestion des rôles, invitation **et** redistribution masquées **pour le OWNER lui-même**. → Fix : comparer les deux bords en `String()` (page.tsx L592 + L754). Vérifié dans l'UI (boutons réapparaissent) + tsc/eslint. | ✅ |
| QF-2 | ℹ️ | Global | Navigation directe (deep-link) → **loader plein écran** pendant le cold-boot de la SPA (re-hydratation). Attendu ; pas de bug. Éventuel polish : skeleton par route. | ℹ️ |
| QF-3 | 🟡 | Intelligence | KPI « Tasks completed : 13 · **-90 vs last month** » — delta alarmant au **passage de mois** (1er juillet). Donnée réelle et correcte, mais visuellement anxiogène. À trancher : lisser (comparer à J-30 glissant) ou garder. | 🟡 |

## Écrans validés (OK, peuplés, zéro mock)

- **Dashboard** : Operations 4/4, Open 100, Resolved 167/267, courbe throughput journalière. ✅
- **Membres** : 33 membres, rôles, skills, projets, filtres. ✅ (après QF-1)
- **Redistribution (PROD-1.12)** : dialog rend le plan backend (5 moves, from→to, score, Appliquer N). ✅
- **Intelligence/Analytics** : KPIs, throughput hebdo (Opened/Resolved), burndown daté, AI insights (repli), team capacity. ✅

## Notes techniques

- **Type `AuthUser.id: string`** (frontend) ment sur le runtime (`number`). QF-1 corrigé localement ; **piste durable** : soit forcer le back à sérialiser en String, soit `Number()`/`String()` défensif partout. Vérifié : `settings/page.tsx:723` utilise déjà `Number(currentUser?.id)` (OK). Seule la page Membres était touchée.
- Timeouts intermittents des screenshots CDP = flakiness preview/outillage, pas l'app.
