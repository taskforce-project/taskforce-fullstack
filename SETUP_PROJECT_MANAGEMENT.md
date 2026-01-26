# 🚀 Setup Initial - GitHub Project Management

## 📋 Étapes d'installation

### 1. Appliquer les labels

```bash
# Installer GitHub CLI si pas déjà fait
# Windows: winget install GitHub.cli
# Mac: brew install gh

# Se connecter
gh auth login

# Appliquer les labels
cd c:\taskforce-project\taskforce-fullstack
gh label create "release:major" --color "d73a4a" --description "⬆️ Breaking changes - Incrémente MAJOR (v1.0.0 -> v2.0.0)"
gh label create "release:minor" --color "0e8a16" --description "✨ New features - Incrémente MINOR (v1.0.0 -> v1.1.0)"
gh label create "release:patch" --color "fbca04" --description "🐛 Bug fixes - Incrémente PATCH (v1.0.0 -> v1.0.1)"
gh label create "type:feature" --color "a2eeef" --description "✨ Nouvelle fonctionnalité"
gh label create "type:bugfix" --color "d73a4a" --description "🐛 Correction de bug"
gh label create "type:hotfix" --color "b60205" --description "🚨 Hotfix urgent en production"
gh label create "type:refactor" --color "fbca04" --description "♻️ Refactoring de code"
gh label create "type:test" --color "1d76db" --description "🧪 Ajout ou modification de tests"
gh label create "type:ci/cd" --color "ededed" --description "⚙️ CI/CD et DevOps"
gh label create "infra" --color "ededed" --description "🏗️ Infrastructure & DevOps"
gh label create "security" --color "b60205" --description "🔒 Sécurité"
gh label create "performance" --color "fbca04" --description "⚡ Performance optimization"
gh label create "status:ready-for-review" --color "0e8a16" --description "✅ Prêt pour review"
gh label create "status:in-progress" --color "fbca04" --description "🚧 En cours de développement"
gh label create "status:blocked" --color "d73a4a" --description "🚫 Bloqué - Nécessite intervention"
gh label create "status:needs-info" --color "d876e3" --description "❓ Informations manquantes"
gh label create "status:on-hold" --color "ededed" --description "⏸️ En attente"
```

### 2. Créer le premier tag

```bash
# Depuis la branche dev
git checkout dev
git tag v0.1.0-rc0
git push origin v0.1.0-rc0
```

### 3. Activer GitHub Actions

Les workflows sont déjà créés dans `.github/workflows/`. GitHub Actions les détectera automatiquement au prochain push.

### 4. Configurer les permissions

**Settings → Actions → General → Workflow permissions :**

- ✅ Read and write permissions
- ✅ Allow GitHub Actions to create and approve pull requests

### 5. Tester le workflow

```bash
# Créer une branche de test
git checkout -b feature/test-workflow

# Faire un changement
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "feat: test workflow"
git push origin feature/test-workflow

# Créer une PR vers dev avec label release:minor
# Le bot devrait commenter avec la version v0.1.0-rc1
```

---

## ✅ Checklist finale

- [ ] Labels créés sur GitHub
- [ ] Premier tag `v0.1.0-rc0` créé
- [ ] Permissions GitHub Actions configurées
- [ ] Workflow testé avec une PR
- [ ] Documentation `PROJECT_MANAGEMENT.md` lue

---

## 📚 Documentation

Consultez [PROJECT_MANAGEMENT.md](./PROJECT_MANAGEMENT.md) pour le guide complet.

---

## 🎯 Prochaines étapes

1. **Créer votre première PR** vers `dev` avec un label `release:*`
2. **Vérifier** que le bot calcule correctement la version
3. **Merger** et vérifier la création du tag et des images Docker
4. **Consulter** GitHub Packages pour voir vos images

Bon développement ! 🚀
