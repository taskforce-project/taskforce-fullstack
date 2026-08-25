---
title: Profil & sécurité
subtitle: Votre compte, votre apparence, votre sécurité.
---

Tous vos réglages personnels vivent dans les **Paramètres** (barre latérale) — un grand panneau à
navigation latérale, organisé en deux groupes : **Personnel** et **Espace de travail**.

## Profil

Votre **profil** rassemble votre **nom**, votre **avatar**, votre **rôle** et vos **compétences**.
Ces compétences — renseignées à l'[onboarding](/guides/onboarding-et-profil) — alimentent
l'[assignation intelligente](/guides/smart-assign) ; les tenir à jour améliore les suggestions.

## Compte & apparence

- **Compte** — votre email et votre **langue** d'interface.
- **Apparence** — le **thème clair / sombre**, la **taille de police**, et des **modes daltonisme**
  (protanopie, deutéranopie, tritanopie) pour l'accessibilité.
- **Notifications** — ce qui vous notifie, et par quel canal. → [Notifications & préférences](/guides/notifications)

{/* SCREENSHOT: parametres-profil — le panneau Paramètres (navigation + section Profil) */}

## Sécurité

Votre authentification est **sécurisée par Keycloak** : le mot de passe et le secret de double
authentification **ne transitent jamais par l'application**.

<Steps>
  <Step title="Mot de passe">
    Depuis **Sécurité**, demandez une **réinitialisation** : un **lien sécurisé** vous est envoyé par
    email pour définir un nouveau mot de passe.
  </Step>
  <Step title="Double authentification (2FA)">
    Activez la **2FA** : vous recevez un email pour **scanner un QR code** avec une application
    d'authentification (TOTP). Une fois active, elle ajoute un code à usage unique à votre connexion.
  </Step>
</Steps>

<Note>
  L'envoi des emails (réinitialisation, activation 2FA) dépend de la configuration mail de votre
  instance. Sur un environnement sans SMTP configuré, ces envois peuvent être indisponibles.
</Note>

## Confidentialité & données

La section **Confidentialité & données** vous permet d'agir sur **vos données personnelles**
(export, suppression), conformément à vos droits. C'est aussi là que se gère ce qui relève du RGPD
côté compte.

<Tip>
  Les réglages du groupe **Espace de travail** (général, **Usage Cortex**, intégrations, statut) sont
  décrits dans leurs guides respectifs — voir [Offres, facturation & IA](/guides/offres-et-ia) et
  [Intégrations](/guides/integrations).
</Tip>
