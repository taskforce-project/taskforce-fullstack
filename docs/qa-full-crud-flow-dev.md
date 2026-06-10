# Flow QA complet DEV

## Objectif

Ce document decrit un flow manuel complet pour valider les parcours principaux avec les comptes DEV seedes.
Le but est de couvrir un maximum de CRUD reellement disponible aujourd hui, sans dependre d une inscription manuelle.

## Comptes de test

### Comptes existants

| Usage | Email | Mot de passe |
| --- | --- | --- |
| Admin historique | admin@taskforce.dev | Admin@2024 |
| Compte historique | test@taskforce.dev | Test@2024 |

### Comptes QA seedes

Tous les comptes ci-dessous utilisent le meme mot de passe : `Taskforce@2024`

| Profil | Email | Plan | Usage principal |
| --- | --- | --- | --- |
| user01 | user01@taskforce.dev | PRO | owner principal du workspace QA shared |
| user02 | user02@taskforce.dev | PRO | admin du workspace QA shared |
| user03 | user03@taskforce.dev | FREE | membre standard |
| user04 | user04@taskforce.dev | FREE | membre standard |
| user05 | user05@taskforce.dev | ENTERPRISE | membre standard |
| user06 | user06@taskforce.dev | PRO | membre standard |
| user07 | user07@taskforce.dev | FREE | compte libre pour tests d invitation / retrait |
| user08 | user08@taskforce.dev | ENTERPRISE | owner du workspace QA ops |
| user09 | user09@taskforce.dev | FREE | admin du workspace QA ops |
| user10 | user10@taskforce.dev | PRO | membre du workspace QA ops |

## Etat seed initial

- Chaque compte user01 -> user10 possede son workspace personnel.
- qa-shared-workspace est preconfigure ainsi :
  - user01 = OWNER
  - user02 = ADMIN
  - user03, user04, user05, user06 = MEMBER
  - user07 n y est pas encore pour servir de cible d invitation / suppression
- qa-ops-workspace est preconfigure ainsi :
  - user08 = OWNER
  - user09 = ADMIN
  - user10 = MEMBER
- Les canaux general et announcements existent deja dans les workspaces collaboratifs.
- Deux messages initiaux sont seedes dans qa-shared-workspace pour verifier le chargement du chat.

## Flow principal recommande

### 1. Connexion et selection du workspace

1. Se connecter avec user01@taskforce.dev.
2. Verifier l acces a user01-workspace et qa-shared-workspace.
3. Basculer sur qa-shared-workspace.
4. Verifier que user08 ne voit pas qa-shared-workspace depuis son compte.

### 2. CRUD membres du workspace

1. Depuis qa-shared-workspace, ouvrir Members avec user01.
2. Inviter user07@taskforce.dev.
3. Se connecter avec user07 et verifier que qa-shared-workspace apparait.
4. Revenir sur user01 et promouvoir user07 en ADMIN.
5. Se connecter avec user07 et verifier qu il peut inviter ou retirer un MEMBER.
6. Revenir sur user01 et retrograder user07 en MEMBER.
7. Retirer user07 du workspace.
8. Se reconnecter avec user07 et verifier que qa-shared-workspace n apparait plus.

### 3. CRUD equipes

1. Se connecter avec user01 ou user02 dans qa-shared-workspace.
2. Creer une equipe nommee Platform Core.
3. Ouvrir les settings de l equipe et modifier le nom / la description.
4. Ajouter quelques membres a l equipe si l UI les propose dans le contexte actuel.
5. Retirer au moins un membre non lead.
6. Supprimer l equipe.

### 4. CRUD projets

1. Creer un projet Sandbox QA avec un identifiant court unique, par exemple QA1.
2. Verifier son apparition dans la liste des projets.
3. Ouvrir le projet puis modifier son nom, sa description et son statut.
4. Tester l archivage.
5. Reactiver le projet si le menu du layout le permet.
6. Supprimer le projet depuis la page settings du projet.

### 5. CRUD membres du projet

1. Recreer un projet de test si le projet precedent a ete supprime.
2. Ouvrir l onglet Members du projet.
3. Inviter user03 puis user07.
4. Verifier leur apparition dans la liste.
5. Retirer user07 du projet.
6. Noter que le changement de role du membre de projet n est pas encore cable dans l UI actuelle.

### 6. CRUD labels du projet

1. Ouvrir les settings du projet.
2. Creer au moins 3 labels (bug, backend, urgent).
3. Modifier au moins un libelle et une couleur.
4. Supprimer un label.
5. Verifier que les labels restants sont disponibles dans les formulaires d issue.

### 7. CRUD issues

1. Creer une issue depuis le projet.
2. Renseigner titre, description, priorite, statut, labels et assignee.
3. Ouvrir l issue detail ou la sheet d issue.
4. Modifier le titre, la description, le statut et la priorite.
5. Ajouter puis retirer des labels.
6. Ajouter au moins une piece jointe dans l onglet Attachments de la sheet.
7. Supprimer la piece jointe.
8. Supprimer l issue.

### 8. Cycles

1. Creer un cycle sur le projet.
2. Verifier son apparition dans la page Cycles.
3. Associer des issues au cycle si le flux du projet le permet.
4. Supprimer le cycle.
5. Noter que l action Edit cycle est visible dans le menu mais n est pas encore branchee a un vrai formulaire dans l UI actuelle.

### 9. Pages projet

1. Ouvrir l espace Pages du projet.
2. Creer une page de documentation.
3. Ouvrir la page et modifier son contenu.
4. Sauvegarder puis verifier la persistence apres refresh.
5. Noter que la suppression de page existe cote store / API mais n est pas exposee dans l UI actuelle.

### 10. Discussions workspace

1. Ouvrir Discussions dans qa-shared-workspace.
2. Creer une discussion de type IDEA.
3. Creer une discussion de type ANNOUNCEMENT.
4. Pinner une discussion.
5. Locker une discussion.
6. Supprimer une discussion.

### 11. Messages workspace

1. Ouvrir Messages dans qa-shared-workspace avec user01.
2. Verifier que les canaux general et announcements existent.
3. Envoyer un message dans general.
4. Ouvrir une seconde session avec user02 et verifier la reception.
5. Supprimer un message.
6. Verifier le bandeau de statut temps reel en cas de fallback SockJS.
7. Noter que la creation de canal et l edition de message ne sont pas encore branchees dans l UI actuelle.

### 12. Profil et settings utilisateur

1. Ouvrir Settings > Profile avec user01.
2. Modifier display name, prenom, nom ou avatar.
3. Sauvegarder puis verifier la mise a jour dans l interface.
4. Refaire une verification rapide avec user02 pour confirmer l isolation des profils.

## Verification permissions minimale

| Cas | Resultat attendu |
| --- | --- |
| user01 sur qa-shared-workspace | peut inviter, promouvoir, retrograder, retirer |
| user02 sur qa-shared-workspace | peut gerer des membres standards, mais pas modifier un OWNER |
| user03 sur qa-shared-workspace | lecture / actions limitees selon les ecrans |
| user07 hors invitation | ne voit pas qa-shared-workspace |
| user08 sur qa-ops-workspace | ne voit pas les donnees de qa-shared-workspace |

## Gaps fonctionnels visibles a garder en tete

- Edition de cycle : action visible, branchement UI incomplet.
- Suppression de page : disponible cote store / API, non exposee dans l UI actuelle.
- Creation / gestion des canaux de chat : service API existe, UI non branchee.
- Edition de message : placeholder uniquement.
- Changement de role d un membre de projet : placeholder dans l UI actuelle.

## Strategie de passage

- Faire le flow principal une premiere fois avec user01 comme fil conducteur.
- Rejouer uniquement les etapes permissions avec user02, user03, user07 et user08.
- Si un comportement diverge, consigner l etape precise, le compte utilise, le workspace, le projet et le resultat reel.
