# 🎯 PROJECT MANAGEMENT - TASKFORCE

## 📚 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Workflow Git](#workflow-git)
- [Gestion des versions](#gestion-des-versions)
- [Labels](#labels)
- [Pull Requests](#pull-requests)
- [Issues](#issues)
- [CI/CD](#cicd)

---

## 🌟 Vue d'ensemble

Ce projet utilise un workflow Git professionnel avec versioning sémantique automatisé et publication d'images Docker.

### Branches principales

- **`main`** : Production - versions stables uniquement
- **`dev`** : Développement - versions RC (Release Candidate)
- **`feature/*`** : Nouvelles fonctionnalités
- **`fix/*`** : Corrections de bugs
- **`hotfix/*`** : Corrections urgentes en production

---

## 🔀 Workflow Git

### 1. Créer une branche

```bash
# Feature
git checkout dev
git pull origin dev
git checkout -b feature/ma-nouvelle-feature

# Bugfix
git checkout dev
git pull origin dev
git checkout -b fix/correction-bug

# Hotfix (depuis main)
git checkout main
git pull origin main
git checkout -b hotfix/fix-critique
```

### 2. Développer et committer

```bash
git add .
git commit -m "feat: ajout de la nouvelle fonctionnalité"
git push origin feature/ma-nouvelle-feature
```

### 3. Créer une Pull Request

- Ouvrir une PR vers `dev` (ou `main` pour hotfix)
- **OBLIGATOIRE** : Ajouter un label `release:*`
- Remplir le template de PR
- Attendre la validation automatique

---

## 🏷️ Gestion des versions

### Semantic Versioning (SemVer)

Format : `vMAJOR.MINOR.PATCH[-rcX]`

**Exemples :**
- `v1.0.0` - Version stable en production
- `v1.2.3-rc1` - Release Candidate en développement

### Règles d'incrémentation

#### Sur la branche `dev` :

| Label | Changement | Exemple |
|-------|-----------|---------|
| `release:major` | Breaking changes | `v1.0.0-rc1` → `v2.0.0-rc1` |
| `release:minor` | Nouvelles features | `v1.0.0-rc1` → `v1.1.0-rc1` |
| `release:patch` | Bug fixes | `v1.0.0-rc1` → `v1.0.1-rc1` |
| Aucun label release | Incrémente RC | `v1.0.0-rc1` → `v1.0.0-rc2` |

#### Sur la branche `main` :

| Label | Changement | Exemple |
|-------|-----------|---------|
| `release:major` | Breaking changes | `v1.0.0` → `v2.0.0` |
| `release:minor` | Nouvelles features | `v1.0.0` → `v1.1.0` |
| `release:patch` | Bug fixes | `v1.0.0` → `v1.0.1` |

### Validation automatique

✅ **Le système vérifie :**
- Présence d'un label `release:*` (obligatoire)
- Un seul label `release:*` par PR
- Incrémentation valide (max +1 en MAJOR)

❌ **La PR est bloquée si :**
- Aucun label `release:*`
- Plusieurs labels `release:*`
- Saut de version invalide

---

## 🏷️ Labels

### 📦 Release (OBLIGATOIRE)

| Label | Description | Usage |
|-------|-------------|-------|
| `release:major` | ⬆️ Breaking changes | v1.0.0 → v2.0.0 |
| `release:minor` | ✨ Nouvelles features | v1.0.0 → v1.1.0 |
| `release:patch` | 🐛 Bug fixes | v1.0.0 → v1.0.1 |

### 🎯 Type

| Label | Description |
|-------|-------------|
| `type:feature` | Nouvelle fonctionnalité |
| `type:bugfix` | Correction de bug |
| `type:hotfix` | Correction urgente |
| `type:refactor` | Refactoring |
| `type:test` | Tests |
| `type:ci/cd` | CI/CD |

### 🧩 Composants

| Label | Description |
|-------|-------------|
| `backend` | Backend / API |
| `frontend` | Frontend / UI |
| `database` | Base de données |
| `infra` | Infrastructure |
| `security` | Sécurité |
| `performance` | Performance |

### ⚡ Priorité

| Label | Description |
|-------|-------------|
| `priority:critical` | 🔴 À traiter immédiatement |
| `priority:high` | 🟠 À traiter rapidement |
| `priority:medium` | 🟡 Priorité normale |
| `priority:low` | 🟢 Quand possible |

### 📊 Status

| Label | Description |
|-------|-------------|
| `status:ready-for-review` | ✅ Prêt pour review |
| `status:in-progress` | 🚧 En cours |
| `status:blocked` | 🚫 Bloqué |
| `status:needs-info` | ❓ Info manquante |

### 📁 Epics

`epic:admin`, `epic:auth`, `epic:dashboard`, `epic:notifications`, `epic:projects`, `epic:tasks`, `epic:teams`

---

## 🔄 Pull Requests

### Template obligatoire

Chaque PR doit remplir :
1. ✅ Description des changements
2. ✅ Type de changement
3. ✅ **Label `release:*` obligatoire**
4. ✅ Checklist de validation
5. ✅ Issues liées

### Processus de review

1. **Création de la PR**
   - Le bot vérifie les labels
   - Calcule la prochaine version
   - Poste un commentaire avec le numéro de version

2. **Review**
   - Au moins 1 approbation requise
   - Tous les checks CI doivent passer

3. **Merge**
   - Squash and merge recommandé
   - Le tag est créé automatiquement
   - Les images Docker sont publiées

---

## 📝 Issues

### Template disponible

- 🐛 Bug Report
- ✨ Feature Request

### Bonne pratique

- Assigner à un Epic si applicable
- Ajouter les labels appropriés
- Lier aux PR correspondantes

---

## 🚀 CI/CD

### Workflows automatiques

#### 1. Version Management (`version-management.yml`)

**Déclenché sur :** Ouverture/mise à jour de PR

**Actions :**
- ✅ Vérifie la présence d'un label `release:*`
- 🔢 Calcule la prochaine version
- 💬 Poste un commentaire sur la PR

#### 2. Release & Docker Publish (`release.yml`)

**Déclenché sur :** Push sur `dev` ou `main`

**Actions :**
- 🏷️ Crée le tag Git automatiquement
- 🐳 Build et push des images Docker
  - `ghcr.io/OWNER/REPO/backend:vX.Y.Z`
  - `ghcr.io/OWNER/REPO/frontend:vX.Y.Z`
  - `ghcr.io/OWNER/REPO/landing:vX.Y.Z`
- 📦 Crée une GitHub Release

### Images Docker publiées

Chaque merge génère 3 tags par service :
- `vX.Y.Z[-rcX]` - Version spécifique
- `latest` - Dernière version
- `sha-XXXXXXX` - Identifiant du commit

---

## 🎓 Exemples pratiques

### Exemple 1 : Feature sur dev

```bash
git checkout dev
git checkout -b feature/add-user-profile
# ... développement ...
git commit -m "feat: add user profile page"
git push origin feature/add-user-profile
```

**Sur GitHub :**
1. Créer PR vers `dev`
2. Ajouter label `release:minor`
3. Remplir le template
4. Merge → Génère `v1.1.0-rc1`

### Exemple 2 : Bugfix sur dev

```bash
git checkout dev
git checkout -b fix/login-error
# ... correction ...
git commit -m "fix: resolve login timeout issue"
git push origin fix/login-error
```

**Sur GitHub :**
1. Créer PR vers `dev`
2. Ajouter label `release:patch`
3. Merge → Génère `v1.1.1-rc1`

### Exemple 3 : Release en production

```bash
# Créer PR de dev vers main
# Ajouter label release:minor (ou autre)
# Merge → Génère v1.1.0 (sans -rc)
```

---

## ❓ FAQ

### Que faire si j'oublie le label `release:*` ?

La PR sera bloquée. Ajoutez simplement le label approprié.

### Puis-je sauter de v1.0.0 à v3.0.0 ?

Non. Seul +1 en MAJOR est autorisé pour éviter les erreurs.

### Comment gérer un hotfix urgent ?

```bash
git checkout main
git checkout -b hotfix/critical-fix
# ... fix ...
git push
# PR vers main avec label release:patch
```

---

## 📞 Support

Pour toute question sur le workflow :
- Consulter cette documentation
- Ouvrir une issue avec le label `type:ci/cd`
- Contacter l'équipe DevOps

---

**Version de ce document :** 1.0.0  
**Dernière mise à jour :** 2026-01-26
